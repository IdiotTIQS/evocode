import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

const PHASE_ORDER = [
  "understand",
  "plan",
  "architect",
  "generate",
  "verify",
  "review",
  "apply",
] as const;

const PHASE_TO_INDEX: Record<string, number> = {
  understood: 0,
  planned: 1,
  architected: 2,
  generated: 3,
  verified: 4,
  reviewed: 5,
  applied: 6,
};

const PHASE_LABEL: Record<(typeof PHASE_ORDER)[number], string> = {
  understand: "理解",
  plan: "规划",
  architect: "架构",
  generate: "生成",
  verify: "验证",
  review: "审查",
  apply: "应用",
};

export function PipelineStepper({
  phase,
  done = false,
}: {
  phase: string;
  done?: boolean;
}) {
  // 同步返回终态时，整条流水线已完成：所有节点显示对勾，不再有"进行中"节点。
  const currentIndex = done ? PHASE_ORDER.length : (PHASE_TO_INDEX[phase] ?? -1);

  return (
    <div
      aria-label="流水线进度"
      className="flex items-start gap-1 overflow-x-auto"
    >
      {PHASE_ORDER.map((key, i) => {
        const isCompleted = i < currentIndex;
        const isCurrent = i === currentIndex;

        return (
          <div key={key} className="flex flex-1 items-start gap-1">
            <div className="flex min-w-16 flex-col items-center gap-2">
              <div
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors",
                  isCompleted && "bg-primary text-primary-foreground",
                  isCurrent &&
                    "border-2 border-primary text-primary motion-safe:animate-pulse",
                  !isCompleted && !isCurrent && "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="size-4" aria-hidden="true" />
                ) : (
                  i + 1
                )}
              </div>
              <div className="flex flex-col items-center text-center">
                <span
                  className={cn(
                    "text-xs font-medium",
                    isCurrent || isCompleted
                      ? "text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {PHASE_LABEL[key]}
                </span>
                <span className="text-[10px] text-muted-foreground">{key}</span>
              </div>
            </div>
            {i < PHASE_ORDER.length - 1 && (
              <div
                aria-hidden="true"
                className="mt-4 h-px flex-1 min-w-4 bg-border"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
