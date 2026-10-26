import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { demoTitles, moods } from "./demo-data.ts";

const dataDir = path.resolve(process.cwd(), process.env.DATA_DIR || "./data");
mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, "deardrama.sqlite"));
db.exec("PRAGMA busy_timeout = 30000; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
db.exec("BEGIN IMMEDIATE");
try {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  const migration="001_initial";
  if(!db.prepare("SELECT id FROM schema_migrations WHERE id=?").get(migration)) {
    db.exec(readFileSync(path.join(process.cwd(),"db","migrations","001_initial.sql"),"utf8"));
    db.prepare("INSERT INTO schema_migrations(id) VALUES(?)").run(migration);
  }
  db.exec("COMMIT");
} catch(error) { db.exec("ROLLBACK"); throw error; }

const slugify = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function seedDemoData() {
  const insertGenre = db.prepare("INSERT OR IGNORE INTO genres(id,name,slug) VALUES(?,?,?)");
  const insertTitle = db.prepare(`INSERT INTO titles(id,type,slug,title,alternative_title,synopsis,release_year,country,status,runtime_minutes,poster_url,backdrop_url,published,featured,demo)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,?,1)`);
  const linkGenre = db.prepare("INSERT OR IGNORE INTO title_genres(title_id,genre_id) VALUES(?,?)");
  const insertSeason = db.prepare("INSERT INTO seasons(id,title_id,season_number,name) VALUES(?,?,1,'Season 1')");
  const insertEpisode = db.prepare("INSERT INTO episodes(id,season_id,episode_number,title,synopsis) VALUES(?,?,?, ?, ?)");
  db.exec("BEGIN IMMEDIATE");
  try {
    const count = Number((db.prepare("SELECT COUNT(*) AS n FROM titles").get() as { n:number }).n);
    if (count) { db.exec("COMMIT"); return; }
    for (const mood of moods) insertGenre.run(randomUUID(), mood, slugify(mood));
    for (const title of demoTitles) {
      const id = randomUUID();
      insertTitle.run(id,title.type,title.slug,title.title,title.alt,title.synopsis,title.year,title.country,title.status,(title as {runtime?:number}).runtime || null,title.poster,title.backdrop,title.featured ? 1 : 0);
      for (const genre of title.genres) {
        insertGenre.run(randomUUID(),genre,slugify(genre));
        const genreRow = db.prepare("SELECT id FROM genres WHERE slug=?").get(slugify(genre)) as {id:string};
        linkGenre.run(id,genreRow.id);
      }
      if (title.type === "series") {
        const seasonId = randomUUID(); insertSeason.run(seasonId,id);
        for (let episode = 1; episode <= 4; episode++) insertEpisode.run(randomUUID(),seasonId,episode,`Episode ${episode}`,"Demonstration episode entry. No stream is configured.");
      }
    }
    for (const [key,value] of Object.entries({ brand:"DearDrama", tagline:"A little room for the stories that stay.", contactEmail:"", about:"An independent K-drama discovery experience. Replace this sample copy with your platform details." })) {
      db.prepare("INSERT OR IGNORE INTO site_settings(key,value) VALUES(?,?)").run(key,value);
    }
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

seedDemoData();

export type Title = {
  id:string; type:"movie"|"series"; slug:string; title:string; alternative_title:string; synopsis:string; release_year:number|null;
  country:string; status:"ongoing"|"completed"|"upcoming"; runtime_minutes:number|null; poster_url:string; backdrop_url:string;
  content_rating:string; subtitle_languages:string; video_url:string; published:number; featured:number; demo:number;
  genres?:string[]; episode_count?:number; season_count?:number;
};

export function listTitles(filters: Record<string,string|undefined> = {}) {
  const where = ["t.published=1"];
  const params: (string|number)[] = [];
  for (const [key,column] of [["type","t.type"],["country","t.country"],["status","t.status"],["year","t.release_year"]] as const) {
    if (filters[key]) { where.push(`${column}=?`); params.push(key === "year" ? Number(filters[key]) : filters[key]!); }
  }
  if (filters.genre) { where.push("EXISTS (SELECT 1 FROM title_genres tg JOIN genres g ON g.id=tg.genre_id WHERE tg.title_id=t.id AND (g.slug=? OR lower(g.name)=lower(?)))"); params.push(slugify(filters.genre),filters.genre); }
  if (filters.q?.trim()) { where.push("(lower(t.title) LIKE ? OR lower(t.alternative_title) LIKE ?)"); const query = `%${filters.q.trim().toLowerCase()}%`; params.push(query,query); }
  if (filters.sort === "popular") where.push("EXISTS (SELECT 1 FROM viewing_history vh WHERE vh.title_id=t.id AND vh.viewed_at>=datetime('now','-30 days'))");
  const sort = filters.sort === "alpha" ? "t.title COLLATE NOCASE ASC" : filters.sort === "oldest" ? "t.release_year ASC,t.title" : filters.sort === "popular" ? "(SELECT COUNT(*) FROM viewing_history vh WHERE vh.title_id=t.id AND vh.viewed_at>=datetime('now','-30 days')) DESC,t.title" : "t.created_at DESC,t.title";
  const page = Math.max(1,Number(filters.page || 1)); const limit = Math.min(48,Math.max(1,Number(filters.limit || 24)));
  const rows = db.prepare(`SELECT t.*, (SELECT COUNT(*) FROM episodes e JOIN seasons s ON s.id=e.season_id WHERE s.title_id=t.id) AS episode_count,
    (SELECT COUNT(*) FROM seasons s WHERE s.title_id=t.id) AS season_count FROM titles t WHERE ${where.join(" AND ")} ORDER BY ${sort} LIMIT ? OFFSET ?`).all(...params,limit,(page-1)*limit) as unknown as Title[];
  return rows.map(row => ({...row,genres: getGenres(row.id)}));
}

function getGenres(titleId:string) { return (db.prepare("SELECT g.name FROM genres g JOIN title_genres tg ON tg.genre_id=g.id WHERE tg.title_id=? ORDER BY g.name").all(titleId) as {name:string}[]).map(x=>x.name); }
export function getTitle(slug:string) {
  const row = db.prepare("SELECT * FROM titles WHERE slug=? AND published=1").get(slug) as Title|undefined;
  if (!row) return null;
  const seasons = db.prepare("SELECT id,season_number,name FROM seasons WHERE title_id=? ORDER BY season_number").all(row.id) as {id:string;season_number:number;name:string}[];
  return {...row,genres:getGenres(row.id),seasons:seasons.map(season=>({...season,episodes:(db.prepare("SELECT id,episode_number,title,synopsis,thumbnail_url,duration_minutes,video_url FROM episodes WHERE season_id=? ORDER BY episode_number").all(season.id) as {id:string;[key:string]:any}[]).map(episode=>({...episode,subtitles:db.prepare("SELECT language,label,file_url,kind FROM subtitle_tracks WHERE episode_id=?").all(episode.id)}))}))};
}

export function getUserByEmail(email:string) { return db.prepare("SELECT * FROM users WHERE email=?").get(email.toLowerCase()) as Record<string,any>|undefined; }
export function getUserById(id:string) { return db.prepare("SELECT id,email,display_name,role,status,created_at FROM users WHERE id=?").get(id) as Record<string,any>|undefined; }
export function createUser(data:{email:string;displayName:string;passwordHash:string;role?:string}) {
  const id=randomUUID(); db.prepare("INSERT INTO users(id,email,display_name,password_hash,role) VALUES(?,?,?,?,?)").run(id,data.email.toLowerCase(),data.displayName,data.passwordHash,data.role||"user"); return getUserById(id)!;
}
export const database = db;
export function safeTitle(row:Title) { return {...row,genres:row.genres || getGenres(row.id),subtitle_languages:JSON.parse(row.subtitle_languages || "[]")}; }
