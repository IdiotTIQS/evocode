// frontend/src/components/session/ApprovalGate.tsx
// 审批门 UI：计划审批（plan gate）与 diff 审批（diff gate）两种面板。
//
// 关键产品约束：意图提交后【绝不立即执行】，必须人工批准。计划审批是真实暂停点，
// 批准前不会调用后端生成代码。
import { CheckCircle2, FileCode, ShieldQuestion } from "lucide-react";

import type { PlanPreview } from "@/lib/execution/executionMachine";
import type { RunResult } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ApprovalGate({
  gate,
  plan,
  result,
  onApprove,
  onReject,
}: {
  gate: "plan" | "diff";
  plan?: PlanPreview;
  result?: RunResult;
  onApprove: () => void;
  onReject: () => void;
}) {
  if (gate === "plan") {
    return (
      <Card aria-label="计划审批" className="border-primary/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldQuestion className="size-5 text-primary" aria-hidden="true" />
            计划待审批
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            提交意图后不会立即执行。请先确认计划，批准后才会开始生成代码。
          </p>

          {plan ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  意图摘要
                </span>
                <p className="rounded-md border bg-muted/40 p-3 text-sm">
                  {plan.intent}
                </p>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground">
                  将执行的流水线
                </span>
                <ol className="flex flex-wrap gap-1.5">
                  {plan.pipeline.map((node, i) => (
                    <li key={node.key}>
                      <Badge variant="outline" className="font-normal">
                        {i + 1}. {node.label}
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          {node.key}
                        </span>
                      </Badge>
                    </li>
                  ))}
                </ol>
              </div>

              {/* 诚实标注：后端无独立规划端点，计划预览为意图摘要。 */}
              <p className="text-xs text-muted-foreground">{plan.note}</p>
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onClick={onReject}
              className="focus-visible:ring-2"
            >
              拒绝
            </Button>
            <Button onClick={onApprove} className="focus-visible:ring-2">
              批准计划，开始生成
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // diff gate
  const changeSet = result?.changeSet ?? [];
  return (
    <Card aria-label="变更审批" className="border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileCode className="size-5 text-primary" aria-hidden="true" />
          变更待审批
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          代码已生成并通过验证。请审查变更集，批准后视为确认应用。
        </p>

        {changeSet.length > 0 ? (
          <ul className="space-y-1.5">
            {changeSet.map((file) => (
              <li
                key={file.path}
                className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2"
              >
                <CheckCircle2
                  className="size-4 shrink-0 text-success"
                  aria-hidden="true"
                />
                <code className="truncate text-xs">{file.path}</code>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {file.content.split("\n").length} 行
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">本次未生成文件变更。</p>
        )}

        {/* 诚实标注：当前生成物已写入 evocode_generated/，应用为确认动作。 */}
        <p className="text-xs text-muted-foreground">
          应用说明：当前生成物已写入 evocode_generated/，此处为确认动作。
          {/* TODO(backend): apply changes 端点；当前生成物已写入 evocode_generated/ */}
        </p>

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            onClick={onReject}
            className="focus-visible:ring-2"
          >
            拒绝
          </Button>
          <Button onClick={onApprove} className="focus-visible:ring-2">
            批准并应用
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
