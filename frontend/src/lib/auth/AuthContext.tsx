"use client";
// frontend/src/lib/auth/AuthContext.tsx
// 客户端认证上下文：持有当前用户、token 生命周期、登录/注册/登出。
// 刷新页面时用 token 调 /api/auth/me 水合用户；401 时全局登出并跳 /login。

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import {
  fetchMe,
  login as apiLogin,
  register as apiRegister,
  setToken,
  setUnauthorizedHandler,
  getToken,
} from "@/lib/api";
import type { AuthUser } from "@/types/auth";

interface AuthContextValue {
  user: AuthUser | null;
  /** 初始水合是否完成（未完成时守卫应显示 loading，避免误跳转）。 */
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const mountedRef = useRef(true);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    router.push("/login");
  }, [router]);

  // 注册 401 全局处理：登出并跳登录。
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setUser(null);
      router.push("/login");
    });
    return () => setUnauthorizedHandler(null);
  }, [router]);

  // 首次挂载：若有 token，调 /me 水合；失败则清空。
  useEffect(() => {
    mountedRef.current = true;
    const token = getToken();
    if (!token) {
      setReady(true);
      return;
    }
    fetchMe()
      .then((u) => {
        if (mountedRef.current) setUser(u);
      })
      .catch(() => {
        if (mountedRef.current) setToken(null);
      })
      .finally(() => {
        if (mountedRef.current) setReady(true);
      });
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiLogin(email, password);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const res = await apiRegister(email, password);
    setToken(res.token);
    setUser(res.user);
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth 必须在 AuthProvider 内使用");
  return ctx;
}
