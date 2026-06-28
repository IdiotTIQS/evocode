import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/auth/RequireAuth";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <WorkspaceShell>{children}</WorkspaceShell>
      <Toaster />
    </RequireAuth>
  );
}
