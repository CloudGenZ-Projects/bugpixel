/**
 * Server entry point with graceful shutdown and optional R2 storage.
 *
 * When CRP_R2_ACCOUNT_ID is set, uses Cloudflare R2 for blob storage.
 * Otherwise falls back to local filesystem.
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { createDb } from "./db/createDb.js";
import { makeContainer } from "./container.js";
import { makeApp } from "./http/app.js";

function main() {
  const port = Number(process.env.PORT ?? 3000);
  const dbPath = process.env.CRP_DB_PATH ?? "data/portal.db";
  const storageRoot = process.env.CRP_STORAGE_ROOT ?? "data/storage";
  const isProd = process.env.NODE_ENV === "production";
  const secret =
    process.env.CRP_INSPECTOR_SECRET ?? (isProd ? "" : "dev-inspector-secret");

  if (isProd && !secret) {
    throw new Error("CRP_INSPECTOR_SECRET must be set in production.");
  }

  if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
  mkdirSync(storageRoot, { recursive: true });

  const db = createDb(dbPath);

  // R2 config (optional - falls back to local filesystem)
  const r2Config = process.env.CRP_R2_ACCOUNT_ID
    ? {
        accountId: process.env.CRP_R2_ACCOUNT_ID,
        accessKeyId: process.env.CRP_R2_ACCESS_KEY ?? "",
        secretAccessKey: process.env.CRP_R2_SECRET_KEY ?? "",
        bucket: process.env.CRP_R2_BUCKET ?? "bugpixel-storage",
      }
    : null;

  if (r2Config) {
    console.log(`Storage: Cloudflare R2 (bucket: ${r2Config.bucket})`);
  } else {
    console.log(`Storage: local filesystem (${storageRoot})`);
  }

  const container = makeContainer({
    db,
    inspectorTokenSecret: secret,
    storageRoot,
    r2Config: r2Config ?? undefined,
  });

  const app = makeApp(container, {
    secureCookies: isProd,
    enforceHttps: isProd,
    spaDir: process.env.CRP_SPA_DIR,
    inspectorDir: process.env.CRP_INSPECTOR_DIR,
    allowedOrigins: (process.env.CRP_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  });

  const server = app.listen(port, () => {
    console.log(`BugPixel listening on :${port} (${isProd ? "production" : "development"})`);
  });

  // --- Graceful shutdown ---------------------------------------------------
  function shutdown(signal: string) {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close(() => {
      try {
        db.close();
      } catch {
        // ignore close errors
      }
      console.log("Server closed.");
      process.exit(0);
    });
    setTimeout(() => {
      console.error("Forced shutdown after timeout.");
      process.exit(1);
    }, 10_000).unref();
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main();
