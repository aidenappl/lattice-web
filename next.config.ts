import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
const apiUrl = process.env.NEXT_PUBLIC_LATTICE_API || "";
// Derive allowed WS origin from API URL for tighter connect-src
const apiWsUrl = apiUrl.replace(/^https:/, "wss:").replace(/^http:/, "ws:");

const nextConfig: NextConfig = {
  output: "standalone",
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // unsafe-eval only in dev (Next.js HMR requires it); unsafe-inline for FA kit
              `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://kit.fontawesome.com https://ka-p.fontawesome.com`,
              "style-src 'self' 'unsafe-inline' https://ka-p.fontawesome.com",
              "font-src 'self' https://ka-p.fontawesome.com",
              "img-src 'self' data: blob: https:",
              // Tighten connect-src to API origin instead of blanket wss:/https:
              apiUrl
                ? `connect-src 'self' ${apiUrl} ${apiWsUrl} https://ka-p.fontawesome.com`
                : "connect-src 'self' wss: ws: https:",
              "frame-ancestors 'none'",
            ].join("; "),
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
