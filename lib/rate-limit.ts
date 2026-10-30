import { createHash } from "node:crypto";
import type { DatabaseAdapter } from "./db.ts";

function clientKey(request: Request) {
  const forwarded = request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for") || "unknown";
  const address = forwarded.split(",")[0]?.trim().slice(0, 120) || "unknown";
  return address;
}

/** A small persistent fixed-window limiter; only a one-way IP digest is stored. */
export async function consumeRateLimit(db: DatabaseAdapter, request: Request, scope: string, limit: number, windowMs: number) {
  const keyHash = createHash("sha256").update(`${scope}:${clientKey(request)}`).digest("hex");
  const now = Date.now();
  const allowed = await db.transaction(async (tx) => {
    const row = await tx.prepare("SELECT window_started_at,request_count FROM api_rate_limits WHERE key_hash=?").get(keyHash) as { window_started_at: number; request_count: number } | undefined;
    if (row && now - Number(row.window_started_at) < windowMs && Number(row.request_count) >= limit) return false;
    await tx.prepare(`INSERT INTO api_rate_limits(key_hash,window_started_at,request_count) VALUES(?,?,1)
      ON CONFLICT(key_hash) DO UPDATE SET
        window_started_at=CASE WHEN excluded.window_started_at-api_rate_limits.window_started_at>=? THEN excluded.window_started_at ELSE api_rate_limits.window_started_at END,
        request_count=CASE WHEN excluded.window_started_at-api_rate_limits.window_started_at>=? THEN 1 ELSE api_rate_limits.request_count+1 END`)
      .run(keyHash, now, windowMs, windowMs);
    return true;
  });
  if (Math.random() < 0.01) {
    await db.prepare("DELETE FROM api_rate_limits WHERE window_started_at<?").run(now - 24 * 60 * 60 * 1000);
  }
  return allowed;
}
