import { ConsoleShell } from "@/components/console/ConsoleShell";
import { Toaster } from "@/components/ui/sonner";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ConsoleShell>{children}</ConsoleShell>
      <Toaster />
    </>
  );
}
