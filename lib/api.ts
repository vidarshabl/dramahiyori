import { NextResponse } from "next/server";
import { checkSameOrigin } from "./security";

export const json = (body:unknown,status=200) => NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
export const badRequest = (message:string,status=400) => json({error:message},status);
export const sameOriginOrReject = (request:Request) => checkSameOrigin(request) ? null : badRequest("Request could not be verified.",403);
export async function readJson(request:Request) {
  try { return await request.json() as Record<string,unknown>; } catch { return null; }
}
