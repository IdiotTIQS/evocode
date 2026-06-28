import { GlobalSidebar } from "@/components/workspace/GlobalSidebar";

export function WorkspaceShell({
  children,
  header,
}: {
  children: React.ReactNode;
  header?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* 移动端：顶部横向条，导航始终可达；md+：左固定侧栏 */}
      <GlobalSidebar className="md:w-60 md:shrink-0 md:border-r md:border-b-0 border-b border-border" />
      <div className="flex-1 overflow-y-auto">
        <header className="flex h-14 items-center border-b border-border px-6">
          {header}
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
