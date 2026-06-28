"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface IntentFormProps {
  value: string;
  projectId: string;
  repoPath: string;
  onIntentChange: (v: string) => void;
  onProjectIdChange: (v: string) => void;
  onRepoPathChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
}

export function IntentForm({
  value,
  projectId,
  repoPath,
  onIntentChange,
  onProjectIdChange,
  onRepoPathChange,
  onSubmit,
  loading,
}: IntentFormProps) {
  return (
    <Card>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <CardHeader>
          <CardTitle>提交意图</CardTitle>
          <CardDescription>
            描述你想完成的目标，EvoCode 会自动规划并执行。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="intent-project-id">项目 ID</Label>
              <Input
                id="intent-project-id"
                value={projectId}
                onChange={(e) => onProjectIdChange(e.target.value)}
                placeholder="例如 evocode"
                disabled={loading}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="intent-repo-path">仓库路径</Label>
              <Input
                id="intent-repo-path"
                value={repoPath}
                onChange={(e) => onRepoPathChange(e.target.value)}
                placeholder="例如 /workspace/evocode"
                disabled={loading}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="intent-text">意图</Label>
            <Textarea
              id="intent-text"
              rows={4}
              value={value}
              onChange={(e) => onIntentChange(e.target.value)}
              placeholder="描述你想让 EvoCode 完成的任务…"
              disabled={loading}
            />
          </div>
        </CardContent>
        <CardFooter className="justify-end pt-4">
          <Button type="submit" disabled={loading || !value.trim()}>
            {loading ? (
              <>
                <Loader2 className="animate-spin" />
                运行中…
              </>
            ) : (
              "运行意图"
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
