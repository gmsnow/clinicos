import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  compress: true,
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
  outputFileTracingIncludes: {
    "/api/reports/**": ["./node_modules/@sparticuz/chromium/**"],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns", "framer-motion", "recharts"],
  },
};

export default withNextIntl(nextConfig);
