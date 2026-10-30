import { currentUser } from "@/lib/auth";
import { badRequest, json, readJson, sameOriginOrReject } from "@/lib/api";
import { database } from "@/lib/db";

export const runtime = "nodejs";
export async function GET() {
  const user = await currentUser();
  if (!user) return json({ preferences: null });
  const preferences = await database.prepare("SELECT volume,quality,subtitle_language AS subtitleLanguage FROM user_playback_preferences WHERE user_id=?").get(user.id);
  return json({ preferences: preferences || { volume: 1, quality: "auto", subtitleLanguage: "si" } });
}

export async function POST(request: Request) {
  const rejected = sameOriginOrReject(request);
  if (rejected) return rejected;
  const user = await currentUser();
  if (!user) return badRequest("Sign in to save playback preferences to your account.", 401);
  const body = await readJson(request);
  if (!body) return badRequest("Enter playback preferences.");
  const volume = Number(body.volume);
  const quality = typeof body.quality === "string" ? body.quality : "";
  const subtitleLanguage = typeof body.subtitleLanguage === "string" ? body.subtitleLanguage.trim().slice(0, 20) : "si";
  if (!Number.isFinite(volume) || volume < 0 || volume > 1 || !("auto 480p 720p 1080p".split(" ") as string[]).includes(quality)) return badRequest("Choose a supported volume and quality.");
  await database.prepare(`INSERT INTO user_playback_preferences(user_id,volume,quality,subtitle_language,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET volume=excluded.volume,quality=excluded.quality,subtitle_language=excluded.subtitle_language,updated_at=CURRENT_TIMESTAMP`)
    .run(user.id, volume, quality, subtitleLanguage);
  return json({ saved: true });
}
