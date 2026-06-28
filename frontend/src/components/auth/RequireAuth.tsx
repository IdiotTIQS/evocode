"use client";
// frontend/src/components/auth/RequireAuth.tsx
// 客户端鉴权守卫：未登录（水合完成且无 user）跳 /login；水合中显示占位。
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth/AuthContext";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground motion-safe:animate-pulse">
          正在校验登录状态…
        </p>
      </div>
    );
  }
  if (!user) {
    // 已触发跳转，渲染空白避免闪现受保护内容。
    return null;
  }
  return <>{children}</>;
}
