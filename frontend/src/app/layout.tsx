import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "EvoCode — 自主软件工程平台",
  description:
    "意图，是新的源代码。EvoCode 让一组专职智能体设计、实现、验证并审查代码。Intent is the new source code. Agents build. Humans decide.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={inter.className}>
      <body>{children}</body>
    </html>
  );
}
