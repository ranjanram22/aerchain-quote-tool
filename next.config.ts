import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The demo reset reads the seed vendor files from disk at runtime.
  outputFileTracingIncludes: {
    "/api/admin/reset": ["./seed/files/**/*"],
  },
};

export default nextConfig;
