import type { NextConfig } from "next";

const API = process.env.API_PROXY_TARGET ?? "http://localhost:3311";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["nextstepjs"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API}/:path*` }];
  },
};

export default nextConfig;
