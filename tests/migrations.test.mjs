import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

test("an existing 001 database upgrades in place and serves cast, galleries, and playable episode data", () => {
  const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
  const testRoot=mkdtempSync(path.join(tmpdir(),"deardrama-migration-"));
  const dataDir=path.join(testRoot,"data");
  mkdirSync(dataDir);
  const oldDatabase=new DatabaseSync(path.join(dataDir,"deardrama.sqlite"));
  oldDatabase.exec("PRAGMA foreign_keys = ON; CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
  oldDatabase.exec(readFileSync(path.join(projectRoot,"db","migrations","001_initial.sql"),"utf8"));
  oldDatabase.prepare("INSERT INTO schema_migrations(id) VALUES(?)").run("001_initial");
  oldDatabase.prepare("INSERT INTO site_settings(key,value) VALUES(?,?)").run("brand","DearDrama");
  oldDatabase.prepare("INSERT INTO titles(id,type,slug,title,published,featured) VALUES(?,?,?,?,1,1)").run("migration-title","series","migration-compatibility-audit","Migration Compatibility Audit");
  oldDatabase.prepare("UPDATE titles SET backdrop_url=? WHERE id=?").run("https://media.example.test/title-backdrop.jpg","migration-title");
  oldDatabase.close();

  const childScript=`
    import assert from "node:assert/strict";
    const {database,listTitles,listRecentEpisodeReleases,listWatchlistTitles,listHomepageSlides,getTitle,getCastMember,listCastMembers,listCastProfessions}=await import("./lib/db.ts");
    const {recordMediaUsage,recordTitleImageUsages,recordCastImageUsages}=await import("./lib/media-usage.ts");
    const {persistHomeSlides}=await import("./lib/home-slides.ts");
    const {isBlobStorageConfigured}=await import("./lib/blob-storage.ts");
    const {persistTitleEpisodes}=await import("./lib/title-episodes.ts");
    const {consumeRateLimit}=await import("./lib/rate-limit.ts");
    const applied=await database.prepare("SELECT id FROM schema_migrations ORDER BY id").all();
    assert.deepEqual(applied.map(row=>row.id),["001_initial","002_cast_gallery_media","003_media_associations","004_featured_order","005_homepage_slides","006_kverse_brand","007_deardrama_brand","008_title_catalog_metrics","009_streaming_foundation","010_rate_limits","011_episode_created_at_backfill"]);
    await database.prepare("UPDATE titles SET imdb_rating=?,imdb_rating_is_estimate=?,total_episodes=?,total_runtime_minutes=? WHERE id=?").run(8.2,0,16,1120,"migration-title");
    const titleMetrics=await database.prepare("SELECT imdb_rating,imdb_rating_is_estimate,total_episodes,total_runtime_minutes FROM titles WHERE id=?").get("migration-title");
    assert.deepEqual([titleMetrics.imdb_rating,titleMetrics.imdb_rating_is_estimate,titleMetrics.total_episodes,titleMetrics.total_runtime_minutes],[8.2,0,16,1120]);
    assert.equal((await database.prepare("SELECT value FROM site_settings WHERE key='brand'").get()).value,"DearDrama");
    delete process.env.BLOB_READ_WRITE_TOKEN;delete process.env.BLOB_STORE_ID;delete process.env.VERCEL_OIDC_TOKEN;
    assert.equal(isBlobStorageConfigured(new Request("https://example.test",{headers:{"x-vercel-oidc-token":"runtime-oidc-token"}})),false);
    process.env.BLOB_STORE_ID="connected-store";
    assert.equal(isBlobStorageConfigured(new Request("https://example.test",{headers:{"x-vercel-oidc-token":"runtime-oidc-token"}})),true);
    assert.equal(isBlobStorageConfigured(new Request("https://example.test")),false);
    process.env.VERCEL_OIDC_TOKEN="development-oidc-token";
    assert.equal(isBlobStorageConfigured(new Request("https://example.test")),true);
    delete process.env.BLOB_STORE_ID;delete process.env.VERCEL_OIDC_TOKEN;
    const limiterRequest=new Request("https://example.test/api/report",{headers:{"x-forwarded-for":"203.0.113.25","origin":"https://example.test","host":"example.test"}});
    assert.equal(await consumeRateLimit(database,limiterRequest,"migration-test",2,60_000),true);
    assert.equal(await consumeRateLimit(database,limiterRequest,"migration-test",2,60_000),true);
    assert.equal(await consumeRateLimit(database,limiterRequest,"migration-test",2,60_000),false);
    const tables=await database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('cast_members','title_cast','title_gallery','cast_gallery','media_assets','media_asset_usages','homepage_slides','content_subtitle_tracks','video_sources','download_links','download_clicks','view_events','watched_episodes','user_playback_preferences','title_requests','link_reports','api_rate_limits') ORDER BY name").all();
    assert.equal(tables.length,17);
    assert.equal((await database.prepare("SELECT catalog_type FROM titles WHERE id=?").get("migration-title")).catalog_type,"series");
    assert.deepEqual((await listHomepageSlides()).map(slide=>[slide.slide_id,slide.id,slide.backdrop_url]),[["legacy-migration-title","migration-title","https://media.example.test/title-backdrop.jpg"]]);
    await database.prepare("UPDATE titles SET featured_order=? WHERE id=?").run(5,"migration-title");
    await database.prepare("INSERT INTO titles(id,type,slug,title,published,featured,featured_order) VALUES(?,?,?,?,1,1,?)").run("migration-featured-first","movie","featured-order-first","Featured Order First",1);
    await database.prepare("INSERT INTO titles(id,type,slug,title,published,featured) VALUES(?,?,?,?,1,0)").run("migration-second-slide","series","migration-second-slide","Migration Second Slide");
    assert.equal((await listTitles({sort:"featured",limit:"10"}))[0].id,"migration-featured-first");
    await database.prepare("INSERT INTO genres(id,name,slug) VALUES(?,?,?)").run("audit-genre","Audit Genre","audit-genre");
    await database.prepare("INSERT INTO title_genres(title_id,genre_id) VALUES(?,?)").run("migration-title","audit-genre");
    await database.prepare("INSERT INTO seasons(id,title_id,season_number,name) VALUES(?,?,?,?)").run("audit-season-1","migration-title",1,"Season 1");
    await database.prepare("INSERT INTO seasons(id,title_id,season_number,name) VALUES(?,?,?,?)").run("audit-season-2","migration-title",2,"Season 2");
    await database.prepare("INSERT INTO episodes(id,season_id,episode_number,title,video_url) VALUES(?,?,?,?,?)").run("audit-episode-1","audit-season-1",1,"Unstreamed opener","");
    await database.prepare("INSERT INTO episodes(id,season_id,episode_number,title,video_url) VALUES(?,?,?,?,?)").run("audit-episode-2","audit-season-2",1,"First available episode","https://media.example.test/episode.mp4");
    await database.prepare("INSERT INTO episodes(id,season_id,episode_number,title,video_url) VALUES(?,?,?,?,?)").run("audit-episode-3","audit-season-1",2,"Second opener","");
    const {readFileSync}=await import("node:fs");const path=await import("node:path");
    await database.exec(readFileSync(path.join(process.cwd(),"db","migrations","011_episode_created_at_backfill.sql"),"utf8"));
    assert.ok((await database.prepare("SELECT created_at FROM episodes WHERE id=?").get("audit-episode-1")).created_at,"legacy episode timestamps are backfilled");
    await database.prepare("UPDATE episodes SET created_at='2020-01-01 00:00:00' WHERE id IN (?,?)").run("audit-episode-1","audit-episode-3");
    await database.prepare("INSERT INTO subtitle_tracks(id,episode_id,language,label,file_url,kind) VALUES(?,?,?,?,?,?)").run("audit-subtitle","audit-episode-2","en","English","https://media.example.test/episode.vtt","subtitles");
    await database.prepare("INSERT INTO users(id,email,display_name,password_hash) VALUES(?,?,?,?)").run("audit-user","audit-user@example.test","Audit User","unused");
    await database.prepare("INSERT INTO watch_progress(user_id,title_id,episode_id,position_seconds,duration_seconds) VALUES(?,?,?,?,?)").run("audit-user","migration-title","audit-episode-1",87,1200);
    await database.prepare("INSERT INTO viewing_history(user_id,title_id,episode_id) VALUES(?,?,?)").run("audit-user","migration-title","audit-episode-1");
    await database.prepare("INSERT INTO cast_members(id,slug,name,biography,portrait_url) VALUES(?,?,?,?,?)").run("audit-person","migration-audit-person","Migration Audit Person","Existing-profile check","https://media.example.test/person.jpg");
    await database.prepare("INSERT INTO title_cast(id,title_id,cast_member_id,character_name,role_type) VALUES(?,?,?,?,?)").run("audit-credit","migration-title","audit-person","Lead","cast");
    await database.prepare("INSERT INTO title_gallery(id,title_id,image_url,caption) VALUES(?,?,?,?)").run("audit-title-photo","migration-title","https://media.example.test/title.jpg","Title still");
    await database.prepare("INSERT INTO cast_gallery(id,cast_member_id,image_url,caption) VALUES(?,?,?,?)").run("audit-person-photo","audit-person","https://media.example.test/person-gallery.jpg","Portrait");
    await database.prepare("INSERT INTO media_assets(id,url,pathname,filename,content_type,size_bytes,role,upload_id) VALUES(?,?,?,?,?,?,?,?)").run("audit-media","https://media.example.test/title.jpg","deardrama/audit-title.jpg","audit-title.jpg","image/jpeg",1200,"gallery","550e8400-e29b-41d4-a716-446655440000");
    assert.equal((await database.prepare("SELECT upload_id FROM media_assets WHERE id=?").get("audit-media")).upload_id,"550e8400-e29b-41d4-a716-446655440000");
    await assert.rejects(database.prepare("INSERT INTO media_assets(id,url,pathname,filename,content_type,size_bytes,upload_id) VALUES(?,?,?,?,?,?,?)").run("audit-media-duplicate","https://media.example.test/duplicate.jpg","deardrama/duplicate.jpg","duplicate.jpg","image/jpeg",1100,"550e8400-e29b-41d4-a716-446655440000"));
    await database.prepare("INSERT INTO media_assets(id,url,pathname,filename,content_type,size_bytes,role) VALUES(?,?,?,?,?,?,?)").run("audit-media-2","https://media.example.test/title-2.jpg","deardrama/audit-title-2.jpg","audit-title-2.jpg","image/jpeg",1400,"gallery");
    await database.prepare("INSERT INTO media_assets(id,url,pathname,filename,content_type,size_bytes,role) VALUES(?,?,?,?,?,?,?)").run("audit-home-backdrop","https://media.example.test/home-hero.jpg","deardrama/home-hero.jpg","home-hero.jpg","image/jpeg",1500,"backdrop");
    await database.prepare("INSERT INTO media_assets(id,url,pathname,filename,content_type,size_bytes,role) VALUES(?,?,?,?,?,?,?)").run("audit-home-backdrop-2","https://media.example.test/home-hero-2.jpg","deardrama/home-hero-2.jpg","home-hero-2.jpg","image/jpeg",1550,"backdrop");
    await database.prepare("INSERT INTO media_assets(id,url,pathname,filename,content_type,size_bytes,role) VALUES(?,?,?,?,?,?,?)").run("audit-title-backdrop","https://media.example.test/title-backdrop.jpg","deardrama/title-backdrop.jpg","title-backdrop.jpg","image/jpeg",1450,"backdrop");
    await recordTitleImageUsages(database,"migration-title",{poster:"",backdrop:"",gallery:[{url:"https://media.example.test/title.jpg",caption:"First still",attribution:"Archive"},{url:"https://media.example.test/title-2.jpg",caption:"Second still",attribution:"Archive"}]});
    const titleUsages=await database.prepare("SELECT role,sort_order,caption FROM media_asset_usages WHERE title_id=? ORDER BY sort_order").all("migration-title");
    assert.deepEqual(titleUsages.map(row=>[row.role,row.sort_order,row.caption]),[["backdrop",0,""],["gallery",0,"First still"],["gallery",1,"Second still"]]);
    assert.equal((await database.prepare("SELECT role FROM media_assets WHERE id=?").get("audit-media")).role,"gallery");
    await database.prepare("INSERT INTO media_assets(id,url,pathname,filename,content_type,size_bytes,role) VALUES(?,?,?,?,?,?,?)").run("audit-cast-media","https://media.example.test/person.jpg","deardrama/audit-person.jpg","audit-person.jpg","image/jpeg",1600,"portrait");
    await recordCastImageUsages(database,"audit-person",{portraitUrl:"https://media.example.test/person.jpg",gallery:[]});
    assert.equal((await database.prepare("SELECT role FROM media_asset_usages WHERE cast_member_id=?").get("audit-person")).role,"portrait");
    await recordMediaUsage(database,"https://media.example.test/unmanaged.jpg",{titleId:"migration-title"},"gallery");
    assert.equal(Number((await database.prepare("SELECT COUNT(*) AS n FROM media_asset_usages WHERE title_id=?").get("migration-title")).n),3);
    assert.equal(await persistHomeSlides(database,"audit-user",[
      {id:"home-slide-1",titleId:"migration-title",backdropUrl:"https://media.example.test/home-hero.jpg"},
      {id:"home-slide-2",titleId:"migration-title",backdropUrl:"https://media.example.test/home-hero-2.jpg"},
      {id:"home-slide-3",titleId:"migration-second-slide",backdropUrl:"https://media.example.test/home-hero.jpg"},
    ]),true);
    assert.equal((await database.prepare("SELECT featured,featured_order,backdrop_url FROM titles WHERE id=?").get("migration-title")).backdrop_url,"https://media.example.test/title-backdrop.jpg");
    assert.deepEqual((await listHomepageSlides()).map(slide=>[slide.slide_id,slide.id,slide.backdrop_url]),[
      ["home-slide-1","migration-title","https://media.example.test/home-hero.jpg"],
      ["home-slide-2","migration-title","https://media.example.test/home-hero-2.jpg"],
      ["home-slide-3","migration-second-slide","https://media.example.test/home-hero.jpg"],
    ]);
    assert.equal(Number((await database.prepare("SELECT featured_order FROM titles WHERE id=?").get("migration-title")).featured_order),0);
    assert.equal(Number((await database.prepare("SELECT featured_order FROM titles WHERE id=?").get("migration-second-slide")).featured_order),2);
    assert.equal(Number((await database.prepare("SELECT featured FROM titles WHERE id=?").get("migration-featured-first")).featured),0);
    assert.equal((await database.prepare("SELECT role FROM media_asset_usages WHERE title_id=? AND media_asset_id=?").get("migration-title","audit-home-backdrop")).role,"backdrop");
    assert.equal((await listTitles({sort:"featured",limit:"10"}))[0].id,"migration-title");
    await recordTitleImageUsages(database,"migration-title",{poster:"",backdrop:"https://media.example.test/title-backdrop.jpg",gallery:[{url:"https://media.example.test/title.jpg",caption:"First still",attribution:"Archive"}]});
    assert.ok(await database.prepare("SELECT id FROM media_asset_usages WHERE title_id=? AND media_asset_id=? AND role='backdrop'").get("migration-title","audit-home-backdrop-2"));
    assert.ok(await database.prepare("SELECT id FROM media_asset_usages WHERE title_id=? AND media_asset_id=? AND role='backdrop'").get("migration-title","audit-title-backdrop"));
    await persistTitleEpisodes(database,"migration-title",[
      {id:"audit-episode-3",seasonNumber:1,episodeNumber:1,title:"Second opener",videoUrl:""},
      {id:"audit-episode-1",seasonNumber:1,episodeNumber:2,title:"Unstreamed opener",videoUrl:""},
      {id:"audit-episode-2",seasonNumber:2,episodeNumber:1,title:"First available episode",videoUrl:"https://media.example.test/episode.mp4",airDate:"2026-10-26",publishAt:"2026-10-27T12:30",published:true,subtitles:[{language:"si",label:"සිංහල",fileUrl:"https://media.example.test/episode.vtt",kind:"subtitles",isDefault:true,timingOffset:0.5}]},
    ]);
    assert.equal((await database.prepare("SELECT id FROM episodes WHERE season_id=? AND episode_number=2").get("audit-season-1")).id,"audit-episode-1");
    assert.equal((await database.prepare("SELECT episode_id,position_seconds FROM watch_progress WHERE user_id=? AND title_id=?").get("audit-user","migration-title")).episode_id,"audit-episode-1");
    assert.equal(Number((await database.prepare("SELECT position_seconds FROM watch_progress WHERE user_id=? AND title_id=?").get("audit-user","migration-title")).position_seconds),87);
    assert.equal((await database.prepare("SELECT episode_id FROM viewing_history WHERE user_id=? AND title_id=?").get("audit-user","migration-title")).episode_id,"audit-episode-1");
    const scheduled=await database.prepare("SELECT air_date,published FROM episodes WHERE id=?").get("audit-episode-2");
    assert.deepEqual([scheduled.air_date,Number(scheduled.published)],["2026-10-26",1]);
    assert.equal((await database.prepare("SELECT language,is_default,timing_offset FROM content_subtitle_tracks WHERE episode_id=?").get("audit-episode-2")).language,"si");
    assert.equal((await database.prepare("SELECT vtt_url FROM content_subtitle_tracks WHERE episode_id=?").get("audit-episode-2")).vtt_url,"https://media.example.test/episode.vtt");
    assert.equal((await database.prepare("SELECT url FROM video_sources WHERE id=?").get("legacy-episode-audit-episode-2")).url,"https://media.example.test/episode.mp4");
    const latestReleases=await listRecentEpisodeReleases(5);
    assert.equal(latestReleases[0].id,"audit-episode-2");
    assert.equal(Object.getPrototypeOf(latestReleases[0]),Object.prototype,"release rows are plain objects safe to pass into client components");
    const listed=await listTitles({q:"Migration Compatibility Audit",genre:"Audit Genre"});
    assert.equal(listed.length,1);
    assert.equal(listed[0].has_playable_source,1);
    assert.equal(listed[0].first_playable_episode_id,"audit-episode-2");
    await database.prepare("INSERT INTO watchlist_items(user_id,title_id) VALUES(?,?)").run("audit-user","migration-title");
    await database.prepare("UPDATE episodes SET created_at='2020-01-01 00:00:00',publish_at=NULL WHERE season_id IN (SELECT id FROM seasons WHERE title_id=?)").run("migration-title");
    await database.prepare("UPDATE episodes SET created_at=CURRENT_TIMESTAMP WHERE id=?").run("audit-episode-2");
    const watchlist=await listWatchlistTitles("audit-user");
    assert.equal(watchlist.length,1);
    assert.equal(watchlist[0].has_new_episode,1);
    assert.equal(watchlist[0].first_playable_episode_id,"audit-episode-2");
    await database.prepare("UPDATE episodes SET created_at='2020-01-01 00:00:00',publish_at=NULL WHERE id=?").run("audit-episode-2");
    assert.equal((await listWatchlistTitles("audit-user"))[0].has_new_episode,0);
    await database.prepare("INSERT INTO view_events(id,title_id,episode_id,visitor_key) VALUES(?,?,?,?)").run("audit-view-1","migration-title","audit-episode-2","guest-1");
    assert.equal((await listTitles({sort:"popular"}))[0].id,"migration-title");
    const title=await getTitle("migration-compatibility-audit");
    assert.equal(title.title,"Migration Compatibility Audit");
    assert.equal(title.gallery.length,1);
    assert.equal(title.cast[0].name,"Migration Audit Person");
    assert.equal(title.seasons[1].episodes[0].subtitles[0].language,"si");
    assert.equal(Object.getPrototypeOf(title.seasons[1].episodes[0].subtitles[0]),Object.prototype);
    const person=await getCastMember("migration-audit-person");
    assert.equal(person.credits[0].title_slug,"migration-compatibility-audit");
    assert.equal(person.gallery.length,1);
    assert.equal((await listCastMembers({query:"audit person",profession:"Actor"})).length,1);
    assert.deepEqual(await listCastProfessions(),["Actor"]);
  `;
  try {
    const result=spawnSync(process.execPath,["--experimental-strip-types","--input-type=module","-e",childScript],{cwd:projectRoot,encoding:"utf8",env:{...process.env,NODE_ENV:"development",DATA_DIR:dataDir,DATABASE_URL:"",DATABASE_TOKEN:"",TURSO_DATABASE_URL:"",TURSO_AUTH_TOKEN:""}});
    assert.equal(result.status,0,`Migration verification failed.\n${result.stdout}\n${result.stderr}`);
  } finally {
    rmSync(testRoot,{recursive:true,force:true});
  }
});
