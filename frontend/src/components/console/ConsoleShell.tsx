import { ConsoleSidebar } from "@/components/console/ConsoleSidebar";

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* 移动端：顶部横向条，导航始终可达；md+：左固定侧栏 */}
      <ConsoleSidebar className="md:w-60 md:shrink-0 md:border-r md:border-b-0 border-b border-border" />
      <div className="flex-1 overflow-y-auto">
        <header className="flex h-14 items-center border-b border-border px-6">
          <h1 className="text-sm font-medium">控制台</h1>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
