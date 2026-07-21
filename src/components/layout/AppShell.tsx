import type { ReactNode } from "react";
import { useAuth } from "../../lib/auth-context";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell({
  project,
  children,
}: {
  project?: { id: string; name: string } | null;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const fullName =
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email ||
    "Account";
  const email = user?.email ?? "";

  return (
    <div className="min-h-screen bg-background">
      <Sidebar project={project} userName={fullName} userRole={email} />
      <Topbar activeProject={project} />
      {/* The project tabs bar (in Topbar) already shows which project is active,
          so a "Projects / ProjectName" breadcrumb here would just repeat it. */}
      <main className="ml-sidebar pt-content-top min-h-screen mt-3">
        <div className="p-gutter max-w-[1400px] mx-auto">{children}</div>
      </main>
    </div>
  );
}
