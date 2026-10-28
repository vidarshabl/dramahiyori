import { currentAdmin } from "@/lib/auth";
import { badRequest, json, readJson, sameOriginOrReject } from "@/lib/api";
import { database, listHomepageSlides } from "@/lib/db";
import { persistHomeSlides } from "@/lib/home-slides";
import { isValidMediaUrl } from "@/lib/security";
import { invalidatePublicCatalogCache } from "@/lib/catalog";

export const runtime="nodejs";
const MAX_HOME_SLIDES=50;

export async function GET() {
  const admin=await currentAdmin();
  if(!admin)return badRequest("Administrator access is required.",403);
  return json({items:await listHomepageSlides()});
}

export async function PATCH(request:Request) {
  const rejected=sameOriginOrReject(request);if(rejected)return rejected;
  const admin=await currentAdmin();if(!admin)return badRequest("Administrator access is required.",403);
  const body=await readJson(request);
  if(!body||!Array.isArray(body.slides)||body.slides.length>MAX_HOME_SLIDES)return badRequest(`Choose up to ${MAX_HOME_SLIDES} homepage slides.`);

  const ids=new Set<string>();
  const slides:{id:string;titleId:string;backdropUrl:string}[]=[];
  for(const [index,value] of body.slides.entries()) {
    const slide=value as Record<string,unknown>;
    const id=typeof slide?.id==="string"?slide.id:"";
    const titleId=typeof slide?.titleId==="string"?slide.titleId:"";
    const backdropUrl=typeof slide?.backdropUrl==="string"?slide.backdropUrl.trim():"";
    if(!/^[a-z\d_-]{1,100}$/i.test(id)||ids.has(id))return badRequest(`Check homepage photo ${index+1}; each slide needs a unique ID.`);
    if(!titleId||titleId.length>100)return badRequest(`Choose a published title for homepage photo ${index+1}.`);
    if(!backdropUrl||!isValidMediaUrl(backdropUrl))return badRequest(`Add a valid photo URL for homepage photo ${index+1}.`);
    ids.add(id);slides.push({id,titleId,backdropUrl});
  }

  try {
    const saved=await persistHomeSlides(database,admin.id,slides);
    if(saved)invalidatePublicCatalogCache();
    return saved?json({saved:true,count:slides.length}):badRequest("One of these titles is no longer published. Reload the Home editor and try again.",409);
  } catch {
    return badRequest("Homepage photos could not be saved. Please try again.",500);
  }
}
