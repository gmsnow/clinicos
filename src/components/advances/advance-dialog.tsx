"use client";

import { useState } from "react";
import { Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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

export type EmployeeOption = { id: string; name: string; nameAr: string | null };

export type AdvanceValues = {
  id: string;
  employeeId: string;
  amount: number;
  reason: string | null;
  givenAt: string;
  notes: string | null;
};

export type AdvanceLabels = {
  add: string;
  edit: string;
  employee: string;
  amount: string;
  reason: string;
  givenAt: string;
  notes: string;
  save: string;
  saving: string;
  cancel: string;
  deleting: string;
  created: string;
  updated: string;
  failed: string;
  delete: string;
  deleteTitle: string;
  deleteDescription: string;
  deleted: string;
  deleteFailed: string;
};

const today = () => new Date().toISOString().slice(0, 10);

function AdvanceForm({
  employees,
  labels,
  advance,
  employeeId,
  onEmployeeChange,
  loading,
  onSubmit,
}: {
  employees: EmployeeOption[];
  labels: AdvanceLabels;
  advance?: AdvanceValues;
  employeeId: string;
  onEmployeeChange: (value: string) => void;
  loading: boolean;
  onSubmit: (formData: FormData) => void;
}) {
  return (
    <form action={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-1.5">
        <Label>{labels.employee}</Label>
        <Select value={employeeId} onValueChange={onEmployeeChange}>
          <SelectTrigger>
            <SelectValue placeholder={labels.employee} />
          </SelectTrigger>
          <SelectContent>
            {employees.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.nameAr ?? e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label>{labels.amount}</Label>
          <Input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            defaultValue={advance?.amount}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label>{labels.givenAt}</Label>
          <Input
            name="givenAt"
            type="date"
            defaultValue={advance?.givenAt ?? today()}
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label>{labels.reason}</Label>
        <Input name="reason" defaultValue={advance?.reason ?? ""} />
      </div>
      <div className="grid gap-1.5">
        <Label>{labels.notes}</Label>
        <Textarea name="notes" defaultValue={advance?.notes ?? ""} />
      </div>
      <Button
        type="submit"
        disabled={loading || !employeeId}
        className="mt-1"
      >
        <Save className="me-2 size-4" />
        {loading ? labels.saving : labels.save}
      </Button>
    </form>
  );
}

export function AdvanceDialog({
  employees,
  labels,
  action,
  advance,
  open: controlledOpen,
  onOpenChange,
}: {
  employees: EmployeeOption[];
  labels: AdvanceLabels;
  action: (formData: FormData) => Promise<void>;
  advance?: AdvanceValues;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [employeeId, setEmployeeId] = useState(advance?.employeeId ?? "");
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const isEdit = Boolean(advance);
  const title = isEdit ? labels.edit : labels.add;

  async function onSubmit(formData: FormData) {
    setLoading(true);
    try {
      formData.set("employeeId", employeeId);
      await action(formData);
      toast.success(isEdit ? labels.updated : labels.created);
      setOpen(false);
      if (!isEdit) setEmployeeId("");
    } catch {
      toast.error(labels.failed);
    } finally {
      setLoading(false);
    }
  }

  const form = (
    <AdvanceForm
      employees={employees}
      labels={labels}
      advance={advance}
      employeeId={employeeId}
      onEmployeeChange={setEmployeeId}
      loading={loading}
      onSubmit={onSubmit}
    />
  );

  if (controlledOpen !== undefined) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="sr-only">{title}</DialogDescription>
          </DialogHeader>
          {form}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="me-2 h-4 w-4" />
          {labels.add}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{title}</DialogDescription>
        </DialogHeader>
        {form}
      </DialogContent>
    </Dialog>
  );
}
