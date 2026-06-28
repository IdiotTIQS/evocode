// frontend/src/app/(workspace)/projects/[projectId]/page.tsx
// 项目根路由重定向到概览。Server 组件；Next 15 params 是 Promise。
import { redirect } from "next/navigation";

export default async function ProjectIndexPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/projects/${projectId}/overview`);
}
