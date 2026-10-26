import { json, sameOriginOrReject } from "@/lib/api";
import { destroySession } from "@/lib/auth";
export const runtime="nodejs";
export async function POST(request:Request) {
  const rejected=sameOriginOrReject(request); if(rejected)return rejected;
  await destroySession(); return json({ok:true});
}
