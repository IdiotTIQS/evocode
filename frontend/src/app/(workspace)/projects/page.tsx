"use client";
// frontend/src/app/(workspace)/projects/page.tsx
// 项目列表：卡片网格 + 内联"新建项目"表单。空态引导。
// 数据源为 localStorage（projectStore），仅客户端可读。
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderGit2, Plus, X } from "lucide-react";
import { listProjects, createProject } from "@/lib/stores/projectStore";
import type { Project } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [repoPath, setRepoPath] = useState("");

  useEffect(() => {
    let active = true;
    listProjects()
      .then((data) => {
        if (active) setProjects(data);
      })
      .catch(() => {
        if (active) setProjects([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const trimmedRepo = repoPath.trim();
    const project = await createProject(
      trimmedName,
      trimmedRepo === "" ? undefined : trimmedRepo
    );
    router.push(`/projects/${project.id}/overview`);
  }

  function openForm() {
    setCreating(true);
  }

  function closeForm() {
    setCreating(false);
    setName("");
    setRepoPath("");
  }

  const sorted = [...projects].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">项目</h1>
          <p className="text-sm text-muted-foreground">
            管理你的项目，进入项目查看会话、运行与设置。
          </p>
        </div>
        {!creating ? (
          <Button onClick={openForm}>
            <Plus className="size-4" aria-hidden="true" />
            新建项目
          </Button>
        ) : null}
      </div>

      {creating ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">新建项目</CardTitle>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={closeForm}
                aria-label="取消新建"
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="project-name">
                  名称 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="project-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="我的项目"
                  autoFocus
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-repo">仓库路径（可选）</Label>
                <Input
                  id="project-repo"
                  value={repoPath}
                  onChange={(e) => setRepoPath(e.target.value)}
                  placeholder="/path/to/repo"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={!canSubmit}>
                  创建
                </Button>
                <Button type="button" variant="outline" onClick={closeForm}>
                  取消
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {sorted.length === 0 && !creating ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <FolderGit2
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <p className="text-sm font-medium">还没有项目</p>
              <p className="text-sm text-muted-foreground">
                创建第一个项目，开始管理会话与运行。
              </p>
            </div>
            <Button onClick={openForm}>
              <Plus className="size-4" aria-hidden="true" />
              新建项目
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {sorted.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}/overview`}
              className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card className="h-full transition-colors hover:border-ring">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FolderGit2
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="truncate">{p.name}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-muted-foreground">
                  <p className="truncate">
                    {p.repoPath ? p.repoPath : "未设置仓库路径"}
                  </p>
                  <p className="text-xs">创建于 {fmtDate(p.createdAt)}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
