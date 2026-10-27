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
    const {database,listTitles,getTitle,getCastMember}=await import("./lib/db.ts");
    const applied=await database.prepare("SELECT id FROM schema_migrations ORDER BY id").all();
    assert.deepEqual(applied.map(row=>row.id),["001_initial","002_cast_gallery_media"]);
    const tables=await database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('cast_members','title_cast','title_gallery','cast_gallery','media_assets') ORDER BY name").all();
    assert.equal(tables.length,5);
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
  `;
  try {
    const result=spawnSync(process.execPath,["--experimental-strip-types","--input-type=module","-e",childScript],{cwd:projectRoot,encoding:"utf8",env:{...process.env,NODE_ENV:"development",DATA_DIR:dataDir,DATABASE_URL:"",DATABASE_TOKEN:"",TURSO_DATABASE_URL:"",TURSO_AUTH_TOKEN:""}});
    assert.equal(result.status,0,`Migration verification failed.\n${result.stdout}\n${result.stderr}`);
  } finally {
    rmSync(testRoot,{recursive:true,force:true});
  }
});
