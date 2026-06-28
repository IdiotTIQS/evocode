import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { Toaster } from "@/components/ui/sonner";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <WorkspaceShell>{children}</WorkspaceShell>
      <Toaster />
    </>
  );
}
