import { json } from "@/lib/api";
import { listTitles } from "@/lib/catalog";
export const runtime="nodejs";
export async function GET(request:Request) {
  const url=new URL(request.url); const filters:Record<string,string|undefined>={};
  for(const key of ["q","genre","country","year","type","status","sort","page","limit"]) filters[key]=url.searchParams.get(key)||undefined;
  if(filters.type && !["movie","series"].includes(filters.type)) filters.type=undefined;
  if(filters.year && !/^\d{4}$/.test(filters.year)) filters.year=undefined;
  return json({items:await listTitles(filters),page:Number(filters.page||1)});
}
