"use client";
// frontend/src/app/(workspace)/projects/[projectId]/settings/page.tsx
// 设置：编辑项目名/仓库路径（updateProject 写回）+ 删除项目（确认后 deleteProject → /projects）。
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  getProject,
  updateProject,
  deleteProject,
} from "@/lib/stores/projectStore";
import type { Project } from "@/types/domain";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    let active = true;
    getProject(projectId)
      .then((p) => {
        if (active && p) {
          setProject(p);
          setName(p.name);
          setRepoPath(p.repoPath ?? "");
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [projectId]);

  const trimmedName = name.trim();
  const canSave = trimmedName.length > 0;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaveError(false);
    try {
      const next = await updateProject(projectId, {
        name: trimmedName,
        repoPath: repoPath.trim(),
      });
      if (next) {
        setProject(next);
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2000);
      } else {
        setSaveError(true);
      }
    } catch {
      setSaveError(true);
    }
  }

  async function handleDelete() {
    try {
      await deleteProject(projectId);
      router.push("/projects");
    } catch {
      setSaveError(true);
      setConfirmingDelete(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">项目设置</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="settings-name">
                名称 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="settings-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setSaved(false);
                  setSaveError(false);
                }}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-repo">仓库路径（可选）</Label>
              <Input
                id="settings-repo"
                value={repoPath}
                onChange={(e) => {
                  setRepoPath(e.target.value);
                  setSaved(false);
                  setSaveError(false);
                }}
                placeholder="/path/to/repo"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={!canSave}>
                保存
              </Button>
              {saved ? (
                <span
                  role="status"
                  className="text-sm text-muted-foreground"
                >
                  已保存
                </span>
              ) : null}
              {saveError ? (
                <span role="alert" className="text-sm text-destructive">
                  操作失败，请确认控制平面已启动后重试
                </span>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base text-destructive">
            危险操作
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            删除项目不可恢复。该项目的数据将被永久移除。
          </p>
          <Separator />
          {!confirmingDelete ? (
            <Button
              variant="destructive"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              删除项目
            </Button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium">
                确定要删除「{project?.name ?? "此项目"}」吗？此操作不可恢复。
              </p>
              <div className="flex gap-2">
                <Button variant="destructive" onClick={handleDelete}>
                  确认删除
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setConfirmingDelete(false)}
                >
                  取消
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
