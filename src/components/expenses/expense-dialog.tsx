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

export type ExpenseValues = {
  id: string;
  description: string;
  amount: number;
  category: string | null;
  paidAt: string;
  notes: string | null;
};

export type ExpenseLabels = {
  add: string;
  edit: string;
  description: string;
  amount: string;
  category: string;
  paidAt: string;
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

function ExpenseForm({
  labels,
  expense,
  loading,
  onSubmit,
}: {
  labels: ExpenseLabels;
  expense?: ExpenseValues;
  loading: boolean;
  onSubmit: (formData: FormData) => void;
}) {
  return (
    <form action={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-1.5">
        <Label>{labels.description}</Label>
        <Input name="description" defaultValue={expense?.description} required />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label>{labels.amount}</Label>
          <Input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            defaultValue={expense?.amount}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label>{labels.category}</Label>
          <Input name="category" defaultValue={expense?.category ?? ""} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label>{labels.paidAt}</Label>
        <Input
          name="paidAt"
          type="date"
          defaultValue={expense?.paidAt ?? today()}
        />
      </div>
      <div className="grid gap-1.5">
        <Label>{labels.notes}</Label>
        <Textarea name="notes" defaultValue={expense?.notes ?? ""} />
      </div>
      <Button type="submit" disabled={loading} className="mt-1">
        <Save className="me-2 size-4" />
        {loading ? labels.saving : labels.save}
      </Button>
    </form>
  );
}

export function ExpenseDialog({
  labels,
  action,
  expense,
  open: controlledOpen,
  onOpenChange,
}: {
  labels: ExpenseLabels;
  action: (formData: FormData) => Promise<void>;
  expense?: ExpenseValues;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const isEdit = Boolean(expense);
  const title = isEdit ? labels.edit : labels.add;

  async function onSubmit(formData: FormData) {
    setLoading(true);
    try {
      await action(formData);
      toast.success(isEdit ? labels.updated : labels.created);
      setOpen(false);
    } catch {
      toast.error(labels.failed);
    } finally {
      setLoading(false);
    }
  }

  const form = (
    <ExpenseForm
      labels={labels}
      expense={expense}
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
