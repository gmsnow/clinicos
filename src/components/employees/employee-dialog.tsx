"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { createUser } from "@/app/[locale]/(app)/users/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Option = { id: string; label: string };

type Labels = {
  add: string;
  name: string;
  nameAr: string;
  username: string;
  email: string;
  password: string;
  role: string;
  department: string;
  phone: string;
  nationalId: string;
  address: string;
  salary: string;
  hireDate: string;
  personalInfo: string;
  accountInfo: string;
  creating: string;
  success: string;
  failed: string;
};

const emptyForm = {
  name: "",
  nameAr: "",
  username: "",
  email: "",
  password: "",
  roleId: "",
  departmentId: "",
  phone: "",
  nationalId: "",
  address: "",
  salary: "",
  hireDate: "",
};

export function EmployeeDialog({
  roles,
  departments,
  labels,
}: {
  roles: Option[];
  departments: Option[];
  labels: Labels;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState(emptyForm);

  const set = (key: keyof typeof emptyForm, value: string) =>
    setF((s) => ({ ...s, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name || !f.username || !f.email || !f.password || !f.roleId) return;
    setBusy(true);
    try {
      const res = await createUser({
        name: f.name,
        nameAr: f.nameAr || undefined,
        username: f.username,
        email: f.email,
        password: f.password,
        roleId: f.roleId,
        departmentId: f.departmentId || undefined,
        phone: f.phone || undefined,
        nationalId: f.nationalId || undefined,
        address: f.address || undefined,
        salary: f.salary || undefined,
        hireDate: f.hireDate || undefined,
      });
      if (res.ok) {
        toast.success(labels.success);
        setF(emptyForm);
        setOpen(false);
        router.refresh();
      } else {
        toast.error((res as any).error === "exists" ? "User exists" : (res as any).error === "invalid" ? "Invalid data" : labels.failed);
      }
    } catch {
      toast.error(labels.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="me-2 h-4 w-4" />
          {labels.add}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{labels.add}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-muted-foreground">{labels.accountInfo}</span>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>{labels.name}</Label>
                <Input value={f.name} onChange={(e) => set("name", e.target.value)} required />
              </div>
              <div className="grid gap-1.5">
                <Label>{labels.nameAr}</Label>
                <Input value={f.nameAr} onChange={(e) => set("nameAr", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>{labels.username}</Label>
                <Input dir="ltr" value={f.username} onChange={(e) => set("username", e.target.value)} required />
              </div>
              <div className="grid gap-1.5">
                <Label>{labels.email}</Label>
                <Input dir="ltr" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} required />
              </div>
              <div className="grid gap-1.5">
                <Label>{labels.password}</Label>
                <Input dir="ltr" type="password" value={f.password} onChange={(e) => set("password", e.target.value)} required />
              </div>
              <div className="grid gap-1.5">
                <Label>{labels.role}</Label>
                <Select value={f.roleId} onValueChange={(v) => set("roleId", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={labels.role} />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>{labels.department}</Label>
                <Select value={f.departmentId} onValueChange={(v) => set("departmentId", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={labels.department} />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-muted-foreground">{labels.personalInfo}</span>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>{labels.phone}</Label>
                <Input dir="ltr" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>{labels.nationalId}</Label>
                <Input dir="ltr" value={f.nationalId} onChange={(e) => set("nationalId", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>{labels.address}</Label>
                <Input value={f.address} onChange={(e) => set("address", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>{labels.salary}</Label>
                <Input dir="ltr" type="number" min="0" step="0.01" value={f.salary} onChange={(e) => set("salary", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>{labels.hireDate}</Label>
                <Input dir="ltr" type="date" value={f.hireDate} onChange={(e) => set("hireDate", e.target.value)} />
              </div>
            </div>
          </div>

          <Button type="submit" disabled={busy}>
            {busy ? labels.creating : labels.add}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
