"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Bone, Loader2, TriangleAlert } from "lucide-react";
import type * as Three from "three";
import type { OrbitControls as OrbitControlsImpl } from "three/examples/jsm/controls/OrbitControls.js";
import { useRouter } from "@/i18n/navigation";
import { addDiagnosis, removeDiagnosis } from "@/app/[locale]/(app)/encounters/actions";
import { Badge } from "@/components/ui/badge";

type Laterality = "LEFT" | "RIGHT" | "BILATERAL" | "NOT_APPLICABLE";

type ParsedBone = {
  name: string;
  laterality: Laterality;
};

const NON_BONE = /cartilage|sinus|\btooth\b|\bteeth\b|incisor|canine|premolar|molar|cells? of/i;

function parseBoneName(raw: string): ParsedBone | null {
  let base = raw.replace(/\.\d{3}$/, "").trim();
  let laterality: Laterality = "NOT_APPLICABLE";

  if (/\.r$/i.test(base)) {
    laterality = "RIGHT";
    base = base.replace(/\.r$/i, "");
  } else if (/\.l$/i.test(base)) {
    laterality = "LEFT";
    base = base.replace(/\.l$/i, "");
  } else if (/^right\b/i.test(base)) {
    laterality = "RIGHT";
    base = base.replace(/^right\s+/i, "");
  } else if (/^left\b/i.test(base)) {
    laterality = "LEFT";
    base = base.replace(/^left\s+/i, "");
  }

  if (NON_BONE.test(base)) return null;

  base = base.replace(/\./g, " ").replace(/\s+/g, " ").trim();
  if (!base) return null;

  const suffix =
    laterality === "RIGHT" ? " (right)" : laterality === "LEFT" ? " (left)" : "";

  return {
    name: `${base.charAt(0).toUpperCase()}${base.slice(1)}${suffix}`,
    laterality,
  };
}

export function SkeletonDiagnosis({
  encounterId,
  existingNames,
}: {
  encounterId: string;
  existingNames: string[];
}) {
  const t = useTranslations("encounters");
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onBoneRef = useRef<(bone: ParsedBone) => void>(() => {});
  const knownRef = useRef<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [localNames, setLocalNames] = useState<string[]>([]);
  const [saving, setSaving] = useState<string[]>([]);

  useEffect(() => {
    knownRef.current = new Set(
      [...existingNames, ...localNames].map((name) => name.trim().toLowerCase()),
    );
  }, [existingNames, localNames]);

  const addBone = useCallback(
    async (bone: ParsedBone) => {
      if (knownRef.current.has(bone.name.toLowerCase())) {
        toast.info(t("skeleton3dAlready", { name: bone.name }));
        return;
      }

      setSaving((prev) => (prev.includes(bone.name) ? prev : [...prev, bone.name]));

      try {
        const res = await addDiagnosis(encounterId, {
          name: bone.name,
          classification: "LOCAL",
          status: "PROVISIONAL",
          course: "ACUTE",
          laterality: bone.laterality,
          notes: "Added from 3D skeleton model",
        });

        if (!res.ok) {
          toast.error(t("skeleton3dFailed"));
          return;
        }

        knownRef.current.add(bone.name.toLowerCase());
        setLocalNames((prev) => (prev.includes(bone.name) ? prev : [...prev, bone.name]));
        router.refresh();

        toast.success(t("skeleton3dAdded", { name: bone.name }), {
          action: {
            label: t("skeleton3dUndo"),
            onClick: async () => {
              const undo = await removeDiagnosis(res.id);
              if (undo.ok) {
                setLocalNames((prev) => prev.filter((name) => name !== bone.name));
                router.refresh();
              }
            },
          },
        });
      } catch {
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
    let model: Three.Object3D | null = null;
    let baseMaterial: Three.MeshStandardMaterial | null = null;
    let highlightMaterial: Three.MeshStandardMaterial | null = null;
    let highlighted: Three.Mesh | null = null;
    let highlightOriginal: Three.Material | Three.Material[] | null = null;
    let highlightTimer: ReturnType<typeof setTimeout> | null = null;
    let resizeObserver: ResizeObserver | null = null;

    (async () => {
      try {
        const THREE = await import("three");
        const [{ GLTFLoader }, { OrbitControls }] = await Promise.all([
          import("three/examples/jsm/loaders/GLTFLoader.js"),
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

          if (highlighted) {
            highlighted.material = highlightOriginal ?? baseMaterial!;
          }
          if (highlightTimer) clearTimeout(highlightTimer);
          highlighted = hit;
          highlightOriginal = hit.material;
          hit.material = highlightMaterial!;
          highlightTimer = setTimeout(() => {
            if (highlighted === hit) {
              hit.material = highlightOriginal ?? baseMaterial!;
              highlighted = null;
              highlightOriginal = null;
            }
          }, 1200);

          onBoneRef.current(hit.userData.bone as ParsedBone);
        };

        renderer.domElement.addEventListener("pointerdown", onPointerDown);
        renderer.domElement.addEventListener("pointerup", onPointerUp);

        const loader = new GLTFLoader();
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
            model.traverse((object) => {
              const mesh = object as Three.Mesh;
              if (!mesh.isMesh) return;
              mesh.material = baseMaterial!;
              mesh.castShadow = false;
              mesh.receiveShadow = false;

              const bone = parseBoneName(mesh.name);
              if (bone) mesh.userData.bone = bone;
            });

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
      controls?.dispose();
      model?.traverse((object) => {
        const mesh = object as Three.Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
      baseMaterial?.dispose();
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
        {localNames.length > 0 && (
          <Badge variant="info">{localNames.length}</Badge>
        )}
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

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
        <span>
          {t("skeleton3dAttribution")}{" "}
          <a
            className="underline underline-offset-2 hover:text-foreground"
            href="https://creativecommons.org/licenses/by-sa/4.0/"
            target="_blank"
            rel="noreferrer"
          >
            CC BY-SA 4.0
          </a>
        </span>
        <span>{t("skeleton3dDisclaimer")}</span>
      </div>
    </section>
  );
}
