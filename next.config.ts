import { existsSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// INDB rows live only on this machine (no licence, so never in git). When
// scripts/import-indb.ts has written them, they replace the empty placeholder.
const INDB_LOCAL = "./src/lib/data/indb-foods.local.ts";
const indbAlias: Record<string, string> = existsSync(join(process.cwd(), INDB_LOCAL)) ? { "@/lib/data/indb-foods": INDB_LOCAL } : {};

// Static pages can't carry nonces, so scripts need 'unsafe-inline' (Next's
// no-nonce CSP). Everything else is locked to this origin, plus Supabase for
// sync. No upgrade-insecure-requests: the app is tested over plain http on
// the local Wi-Fi, and the deployed host serves https anyway.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The barcode scanner needs the camera; nothing needs the rest.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    resolveAlias: indbAlias,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
