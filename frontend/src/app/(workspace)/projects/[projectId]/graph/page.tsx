// frontend/src/app/(workspace)/projects/[projectId]/graph/page.tsx
// 知识图谱：占位卡片。诚实标注计划中，待 backend 提供项目图后接入。纯静态，无需 client。
import { Network } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function GraphPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Network className="size-4" aria-hidden="true" />
          知识图谱
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          知识图谱可视化：计划中（backend 提供项目图后接入）。
        </p>
        <p className="text-xs text-muted-foreground">
          后端项目图 API 落地后，这里将展示文件/组件/依赖关系的交互式图谱。
        </p>
      </CardContent>
    </Card>
  );
}
