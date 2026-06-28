// frontend/src/lib/stores/projectStore.ts
// Project 数据源适配器。已对接控制平面真实端点（跨设备持久化）。
// 所有函数为 async：调用方需 await。错误沿用 api.ts 的 ControlPlaneError。
import type { Project } from "@/types/domain";
import { ControlPlaneError } from "@/lib/api";

const BASE = process.env.NEXT_PUBLIC_CONTROL_PLANE_URL ?? "http://localhost:8080";

// 后端 ProjectDto.repoPath 可为 null；归一化为可选字段以匹配 Project 类型。
interface ProjectDto {
  id: string;
  name: string;
  repoPath: string | null;
  createdAt: string;
}

function fromDto(d: ProjectDto): Project {
  return {
    id: d.id,
    name: d.name,
    ...(d.repoPath ? { repoPath: d.repoPath } : {}),
    createdAt: d.createdAt,
  };
}

export async function listProjects(): Promise<Project[]> {
  const resp = await fetch(`${BASE}/api/projects`);
  if (!resp.ok) throw new ControlPlaneError(resp.status);
  const data: ProjectDto[] = await resp.json();
  return data.map(fromDto);
}

/** 未找到返回 null（404）；其余非 2xx 抛 ControlPlaneError。 */
export async function getProject(id: string): Promise<Project | null> {
  const resp = await fetch(`${BASE}/api/projects/${encodeURIComponent(id)}`);
  if (resp.status === 404) return null;
  if (!resp.ok) throw new ControlPlaneError(resp.status);
  return fromDto(await resp.json());
}

export async function createProject(
  name: string,
  repoPath?: string
): Promise<Project> {
  const resp = await fetch(`${BASE}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, ...(repoPath !== undefined ? { repoPath } : {}) }),
  });
  if (!resp.ok) throw new ControlPlaneError(resp.status);
  return fromDto(await resp.json());
}

/**
 * 合并 name/repoPath 补丁；repoPath 传空字符串清除该字段。
 * 未找到返回 null（404）。
 */
export async function updateProject(
  id: string,
  patch: { name?: string; repoPath?: string }
): Promise<Project | null> {
  const resp = await fetch(`${BASE}/api/projects/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new ControlPlaneError(resp.status);
  return fromDto(await resp.json());
}

export async function deleteProject(id: string): Promise<void> {
  const resp = await fetch(`${BASE}/api/projects/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  // 404 视为已删除（幂等）。
  if (!resp.ok && resp.status !== 404) throw new ControlPlaneError(resp.status);
}
