import { currentUser } from "@/lib/auth";
import { badRequest, json, readJson, sameOriginOrReject } from "@/lib/api";
import { database } from "@/lib/db";
import { listTitles } from "@/lib/catalog";
export const runtime="nodejs";
export async function GET() {
  const user=await currentUser(); if(!user)return badRequest("Sign in to open your watchlist.",401);
  const rows=await database.prepare("SELECT t.* FROM titles t JOIN watchlist_items w ON w.title_id=t.id WHERE w.user_id=? AND t.published=1 ORDER BY w.created_at DESC").all(user.id) as {id:string;[key:string]:any}[];
  const all=await listTitles({limit:"48"}); const byId=new Map(all.map(item=>[item.id,item]));
  return json({items:rows.map(row=>byId.get(row.id)).filter(Boolean)});
}
export async function POST(request:Request) {
  const rejected=sameOriginOrReject(request); if(rejected)return rejected;
  const user=await currentUser(); if(!user)return badRequest("Sign in to save titles.",401);
  const body=await readJson(request); const id=typeof body?.titleId==="string"?body.titleId:"";
  if(!await database.prepare("SELECT id FROM titles WHERE id=? AND published=1").get(id))return badRequest("That title is no longer available.",404);
  await database.prepare("INSERT OR IGNORE INTO watchlist_items(user_id,title_id) VALUES(?,?)").run(user.id,id);
  return json({saved:true});
}
export async function DELETE(request:Request) {
  const rejected=sameOriginOrReject(request); if(rejected)return rejected;
  const user=await currentUser(); if(!user)return badRequest("Sign in to update your watchlist.",401);
  const id=new URL(request.url).searchParams.get("titleId"); if(!id)return badRequest("A title is required.");
  await database.prepare("DELETE FROM watchlist_items WHERE user_id=? AND title_id=?").run(user.id,id); return json({saved:false});
}
