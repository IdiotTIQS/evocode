import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EngineeringTask, ProjectGraphStats, RunResult } from "@/types/intent";

import { ReviewPanel } from "./ReviewPanel";

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-4">
        <div className="text-2xl font-semibold">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

function TaskKindBadge({ kind }: { kind: EngineeringTask["kind"] }) {
  switch (kind) {
    case "frontend":
      return <Badge>frontend</Badge>;
    case "backend":
      return (
        <Badge className="bg-[#24B291] text-white hover:bg-[#24B291]/90">
          backend
        </Badge>
      );
    case "test":
      return <Badge variant="secondary">test</Badge>;
    case "generic":
      return <Badge variant="outline">generic</Badge>;
  }
}

function OverviewStats({ stats }: { stats: ProjectGraphStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <StatCard label="文件数 fileCount" value={stats.fileCount} />
      <StatCard label="组件数 componentCount" value={stats.componentCount} />
      <StatCard label="导入数 importCount" value={stats.importCount} />
      {stats.maxImpactCount !== undefined ? (
        <StatCard label="最大影响 maxImpactCount" value={stats.maxImpactCount} />
      ) : null}
      {stats.cacheHit !== undefined ? (
        <StatCard label="缓存命中 cacheHit" value={stats.cacheHit ? "是" : "否"} />
      ) : null}
      {stats.graphVersionId !== undefined && stats.graphVersionId !== null ? (
        <StatCard label="图版本 graphVersionId" value={stats.graphVersionId} />
      ) : null}
    </div>
  );
}

export function ResultTabs({ result }: { result: RunResult }) {
  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="w-full">
        <TabsTrigger value="overview">概览 overview</TabsTrigger>
        <TabsTrigger value="tasks">任务图 tasks</TabsTrigger>
        <TabsTrigger value="files">生成文件 files</TabsTrigger>
        <TabsTrigger value="verify">验证 verify</TabsTrigger>
        <TabsTrigger value="review">审查 review</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-4">
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">runId</span>
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{result.runId}</code>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">status</span>
            <Badge variant={result.status === "completed" ? "default" : "destructive"}>
              {result.status}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">phase</span>
            <span>{result.phase}</span>
          </div>
          {result.message ? (
            <p className="text-muted-foreground">{result.message}</p>
          ) : null}
        </div>

        {result.graphStats ? <OverviewStats stats={result.graphStats} /> : null}
      </TabsContent>

      <TabsContent value="tasks" className="space-y-3">
        {result.taskGraph.tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无任务</p>
        ) : (
          result.taskGraph.tasks.map((task) => (
            <Card key={task.id} className="gap-2 py-4">
              <CardHeader className="px-4">
                <div className="flex items-center gap-2">
                  <TaskKindBadge kind={task.kind} />
                  <CardTitle className="text-sm">{task.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-4 text-sm text-muted-foreground">
                {task.description}
              </CardContent>
            </Card>
          ))
        )}
      </TabsContent>

      <TabsContent value="files" className="space-y-3">
        {result.appliedFiles && result.appliedFiles.length > 0 ? (
          <p className="text-sm text-[#24B291]">
            ✓ 已写入目标仓库 {result.appliedFiles.length} 个文件
          </p>
        ) : null}
        {result.changeSet && result.changeSet.length > 0 ? (
          result.changeSet.map((file) => (
            <Card key={file.path} className="gap-2 py-4">
              <CardHeader className="px-4">
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{file.path}</code>
              </CardHeader>
              <CardContent className="px-4">
                <ScrollArea className="max-h-72 w-full rounded border">
                  <pre className="p-3 text-xs">{file.content}</pre>
                </ScrollArea>
              </CardContent>
            </Card>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">未生成文件</p>
        )}
      </TabsContent>

      <TabsContent value="verify" className="space-y-3">
        {result.verification && result.verification.checked ? (
          <div className="space-y-3">
            {result.verification.passed ? (
              <p className="text-sm text-[#24B291]">✓ 类型检查通过</p>
            ) : (
              <p className="text-sm text-destructive">
                ✗ {result.verification.diagnosticCount} 个问题
              </p>
            )}
            {result.verification.diagnostics.length > 0 ? (
              <ul className="space-y-1">
                {result.verification.diagnostics.map((diag, index) => (
                  <li key={index} className="text-xs">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      {diag.file}
                      {diag.line !== null ? `:${diag.line}` : ""}
                    </code>{" "}
                    <span className="text-muted-foreground">TS{diag.code}</span>{" "}
                    {diag.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">未运行验证</p>
        )}
      </TabsContent>

      <TabsContent value="review">
        {result.review ? (
          <ReviewPanel review={result.review} />
        ) : (
          <p className="text-sm text-muted-foreground">未运行审查</p>
        )}
      </TabsContent>
    </Tabs>
  );
}
