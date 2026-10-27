import type { DatabaseAdapter } from "./db.ts";
import { recordMediaUsage } from "./media-usage.ts";

export type HomeSlideInput={id:string;titleId:string;backdropUrl:string};

export async function persistHomeSlides(db:DatabaseAdapter,adminId:string,slides:HomeSlideInput[]) {
  return await db.transaction(async tx=>{
    const existing=await tx.prepare("SELECT id,featured FROM titles WHERE published=1").all() as Array<{id:string;featured:number}>;
    const byId=new Map(existing.map(title=>[title.id,title]));
    if(new Set(slides.map(slide=>slide.id)).size!==slides.length||slides.some(slide=>!byId.has(slide.titleId)))return false;
    const selected=new Map<string,number>();
    for(const [index,slide] of slides.entries())if(!selected.has(slide.titleId))selected.set(slide.titleId,index);
    await tx.prepare("DELETE FROM homepage_slides").run();
    for(const [sortOrder,slide] of slides.entries()) {
      await tx.prepare("INSERT INTO homepage_slides(id,title_id,backdrop_url,sort_order) VALUES(?,?,?,?)").run(slide.id,slide.titleId,slide.backdropUrl,sortOrder);
    }
    for(const title of existing) {
      const order=selected.get(title.id);
      await tx.prepare("UPDATE titles SET featured=?,featured_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND published=1").run(order===undefined?0:1,order??0,title.id);
    }
    await tx.prepare("DELETE FROM media_asset_usages WHERE role='backdrop' AND title_id IS NOT NULL").run();
    const titleBackdrops=await tx.prepare("SELECT id,backdrop_url FROM titles WHERE trim(backdrop_url)<>''").all() as Array<{id:string;backdrop_url:string}>;
    for(const title of titleBackdrops)await recordMediaUsage(tx,title.backdrop_url,{titleId:title.id},"backdrop");
    for(const slide of slides)await recordMediaUsage(tx,slide.backdropUrl,{titleId:slide.titleId},"backdrop");
    await tx.prepare("INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)")
      .run(adminId,"home.slides.update","homepage","hero",JSON.stringify({slideIds:slides.map(slide=>slide.id),titleIds:slides.map(slide=>slide.titleId),count:slides.length}));
    return true;
  });
}
