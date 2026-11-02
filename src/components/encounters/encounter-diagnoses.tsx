"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Bone, Pencil, Stethoscope, Trash2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import {
  removeDiagnosis,
  updateDiagnosis,
} from "@/app/[locale]/(app)/encounters/actions";
import {
  DIAGNOSIS_COURSES,
  DIAGNOSIS_STATUSES,
  LATERALITIES,
} from "@/app/[locale]/(app)/encounters/schema";
import { DiagnosisDialog } from "@/components/patients/profile/diagnosis-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  isSkeletonMark,
  makeSkeletonMarkNotes,
  skeletonMarkBoneName,
  skeletonMarkDisplayName,
  skeletonMarkDisplayNote,
  SKELETON_CODE_SYSTEM,
  type SkeletonMarkSource,
} from "@/lib/skeleton-marks";

export type EncounterDiagnosisItem = SkeletonMarkSource & {
  code: string | null;
  status: string;
  course: string;
  laterality: string;
  isPrimary: boolean;
  isDifferential: boolean;
};

type EditState = {
  id: string;
  name: string;
  code: string;
  status: string;
  course: string;
  laterality: string;
  notes: string;
  isPrimary: boolean;
  isDifferential: boolean;
  skeleton: boolean;
  boneName: string;
};

export function EncounterDiagnoses({
  encounterId,
  patientId,
  encounterType,
  encounterStatus,
  encounterCreatedAt,
  diagnoses,
  canEdit,
}: {
  encounterId: string;
  patientId: string;
  encounterType: string;
  encounterStatus: string;
  encounterCreatedAt: string;
  diagnoses: EncounterDiagnosisItem[];
  canEdit: boolean;
}) {
  const t = useTranslations("encounters");
  const tp = useTranslations("patients");
  const tc = useTranslations("common");
  const router = useRouter();
  const [items, setItems] = useState(diagnoses);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    setItems(diagnoses);
  }, [diagnoses]);

  function openEdit(item: EncounterDiagnosisItem) {
    setEditing({
      id: item.id,
      name: isSkeletonMark(item) ? skeletonMarkDisplayName(item) : item.name,
      code: item.code ?? "",
      status: item.status,
      course: item.course,
      laterality: item.laterality,
      notes: isSkeletonMark(item) ? skeletonMarkDisplayNote(item) : item.notes ?? "",
      isPrimary: item.isPrimary,
      isDifferential: item.isDifferential,
      skeleton: isSkeletonMark(item),
      boneName: isSkeletonMark(item) ? skeletonMarkBoneName(item) : "",
    });
  }

  async function submitEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editing || !editing.name.trim()) return;

    setEditBusy(true);
    const notes = editing.skeleton
      ? makeSkeletonMarkNotes(editing.boneName, editing.notes)
      : editing.notes;
    try {
      const res = await updateDiagnosis(editing.id, {
        name: editing.name.trim(),
        code: editing.code,
        status: editing.status,
        course: editing.course,
        laterality: editing.laterality,
        notes,
        codeSystem: editing.skeleton ? SKELETON_CODE_SYSTEM : undefined,
        isPrimary: editing.isPrimary,
        isDifferential: editing.isDifferential,
      });
      if (res.ok) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === editing.id
              ? {
                  ...item,
                  name: editing.name.trim(),
                  code: editing.code || null,
                  status: editing.status,
                  course: editing.course,
                  laterality: editing.laterality,
                  notes: notes ?? null,
                  codeSystem: editing.skeleton ? SKELETON_CODE_SYSTEM : item.codeSystem,
                  isPrimary: editing.isPrimary,
                  isDifferential: editing.isDifferential,
                }
              : item,
          ),
        );
        setEditing(null);
        toast.success(t("diagnosisUpdated"));
        router.refresh();
      } else {
        toast.error(t("savedFailed"));
      }
    } catch {
      toast.error(t("savedFailed"));
    } finally {
      setEditBusy(false);
    }
  }

  async function remove(id: string) {
    setDeleting(id);
    try {
      const res = await removeDiagnosis(id);
      if (res.ok) {
        setItems((prev) => prev.filter((item) => item.id !== id));
        toast.success(t("diagnosisDeleted"));
        router.refresh();
      } else {
        toast.error(t("savedFailed"));
      }
    } catch {
      toast.error(t("savedFailed"));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5">
        <div>
          <p className="text-sm font-medium leading-tight">{t("recordedDiagnoses")}</p>
          <p className="text-xs text-muted-foreground">{t("recordedDiagnosesHint")}</p>
        </div>
        {canEdit && (
          <DiagnosisDialog
            patientId={patientId}
            encounters={[
              {
                id: encounterId,
                type: encounterType,
                status: encounterStatus,
                createdAt: encounterCreatedAt,
              },
            ]}
            defaultEncounterId={encounterId}
          />
        )}
      </div>

      {items.length === 0 ? (
        <p className="px-3 py-4 text-sm text-muted-foreground">{t("noRecordedDiagnoses")}</p>
      ) : (
        <ul className="divide-y">
          {items.map((item) => {
            const skeleton = isSkeletonMark(item);
            const name = skeleton ? skeletonMarkDisplayName(item) : item.name;
            const note = skeleton ? skeletonMarkDisplayNote(item) : item.notes;
            return (
              <li key={item.id} className="flex items-start gap-2.5 px-3 py-2.5">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  {skeleton ? <Bone className="size-3.5" /> : <Stethoscope className="size-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-sm font-medium">{name}</p>
                    {item.isPrimary && <Badge variant="info">{t("primaryDx")}</Badge>}
                    {item.isDifferential && <Badge variant="outline">{t("differentialDx")}</Badge>}
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    {item.code && <span dir="ltr">{item.code}</span>}
                    <span>{t(`diagnosisStatus_${item.status}`)}</span>
                    {item.laterality !== "NOT_APPLICABLE" && (
                      <span>{t(`laterality_${item.laterality}`)}</span>
                    )}
                  </p>
                  {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
                </div>
                {canEdit && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("editDiagnosis")}
                      onClick={() => openEdit(item)}
                    >
                      <Pencil />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t("deleteDiagnosis")}
                          disabled={deleting === item.id}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("deleteDiagnosis")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("deleteDiagnosisDesc")}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                          <AlertDialogAction
                            disabled={deleting === item.id}
                            onClick={(event) => {
                              event.preventDefault();
                              void remove(item.id);
                            }}
                          >
                            {deleting === item.id ? tc("deleting") : tc("delete")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent size="default" className="flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("editDiagnosis")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitEdit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="dx-edit-name">{t("diagnosisName")}</Label>
              <Input
                id="dx-edit-name"
                value={editing?.name ?? ""}
                onChange={(event) =>
                  setEditing((prev) => (prev ? { ...prev, name: event.target.value } : prev))
                }
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="dx-edit-code">{t("icdCode")}</Label>
                <Input
                  id="dx-edit-code"
                  value={editing?.code ?? ""}
                  onChange={(event) =>
                    setEditing((prev) => (prev ? { ...prev, code: event.target.value } : prev))
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>{t("status")}</Label>
                <Select
                  value={editing?.status}
                  onValueChange={(value) =>
                    setEditing((prev) => (prev ? { ...prev, status: value } : prev))
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DIAGNOSIS_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {t(`diagnosisStatus_${status}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>{t("course")}</Label>
                <Select
                  value={editing?.course}
                  onValueChange={(value) =>
                    setEditing((prev) => (prev ? { ...prev, course: value } : prev))
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DIAGNOSIS_COURSES.map((course) => (
                      <SelectItem key={course} value={course}>
                        {t(`course_${course}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>{t("laterality")}</Label>
                <Select
                  value={editing?.laterality}
                  onValueChange={(value) =>
                    setEditing((prev) => (prev ? { ...prev, laterality: value } : prev))
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LATERALITIES.map((laterality) => (
                      <SelectItem key={laterality} value={laterality}>
                        {t(`laterality_${laterality}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing?.isPrimary ?? false}
                  onChange={(event) =>
                    setEditing((prev) =>
                      prev ? { ...prev, isPrimary: event.target.checked } : prev,
                    )
                  }
                />
                {t("primaryDx")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing?.isDifferential ?? false}
                  onChange={(event) =>
                    setEditing((prev) =>
                      prev ? { ...prev, isDifferential: event.target.checked } : prev,
                    )
                  }
                />
                {t("differentialDx")}
              </label>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dx-edit-notes">{t("notes")}</Label>
              <Textarea
                id="dx-edit-notes"
                rows={3}
                value={editing?.notes ?? ""}
                onChange={(event) =>
                  setEditing((prev) => (prev ? { ...prev, notes: event.target.value } : prev))
                }
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                {tc("cancel")}
              </Button>
              <Button type="submit" disabled={editBusy || !editing?.name.trim()}>
                {editBusy ? tc("saving") : tc("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
