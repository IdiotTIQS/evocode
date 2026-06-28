// frontend/src/app/console/layout.tsx
// /console 已收口到 /dashboard，layout 降为最小直通，避免旧 ConsoleShell 套壳干扰重定向。
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
