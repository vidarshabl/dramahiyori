import {randomUUID} from "node:crypto";
import {currentAdmin} from "@/lib/auth";
import {badRequest,json,sameOriginOrReject} from "@/lib/api";
import {database} from "@/lib/db";
import {invalidatePublicCatalogCache} from "@/lib/catalog";
import {providedDramaCatalog} from "@/lib/provided-drama-catalog";

export const runtime="nodejs";

const slugify=(value:string)=>value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,180);

export async function POST(request:Request) {
  const rejected=sameOriginOrReject(request);if(rejected)return rejected;
  const admin=await currentAdmin();if(!admin)return badRequest("Administrator access is required.",403);
  const requestedSlug=new URL(request.url).searchParams.get("slug");
  const dramas=requestedSlug?providedDramaCatalog.filter(drama=>drama.slug===requestedSlug):providedDramaCatalog;
  if(requestedSlug&&!dramas.length)return badRequest("That supplied drama is not available to import.",404);
  let created=0,updated=0,castLinked=0,skipped=0;
  try {
    await database.transaction(async tx=>{
      for(const drama of dramas) {
        const previous=await tx.prepare("SELECT id FROM titles WHERE slug=?").get(drama.slug) as {id:string}|undefined;
        // A one-title add should never overwrite edits on an existing record.
        if(previous&&requestedSlug){skipped++;continue;}
        const titleId=previous?.id||randomUUID();
        if(previous) {
          const alternativeTitle="alternativeTitle" in drama?drama.alternativeTitle:"";
          await tx.prepare(`UPDATE titles SET type='series',catalog_type='series',title=?,alternative_title=CASE WHEN ?<>'' THEN ? ELSE alternative_title END,synopsis=?,release_year=?,country='South Korea',status='completed',runtime_minutes=?,imdb_rating=?,imdb_rating_is_estimate=?,total_episodes=?,total_runtime_minutes=?,poster_url=CASE WHEN ?<>'' THEN ? ELSE poster_url END,backdrop_url=CASE WHEN ?<>'' THEN ? ELSE backdrop_url END,published=1,demo=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
            .run(drama.title,alternativeTitle,alternativeTitle,drama.synopsis,drama.releaseYear,drama.runtimeMinutes,drama.imdbRating,drama.imdbRatingIsEstimate?1:0,drama.totalEpisodes,drama.totalRuntimeMinutes,drama.posterUrl,drama.posterUrl,drama.backdropUrl,drama.backdropUrl,titleId);
          updated++;
        } else {
          const alternativeTitle="alternativeTitle" in drama?drama.alternativeTitle:"";
          await tx.prepare(`INSERT INTO titles(id,type,catalog_type,slug,title,alternative_title,synopsis,release_year,country,status,runtime_minutes,imdb_rating,imdb_rating_is_estimate,total_episodes,total_runtime_minutes,poster_url,backdrop_url,published,featured,demo)
            VALUES(?,'series','series',?,?,?,?,?,'South Korea','completed',?,?,?,?,?,?,?,1,0,0)`)
            .run(titleId,drama.slug,drama.title,alternativeTitle,drama.synopsis,drama.releaseYear,drama.runtimeMinutes,drama.imdbRating,drama.imdbRatingIsEstimate?1:0,drama.totalEpisodes,drama.totalRuntimeMinutes,drama.posterUrl,drama.backdropUrl);
          created++;
        }

        await tx.prepare("DELETE FROM title_genres WHERE title_id=?").run(titleId);
        for(const name of drama.genres) {
          const genreSlug=slugify(name);if(!genreSlug)continue;
          await tx.prepare("INSERT OR IGNORE INTO genres(id,name,slug) VALUES(?,?,?)").run(randomUUID(),name,genreSlug);
          const genre=await tx.prepare("SELECT id FROM genres WHERE slug=?").get(genreSlug) as {id:string}|undefined;
          if(genre)await tx.prepare("INSERT OR IGNORE INTO title_genres(title_id,genre_id) VALUES(?,?)").run(titleId,genre.id);
        }

        for(const [index,image] of drama.gallery.entries()) {
          await tx.prepare("INSERT OR IGNORE INTO title_gallery(id,title_id,image_url,caption,sort_order) VALUES(?,?,?,?,?)")
            .run(randomUUID(),titleId,image.url,image.caption,index);
        }

        for(const [index,name] of drama.cast.entries()) {
          const personSlug=slugify(name);if(!personSlug)continue;
          let person=await tx.prepare("SELECT id FROM cast_members WHERE slug=?").get(personSlug) as {id:string}|undefined;
          if(!person) {
            const personId=randomUUID();
            await tx.prepare("INSERT INTO cast_members(id,slug,name,nationality,profession) VALUES(?,?,?,'South Korea','Actor')").run(personId,personSlug,name);
            person={id:personId};
          }
          const result=await tx.prepare("INSERT OR IGNORE INTO title_cast(id,title_id,cast_member_id,role_type,sort_order) VALUES(?,?,?,'cast',?)").run(randomUUID(),titleId,person.id,index);
          castLinked+=Number(result.changes);
        }
        await tx.prepare("INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)")
          .run(admin.id,previous?"content.import.update":"content.import.create","title",titleId,JSON.stringify({title:drama.title,source:"owner-provided catalog"}));
      }
    });
    invalidatePublicCatalogCache();
    return json({created,updated,castLinked,skipped,total:dramas.length,images:dramas.filter(item=>item.posterUrl||item.backdropUrl).length});
  } catch(error) {
    console.error("Provided drama catalog import failed:",error instanceof Error?error.message:"unknown error");
    return badRequest("The drama list could not be imported. Check the database connection and try again.",500);
  }
}
