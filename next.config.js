import createNextIntlPlugin from "next-intl/plugin";
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const nextConfig = {
    reactStrictMode: true,
    poweredByHeader: false,
    typedRoutes: true,
    serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
    outputFileTracingIncludes: {
        "/api/reports/**": ["./node_modules/@sparticuz/chromium/**"],
    },
};
export default withNextIntl(nextConfig);
