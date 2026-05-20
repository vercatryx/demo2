import type { NextConfig } from "next";
import path from "path";
import { config as loadEnvFile } from "dotenv";

// Fill gaps when secrets live in .env.demo.local (Next only auto-loads .env.local).
// Does not override vars already set by .env / .env.local.
loadEnvFile({ path: path.join(process.cwd(), ".env.demo.local") });

const nextConfig: NextConfig = {
  /** Native addon; Turbopack must not try to bundle the `.node` binary. */
  serverExternalPackages: ["@napi-rs/canvas"],
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    serverActions: {
      // Aggregate vendor + large order payloads exceed 4MB; keep bounded but usable (default is 1MB).
      bodySizeLimit: '32mb',
    },
  },
  /**
   * Proof-of-delivery stamps read `lib/fonts/*.woff2` at runtime (Sharp SVG). Without this,
   * Vercel's serverless trace can omit that folder so @font-face is empty and glyphs show as boxes.
   */
  outputFileTracingIncludes: {
    "/**": ["./lib/fonts/**/*"],
  },
};

export default nextConfig;
