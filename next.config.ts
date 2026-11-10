import type { NextConfig } from "next";

// GitHub Pages hosts *static files only*, so the app is exported with
// `output: "export"` (→ ./out). Project sites live under /<repo-name>/, which the
// deploy workflow passes in as NEXT_PUBLIC_BASE_PATH (empty for user/org sites,
// custom domains and local development).
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true, // /repo/ → out/index.html; works with every static host
  images: { unoptimized: true },
  reactStrictMode: false,
  poweredByHeader: false,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
