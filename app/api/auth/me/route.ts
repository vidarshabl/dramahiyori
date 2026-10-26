import { json } from "@/lib/api";
import { currentUser } from "@/lib/auth";
export const runtime="nodejs";
export async function GET() { return json({user:await currentUser()}); }
