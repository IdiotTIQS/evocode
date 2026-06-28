// frontend/src/components/workspace/RecentList.tsx
// 通用"最近列表"卡片：标题 + 可选图标，每项为 next/link，显示 primary（截断）+ secondary（muted）。
// 空时显示 emptyHint。
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface RecentListItem {
  id: string;
  primary: string;
  secondary?: string;
  href: string;
}

export function RecentList({
  title,
  items,
  emptyHint,
  icon: Icon,
}: {
  title: string;
  items: RecentListItem[];
  emptyHint: string;
  icon?: LucideIcon;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyHint}</p>
        ) : (
          items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm outline-none transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="block truncate font-medium">{item.primary}</span>
              {item.secondary ? (
                <span className="block truncate text-xs text-muted-foreground">
                  {item.secondary}
                </span>
              ) : null}
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
