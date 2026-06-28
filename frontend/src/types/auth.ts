// frontend/src/types/auth.ts
// 认证相关类型，镜像 control-plane 的 AuthResponse / AuthRequest。

export interface AuthUser {
  userId: string;
  email: string;
  role: "ADMIN" | "USER";
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}
