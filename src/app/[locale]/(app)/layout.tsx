import { requireUser } from "@/core/auth/session";
import { filterNav } from "@/core/nav-permissions";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    const user = await requireUser();
    console.error("[app-layout] user:", user?.id, user?.email, user?.currentClinicId);
    const groups = await filterNav(user);
    return <AppShell groups={groups} user={user}>{children}</AppShell>;
  } catch (err: any) {
    console.error("[app-layout] failed:", err?.message, err?.stack?.split('\n').slice(0,5).join(' | '));
    throw err;
  }
}