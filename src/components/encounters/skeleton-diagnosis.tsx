"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Bone, Loader2, TriangleAlert } from "lucide-react";
import type * as Three from "three";
import type { OrbitControls as OrbitControlsImpl } from "three/examples/jsm/controls/OrbitControls.js";
import type { DRACOLoader as DRACOLoaderImpl } from "three/examples/jsm/loaders/DRACOLoader.js";
import { useRouter } from "@/i18n/navigation";
import { addDiagnosis, removeDiagnosis } from "@/app/[locale]/(app)/encounters/actions";
import { Badge } from "@/components/ui/badge";
import {
  isSkeletonMark,
  makeSkeletonMarkNotes,
  parseBoneName,
  skeletonMarkBoneName,
  SKELETON_CODE_SYSTEM,
  type ParsedBone,
  type SkeletonMarkSource,
} from "@/lib/skeleton-marks";

type Mark = SkeletonMarkSource;

export function SkeletonDiagnosis({
  encounterId,
  diagnoses,
}: {
  encounterId: string;
  diagnoses: SkeletonMarkSource[];
}) {
  const t = useTranslations("encounters");
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onBoneRef = useRef<(bone: ParsedBone) => void>(() => {});
  const knownRef = useRef<Set<string>>(new Set());
  const markedNamesRef = useRef<Set<string>>(new Set());
  const repaintRef = useRef<() => void>(() => {});
  const tRef = useRef(t);
  tRef.current = t;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [marks, setMarks] = useState<Mark[]>(() =>
    diagnoses
      .filter(isSkeletonMark)
      .map(({ id, name, notes, codeSystem }) => ({ id, name, notes, codeSystem })),
  );
  const [saving, setSaving] = useState<string[]>([]);

  useEffect(() => {
    setMarks(
      diagnoses
        .filter(isSkeletonMark)
        .map(({ id, name, notes, codeSystem }) => ({ id, name, notes, codeSystem })),
    );
  }, [diagnoses]);

  useEffect(() => {
    knownRef.current = new Set(marks.map((mark) => skeletonMarkBoneName(mark).toLowerCase()));
    markedNamesRef.current = knownRef.current;
    repaintRef.current();
  }, [marks]);

  const addBone = useCallback(
    async (bone: ParsedBone) => {
      if (knownRef.current.has(bone.name.toLowerCase())) {
        toast.info(t("skeleton3dAlready", { name: bone.name }));
        return;
      }

      knownRef.current.add(bone.name.toLowerCase());
      setSaving((prev) => (prev.includes(bone.name) ? prev : [...prev, bone.name]));

      try {
        const res = await addDiagnosis(encounterId, {
          name: bone.name,
          classification: "LOCAL",
          codeSystem: SKELETON_CODE_SYSTEM,
          status: "PROVISIONAL",
          course: "ACUTE",
          laterality: bone.laterality,
          notes: makeSkeletonMarkNotes(bone.name, ""),
        });

        if (!res.ok) {
          knownRef.current.delete(bone.name.toLowerCase());
          toast.error(t("skeleton3dFailed"));
          return;
        }

        setMarks((prev) =>
          prev.some((mark) => mark.id === res.id)
            ? prev
            : [
                ...prev,
                {
                  id: res.id,
                  name: bone.name,
                  notes: makeSkeletonMarkNotes(bone.name, ""),
                  codeSystem: SKELETON_CODE_SYSTEM,
                },
              ],
        );
        router.refresh();

        toast.success(t("skeleton3dAdded", { name: bone.name }), {
          action: {
            label: t("skeleton3dUndo"),
            onClick: async () => {
              const undo = await removeDiagnosis(res.id);
              if (undo.ok) {
                setMarks((prev) => prev.filter((mark) => mark.id !== res.id));
                router.refresh();
              }
            },
          },
        });
      } catch {
        knownRef.current.delete(bone.name.toLowerCase());
        toast.error(t("skeleton3dFailed"));
      } finally {
        setSaving((prev) => prev.filter((name) => name !== bone.name));
      }
    },
    [encounterId, router, t],
  );

  onBoneRef.current = addBone;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let frame = 0;
    let renderer: Three.WebGLRenderer | null = null;
    let controls: OrbitControlsImpl | null = null;
    let dracoLoader: DRACOLoaderImpl | null = null;
    let model: Three.Object3D | null = null;
    let baseMaterial: Three.MeshStandardMaterial | null = null;
    let markMaterial: Three.MeshStandardMaterial | null = null;
    let highlightMaterial: Three.MeshStandardMaterial | null = null;
    let highlighted: Three.Mesh | null = null;
    let highlightTimer: ReturnType<typeof setTimeout> | null = null;
    let resizeObserver: ResizeObserver | null = null;

    (async () => {
      try {
        const THREE = await import("three");
        const [{ GLTFLoader }, { DRACOLoader }, { OrbitControls }] = await Promise.all([
          import("three/examples/jsm/loaders/GLTFLoader.js"),
          import("three/examples/jsm/loaders/DRACOLoader.js"),
          import("three/examples/jsm/controls/OrbitControls.js"),
        ]);
        if (cancelled) return;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.1;
        renderer.domElement.style.display = "block";
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        renderer.domElement.style.touchAction = "none";
        renderer.domElement.style.cursor = "grab";
        container.appendChild(renderer.domElement);

        scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f98, 2.1));

        const key = new THREE.DirectionalLight(0xffffff, 2.5);
        key.position.set(3, 5, 6);
        scene.add(key);

        const rim = new THREE.DirectionalLight(0x9ed8ff, 1.1);
        rim.position.set(-5, 2, -4);
        scene.add(rim);

        const fill = new THREE.DirectionalLight(0xffe2b8, 0.8);
        fill.position.set(-3, -2, 3);
        scene.add(fill);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.rotateSpeed = 0.8;
        controls.enablePan = false;
        controls.autoRotate = false;

        baseMaterial = new THREE.MeshStandardMaterial({
          color: 0xe9e2d0,
          roughness: 0.68,
          metalness: 0.02,
          side: THREE.DoubleSide,
        });
        markMaterial = new THREE.MeshStandardMaterial({
          color: 0x14b8a6,
          emissive: 0x0f766e,
          emissiveIntensity: 0.8,
          roughness: 0.45,
          metalness: 0.03,
          side: THREE.DoubleSide,
        });
        highlightMaterial = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0x14b8a6,
          emissiveIntensity: 1.1,
          roughness: 0.35,
          metalness: 0.05,
          side: THREE.DoubleSide,
        });

        const resize = () => {
          if (!renderer) return;
          const width = container.clientWidth;
          const height = container.clientHeight;
          if (!width || !height) return;
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        };

        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(container);
        resize();

        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        let downX = 0;
        let downY = 0;
        let down = false;

        const toPointer = (event: PointerEvent) => {
          const rect = renderer!.domElement.getBoundingClientRect();
          pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        };

        const onPointerDown = (event: PointerEvent) => {
          down = true;
          downX = event.clientX;
          downY = event.clientY;
        };

        const onPointerUp = (event: PointerEvent) => {
          if (!down) return;
          down = false;
          if (!model || Math.hypot(event.clientX - downX, event.clientY - downY) > 6) return;

          toPointer(event);
          raycaster.setFromCamera(pointer, camera);
          const hit = raycaster
            .intersectObject(model, true)
            .find((item) => {
              const mesh = item.object as Three.Mesh;
              return mesh.isMesh && Boolean(mesh.userData.bone);
            })?.object as Three.Mesh | undefined;

          if (!hit) return;

          const bone = hit.userData.bone as ParsedBone;
          if (markedNamesRef.current.has(bone.name.toLowerCase())) {
            toast.info(tRef.current("skeleton3dAlready", { name: bone.name }));
            return;
          }

          if (highlightTimer) clearTimeout(highlightTimer);
          highlighted = hit;
          hit.material = highlightMaterial!;
          highlightTimer = setTimeout(() => {
            if (highlighted === hit) {
              highlighted = null;
              repaintRef.current();
            }
          }, 1200);

          onBoneRef.current(bone);
        };

        renderer.domElement.addEventListener("pointerdown", onPointerDown);
        renderer.domElement.addEventListener("pointerup", onPointerUp);

        dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath("/draco/");
        const loader = new GLTFLoader();
        loader.setDRACOLoader(dracoLoader);
        loader.load(
          "/models/skeleton.glb",
          (gltf) => {
            if (cancelled) {
              gltf.scene.traverse((object) => {
                const mesh = object as Three.Mesh;
                if (mesh.isMesh) mesh.geometry.dispose();
              });
              return;
            }

            model = gltf.scene;
            const boneMeshes = new Map<string, Three.Mesh>();

            model.traverse((object) => {
              const mesh = object as Three.Mesh;
              if (!mesh.isMesh) return;
              mesh.material = baseMaterial!;
              mesh.castShadow = false;
              mesh.receiveShadow = false;

              const originalName =
                typeof mesh.userData.name === "string" ? mesh.userData.name : mesh.name;
              const bone = parseBoneName(originalName);
              if (bone) {
                mesh.userData.bone = bone;
                boneMeshes.set(bone.name.toLowerCase(), mesh);
              }
            });

            const applyMarks = () => {
              for (const [name, mesh] of boneMeshes) {
                if (highlighted === mesh) continue;
                mesh.material = markedNamesRef.current.has(name) ? markMaterial! : baseMaterial!;
              }
            };
            repaintRef.current = applyMarks;
            applyMarks();

            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            model.position.sub(center);
            scene.add(model);

            const maxDim = Math.max(size.x, size.y, size.z);
            const distance = maxDim / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);

            camera.near = Math.max(maxDim / 100, 0.001);
            camera.far = maxDim * 100;
            camera.position.set(0, size.y * 0.05, distance * 1.35);
            camera.lookAt(0, 0, 0);
            camera.updateProjectionMatrix();

            controls!.target.set(0, 0, 0);
            controls!.minDistance = distance * 0.35;
            controls!.maxDistance = distance * 2.4;
            controls!.update();

            setLoading(false);
          },
          undefined,
          (loadError) => {
            console.error("Failed to load 3D skeleton", loadError);
            if (!cancelled) {
              setError(true);
              setLoading(false);
            }
          },
        );

        const animate = () => {
          frame = requestAnimationFrame(animate);
          controls?.update();
          if (renderer) renderer.render(scene, camera);
        };
        animate();
      } catch (initError) {
        console.error("Failed to initialise 3D skeleton", initError);
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      if (highlightTimer) clearTimeout(highlightTimer);
      repaintRef.current = () => {};
      controls?.dispose();
      dracoLoader?.dispose();
      model?.traverse((object) => {
        const mesh = object as Three.Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
      baseMaterial?.dispose();
      markMaterial?.dispose();
      highlightMaterial?.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, []);

  return (
    <section className="mt-1 overflow-hidden rounded-lg border bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-md bg-teal-500/10 text-teal-600 dark:text-teal-400">
            <Bone className="size-4" />
          </span>
          <div>
            <p className="text-sm font-medium leading-tight">{t("skeleton3dTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("skeleton3dHint")}</p>
          </div>
        </div>
        {marks.length > 0 && <Badge variant="info">{marks.length}</Badge>}
      </div>

      <div className="relative h-[380px] sm:h-[500px]">
        <div ref={containerRef} className="absolute inset-0" />

        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-50/80 text-sm text-muted-foreground backdrop-blur-sm dark:bg-slate-950/80">
            <Loader2 className="size-5 animate-spin" />
            {t("skeleton3dLoading")}
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-50/90 px-6 text-center text-sm text-muted-foreground dark:bg-slate-950/90">
            <TriangleAlert className="size-5 text-amber-500" />
            {t("skeleton3dError")}
          </div>
        )}

        {saving.length > 0 && (
          <div className="pointer-events-none absolute bottom-3 start-3 flex items-center gap-1.5 rounded-md bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm">
            <Loader2 className="size-3 animate-spin" />
            {saving[saving.length - 1]}
          </div>
        )}
      </div>
    </section>
  );
}
