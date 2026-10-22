import type { NextConfig } from "next";
const config: NextConfig = { serverExternalPackages: ["pg"], typedRoutes: false, experimental: { serverActions: { bodySizeLimit: "26mb" } } };
export default config;
