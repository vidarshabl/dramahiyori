import { randomUUID } from "node:crypto";
import { currentUser } from "@/lib/auth";
import { badRequest, json, readJson, sameOriginOrReject } from "@/lib/api";
import { database } from "@/lib/db";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export async function GET() {
  const user = await currentUser();
  if (!user) return json({ items: [] });
  const items = await database.prepare("SELECT id,requested_title,details,status,created_at,updated_at FROM title_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 50").all(user.id);
  return json({ items });
}

export async function POST(request: Request) {
  const rejected = sameOriginOrReject(request);
  if (rejected) return rejected;
  if (!await consumeRateLimit(database, request, "title-request", 3, 24 * 60 * 60_000)) return badRequest("You have sent the maximum number of title requests for today.", 429);
  const body = await readJson(request);
  const requestedTitle = typeof body?.title === "string" ? body.title.trim() : "";
  const details = typeof body?.details === "string" ? body.details.trim().slice(0, 1000) : "";
  if (requestedTitle.length < 2 || requestedTitle.length > 120) return badRequest("Enter a title between 2 and 120 characters.");
  const user = await currentUser();
  if (user && await database.prepare("SELECT id FROM title_requests WHERE user_id=? AND lower(requested_title)=lower(?) AND status IN ('open','reviewing')").get(user.id, requestedTitle)) return badRequest("You already have an open request for this title.", 409);
  await database.prepare("INSERT INTO title_requests(id,user_id,requested_title,details) VALUES(?,?,?,?)").run(randomUUID(), user?.id || null, requestedTitle, details);
  return json({ submitted: true, trackingAvailable: Boolean(user) }, 201);
}
