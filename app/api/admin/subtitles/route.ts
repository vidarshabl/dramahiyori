import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { currentAdmin } from "@/lib/auth";
import { badRequest, json, sameOriginOrReject } from "@/lib/api";
import { isBlobStorageConfigured } from "@/lib/blob-storage";
import { convertSrtToVtt, validateVtt } from "@/lib/subtitle-utils";

export const runtime = "nodejs";
const MAX_SUBTITLE_BYTES = 1024 * 1024;

export async function POST(request: Request) {
  const rejected = sameOriginOrReject(request);
  if (rejected) return rejected;
  const admin = await currentAdmin();
  if (!admin) return badRequest("Administrator access is required.", 403);

  let file: FormDataEntryValue | null;
  try { file = (await request.formData()).get("file"); }
  catch { return badRequest("Choose a .srt or .vtt subtitle file."); }
  if (typeof File === "undefined" || !(file instanceof File)) return badRequest("Choose a .srt or .vtt subtitle file.");
  if (file.size < 1 || file.size > MAX_SUBTITLE_BYTES) return badRequest("Subtitle files must be smaller than 1 MB.", 413);
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension !== "srt" && extension !== "vtt") return badRequest("Only .srt and .vtt subtitle files are accepted.");

  let output: string;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    output = extension === "srt" ? convertSrtToVtt(bytes) : validateVtt(bytes);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "The subtitle file is invalid.", 400);
  }
  if (!isBlobStorageConfigured(request)) return badRequest("Persistent subtitle storage is not configured. Connect a Vercel Blob store first.", 503);

  try {
    const blob = new Blob([output], { type: "text/vtt; charset=utf-8" });
    const url = await put(`deardrama/subtitles/${randomUUID()}.vtt`, blob, {
      access: "public", addRandomSuffix: false, contentType: "text/vtt; charset=utf-8", cacheControlMaxAge: 60 * 60 * 24 * 30,
    });
    return json({ url: url.url, filename: `${file.name.replace(/\.(srt|vtt)$/i, "")}.vtt`, contentType: "text/vtt" }, 201);
  } catch {
    return badRequest("The subtitle file could not be saved. Check Vercel Blob storage and try again.", 502);
  }
}
