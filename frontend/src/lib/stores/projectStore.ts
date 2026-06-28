// frontend/src/lib/stores/projectStore.ts
// Project 本地数据源适配器（seam）。当前用 localStorage 持久化，接口与未来后端对齐。
// 诚实隔离：这不是真实后端，仅为页面集成提供过渡数据源。
import type { Project } from "@/types/domain";
import { getItem, setItem, newId } from "./storage";

const PROJECTS_KEY = "evocode.projects";

function readAll(): Project[] {
  return getItem<Project[]>(PROJECTS_KEY, []);
}

function writeAll(projects: Project[]): void {
  setItem(PROJECTS_KEY, projects);
}

// TODO(backend): 后端 Project API 落地后替换为 fetch(`/api/projects`)。
export function listProjects(): Project[] {
  return readAll();
}

// TODO(backend): 后端 Project API 落地后替换为 fetch(`/api/projects/${id}`)。
export function getProject(id: string): Project | null {
  return readAll().find((p) => p.id === id) ?? null;
}

// TODO(backend): 后端 Project API 落地后替换为 fetch(`/api/projects`, { method: "POST" })。
export function createProject(name: string, repoPath?: string): Project {
  const project: Project = {
    id: newId(),
    name,
    ...(repoPath !== undefined ? { repoPath } : {}),
    createdAt: new Date().toISOString(),
  };
  const projects = readAll();
  projects.push(project);
  writeAll(projects);
  return project;
}

// TODO(backend): 后端 Project API 落地后替换为 fetch(`/api/projects/${id}`, { method: "PATCH" })。
// 最小实现：合并 name/repoPath 补丁；repoPath 传空字符串/undefined 时清除该字段。
export function updateProject(
  id: string,
  patch: { name?: string; repoPath?: string }
): Project | null {
  const projects = readAll();
  const idx = projects.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const current = projects[idx]!;
  const next: Project = {
    ...current,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
  };
  if (patch.repoPath !== undefined) {
    if (patch.repoPath === "") {
      delete next.repoPath;
    } else {
      next.repoPath = patch.repoPath;
    }
  }
  projects[idx] = next;
  writeAll(projects);
  return next;
}

// TODO(backend): 后端 Project API 落地后替换为 fetch(`/api/projects/${id}`, { method: "DELETE" })。
export function deleteProject(id: string): void {
  writeAll(readAll().filter((p) => p.id !== id));
}
