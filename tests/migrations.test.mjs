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
  oldDatabase.prepare("INSERT INTO titles(id,type,slug,title,published,featured) VALUES(?,?,?,?,1,1)").run("migration-title","series","migration-compatibility-audit","Migration Compatibility Audit");
  oldDatabase.close();

  const childScript=`
    import assert from "node:assert/strict";
    const {database,listTitles,getTitle,getCastMember,listCastMembers,listCastProfessions}=await import("./lib/db.ts");
    const {recordMediaUsage,recordTitleImageUsages,recordCastImageUsages}=await import("./lib/media-usage.ts");
    const applied=await database.prepare("SELECT id FROM schema_migrations ORDER BY id").all();
    assert.deepEqual(applied.map(row=>row.id),["001_initial","002_cast_gallery_media","003_media_associations","004_featured_order"]);
    const tables=await database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('cast_members','title_cast','title_gallery','cast_gallery','media_assets','media_asset_usages') ORDER BY name").all();
    assert.equal(tables.length,6);
    await database.prepare("UPDATE titles SET featured_order=? WHERE id=?").run(5,"migration-title");
    await database.prepare("INSERT INTO titles(id,type,slug,title,published,featured,featured_order) VALUES(?,?,?,?,1,1,?)").run("migration-featured-first","movie","featured-order-first","Featured Order First",1);
    assert.equal((await listTitles({sort:"featured",limit:"10"}))[0].id,"migration-featured-first");
    await database.prepare("INSERT INTO genres(id,name,slug) VALUES(?,?,?)").run("audit-genre","Audit Genre","audit-genre");
    await database.prepare("INSERT INTO title_genres(title_id,genre_id) VALUES(?,?)").run("migration-title","audit-genre");
    await database.prepare("INSERT INTO seasons(id,title_id,season_number,name) VALUES(?,?,?,?)").run("audit-season-1","migration-title",1,"Season 1");
    await database.prepare("INSERT INTO seasons(id,title_id,season_number,name) VALUES(?,?,?,?)").run("audit-season-2","migration-title",2,"Season 2");
    await database.prepare("INSERT INTO episodes(id,season_id,episode_number,title,video_url) VALUES(?,?,?,?,?)").run("audit-episode-1","audit-season-1",1,"Unstreamed opener","");
    await database.prepare("INSERT INTO episodes(id,season_id,episode_number,title,video_url) VALUES(?,?,?,?,?)").run("audit-episode-2","audit-season-2",1,"First available episode","https://media.example.test/episode.mp4");
    await database.prepare("INSERT INTO subtitle_tracks(id,episode_id,language,label,file_url,kind) VALUES(?,?,?,?,?,?)").run("audit-subtitle","audit-episode-2","en","English","https://media.example.test/episode.vtt","subtitles");
    await database.prepare("INSERT INTO cast_members(id,slug,name,biography,portrait_url) VALUES(?,?,?,?,?)").run("audit-person","migration-audit-person","Migration Audit Person","Existing-profile check","https://media.example.test/person.jpg");
    await database.prepare("INSERT INTO title_cast(id,title_id,cast_member_id,character_name,role_type) VALUES(?,?,?,?,?)").run("audit-credit","migration-title","audit-person","Lead","cast");
    await database.prepare("INSERT INTO title_gallery(id,title_id,image_url,caption) VALUES(?,?,?,?)").run("audit-title-photo","migration-title","https://media.example.test/title.jpg","Title still");
    await database.prepare("INSERT INTO cast_gallery(id,cast_member_id,image_url,caption) VALUES(?,?,?,?)").run("audit-person-photo","audit-person","https://media.example.test/person-gallery.jpg","Portrait");
    await database.prepare("INSERT INTO media_assets(id,url,pathname,filename,content_type,size_bytes,role,upload_id) VALUES(?,?,?,?,?,?,?,?)").run("audit-media","https://media.example.test/title.jpg","deardrama/audit-title.jpg","audit-title.jpg","image/jpeg",1200,"gallery","550e8400-e29b-41d4-a716-446655440000");
    assert.equal((await database.prepare("SELECT upload_id FROM media_assets WHERE id=?").get("audit-media")).upload_id,"550e8400-e29b-41d4-a716-446655440000");
    await assert.rejects(database.prepare("INSERT INTO media_assets(id,url,pathname,filename,content_type,size_bytes,upload_id) VALUES(?,?,?,?,?,?,?)").run("audit-media-duplicate","https://media.example.test/duplicate.jpg","deardrama/duplicate.jpg","duplicate.jpg","image/jpeg",1100,"550e8400-e29b-41d4-a716-446655440000"));
    await database.prepare("INSERT INTO media_assets(id,url,pathname,filename,content_type,size_bytes,role) VALUES(?,?,?,?,?,?,?)").run("audit-media-2","https://media.example.test/title-2.jpg","deardrama/audit-title-2.jpg","audit-title-2.jpg","image/jpeg",1400,"gallery");
    await recordTitleImageUsages(database,"migration-title",{poster:"",backdrop:"",gallery:[{url:"https://media.example.test/title.jpg",caption:"First still",attribution:"Archive"},{url:"https://media.example.test/title-2.jpg",caption:"Second still",attribution:"Archive"}]});
    const titleUsages=await database.prepare("SELECT role,sort_order,caption FROM media_asset_usages WHERE title_id=? ORDER BY sort_order").all("migration-title");
    assert.deepEqual(titleUsages.map(row=>[row.role,row.sort_order,row.caption]),[["gallery",0,"First still"],["gallery",1,"Second still"]]);
    assert.equal((await database.prepare("SELECT role FROM media_assets WHERE id=?").get("audit-media")).role,"gallery");
    await database.prepare("INSERT INTO media_assets(id,url,pathname,filename,content_type,size_bytes,role) VALUES(?,?,?,?,?,?,?)").run("audit-cast-media","https://media.example.test/person.jpg","deardrama/audit-person.jpg","audit-person.jpg","image/jpeg",1600,"portrait");
    await recordCastImageUsages(database,"audit-person",{portraitUrl:"https://media.example.test/person.jpg",gallery:[]});
    assert.equal((await database.prepare("SELECT role FROM media_asset_usages WHERE cast_member_id=?").get("audit-person")).role,"portrait");
    await recordMediaUsage(database,"https://media.example.test/unmanaged.jpg",{titleId:"migration-title"},"gallery");
    assert.equal(Number((await database.prepare("SELECT COUNT(*) AS n FROM media_asset_usages WHERE title_id=?").get("migration-title")).n),2);
    const listed=await listTitles({q:"Migration Compatibility Audit",genre:"Audit Genre"});
    assert.equal(listed.length,1);
    assert.equal(listed[0].has_playable_source,1);
    assert.equal(listed[0].first_playable_episode_id,"audit-episode-2");
    const title=await getTitle("migration-compatibility-audit");
    assert.equal(title.title,"Migration Compatibility Audit");
    assert.equal(title.gallery.length,1);
    assert.equal(title.cast[0].name,"Migration Audit Person");
    assert.equal(title.seasons[1].episodes[0].subtitles[0].language,"en");
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
