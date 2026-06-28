import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { ReviewFinding, ReviewOutput } from "@/types/intent";

const verdictMap = {
  approve: {
    Icon: CheckCircle2,
    label: "通过 approve",
    className: "text-success",
  },
  request_changes: {
    Icon: AlertTriangle,
    label: "需修改 request_changes",
    className: "text-amber-600",
  },
  block: {
    Icon: XCircle,
    label: "阻断 block",
    className: "text-destructive",
  },
} as const;

function SeverityBadge({ severity }: { severity: ReviewFinding["severity"] }) {
  switch (severity) {
    case "critical":
      return <Badge variant="destructive">critical</Badge>;
    case "major":
      return (
        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          major
        </Badge>
      );
    case "minor":
      return <Badge variant="secondary">minor</Badge>;
    case "suggestion":
      return <Badge variant="outline">suggestion</Badge>;
  }
}

export function ReviewPanel({ review }: { review: ReviewOutput }) {
  const verdict = verdictMap[review.verdict];
  const { Icon } = verdict;

  return (
    <div className="space-y-4">
      <div className={cn("flex items-center gap-2 text-lg font-semibold", verdict.className)}>
        <Icon className="size-6" />
        <span>{verdict.label}</span>
      </div>

      {review.summary ? (
        <p className="text-sm text-muted-foreground">{review.summary}</p>
      ) : null}

      <Separator />

      {review.findings.length === 0 ? (
        <p className="text-sm text-muted-foreground">未发现问题</p>
      ) : (
        <ul className="space-y-3">
          {review.findings.map((finding, index) => (
            <li
              key={index}
              className="rounded-lg border bg-card p-3 text-card-foreground"
            >
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={finding.severity} />
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {finding.filePath}
                </code>
              </div>
              <p className="mt-2 text-sm">{finding.message}</p>
              {finding.suggestedFix ? (
                <p className="mt-1 text-sm italic text-muted-foreground">
                  建议：{finding.suggestedFix}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
