// frontend/src/app/console/page.tsx
// 旧单页控制台已被多路由 Agent Workspace 取代。/console 收口到 /dashboard。
// Server 组件，redirect 在渲染期抛出，旧单页不再渲染。
import { redirect } from "next/navigation";

export default function ConsolePage() {
  redirect("/dashboard");
}
