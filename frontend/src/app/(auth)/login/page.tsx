"use client";
// frontend/src/app/(auth)/login/page.tsx
// 登录 / 注册合并页（Tab 切换）。对接真实后端 /api/auth；成功后跳 /dashboard。
// 设计基于 magic MCP 生成稿，去掉了 social-auth（后端仅支持邮箱+密码 JWT）。
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";

import { useAuth } from "@/lib/auth/AuthContext";
import { ControlPlaneError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";

function emailValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function AuthPage() {
  const router = useRouter();
  const { login, register } = useAuth();
  const [tab, setTab] = useState<"login" | "register">("login");

  // 登录态
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // 注册态
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regError, setRegError] = useState<string | null>(null);
  const [regLoading, setRegLoading] = useState(false);

  function authErr(e: unknown): string {
    if (e instanceof ControlPlaneError) {
      if (e.status === 401) return "邮箱或密码错误";
      if (e.status === 409) return "该邮箱已注册";
      if (e.status === 400) return "输入不合法，请检查邮箱与密码";
      return `服务错误 ${e.status}`;
    }
    return "无法连接服务，请确认控制平面已启动";
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    if (!loginEmail || !loginPassword) {
      setLoginError("请填写邮箱与密码");
      return;
    }
    if (!emailValid(loginEmail)) {
      setLoginError("请输入有效的邮箱地址");
      return;
    }
    setLoginLoading(true);
    try {
      await login(loginEmail.trim(), loginPassword);
      router.push("/dashboard");
    } catch (err) {
      setLoginError(authErr(err));
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegError(null);
    if (!regEmail || !regPassword || !regConfirm) {
      setRegError("请填写所有字段");
      return;
    }
    if (!emailValid(regEmail)) {
      setRegError("请输入有效的邮箱地址");
      return;
    }
    if (regPassword.length < 8) {
      setRegError("密码至少 8 位");
      return;
    }
    if (regPassword !== regConfirm) {
      setRegError("两次输入的密码不一致");
      return;
    }
    setRegLoading(true);
    try {
      await register(regEmail.trim(), regPassword);
      router.push("/dashboard");
    } catch (err) {
      setRegError(authErr(err));
    } finally {
      setRegLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-foreground">
            EvoCode
          </h1>
          <p className="text-sm text-muted-foreground">
            Intent is the new source code.
          </p>
        </div>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "login" | "register")}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">登录</TabsTrigger>
            <TabsTrigger value="register">注册</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <Card>
              <CardHeader>
                <CardTitle>欢迎回来</CardTitle>
                <CardDescription>输入凭据以访问你的工作区</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                  {loginError ? (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{loginError}</AlertDescription>
                    </Alert>
                  ) : null}
                  <div className="space-y-2">
                    <Label htmlFor="login-email">邮箱</Label>
                    <Input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      placeholder="name@example.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      disabled={loginLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">密码</Label>
                    <Input
                      id="login-password"
                      type="password"
                      autoComplete="current-password"
                      placeholder="输入密码"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      disabled={loginLoading}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loginLoading}>
                    {loginLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        登录中…
                      </>
                    ) : (
                      "登录"
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="register">
            <Card>
              <CardHeader>
                <CardTitle>创建账户</CardTitle>
                <CardDescription>注册后即可创建项目与会话</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRegister} className="space-y-4">
                  {regError ? (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{regError}</AlertDescription>
                    </Alert>
                  ) : null}
                  <div className="space-y-2">
                    <Label htmlFor="reg-email">邮箱</Label>
                    <Input
                      id="reg-email"
                      type="email"
                      autoComplete="email"
                      placeholder="name@example.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      disabled={regLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-password">密码</Label>
                    <Input
                      id="reg-password"
                      type="password"
                      autoComplete="new-password"
                      placeholder="创建密码"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      disabled={regLoading}
                    />
                    <p className="text-xs text-muted-foreground">至少 8 位</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-confirm">确认密码</Label>
                    <Input
                      id="reg-confirm"
                      type="password"
                      autoComplete="new-password"
                      placeholder="再次输入密码"
                      value={regConfirm}
                      onChange={(e) => setRegConfirm(e.target.value)}
                      disabled={regLoading}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={regLoading}>
                    {regLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        创建中…
                      </>
                    ) : (
                      "创建账户"
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
