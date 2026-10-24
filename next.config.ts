import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle (.next/standalone) that the desktop app ships
  // and runs with Electron's own Node runtime.
  output: "standalone",
};

export default nextConfig;
