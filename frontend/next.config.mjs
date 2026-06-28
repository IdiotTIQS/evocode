/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker 镜像用 standalone 产物（自包含 .next/standalone，体积小、无需整棵 node_modules）。
  output: "standalone",
};
export default nextConfig;
