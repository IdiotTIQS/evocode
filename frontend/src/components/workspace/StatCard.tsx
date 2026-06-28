// frontend/src/components/workspace/StatCard.tsx
// 小数字卡：大数字 + 小标签，可选图标。用于 Dashboard 顶部统计行。
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        {Icon ? (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <Icon className="size-5" aria-hidden="true" />
          </span>
        ) : null}
        <div className="min-w-0">
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
          <div className="text-sm text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
