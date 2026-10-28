import { createClient, type Client, type Transaction } from "@libsql/client";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { demoTitles, moods } from "./demo-data.ts";

type Args = unknown[];
type Row = Record<string, any>;
type RunResult = { changes: number; lastInsertRowid?: number | bigint };

interface Provider {
  get<T = Row>(sql: string, args?: Args): Promise<T | undefined>;
  all<T = Row>(sql: string, args?: Args): Promise<T[]>;
  run(sql: string, args?: Args): Promise<RunResult>;
  exec(sql: string): Promise<void>;
  transaction<T>(work: (transaction: Provider) => Promise<T>): Promise<T>;
}

export interface DatabaseAdapter {
  prepare(sql: string): {
    get<T = Row>(...args: Args): Promise<T | undefined>;
    all<T = Row>(...args: Args): Promise<T[]>;
    run(...args: Args): Promise<RunResult>;
  };
  exec(sql: string): Promise<void>;
  transaction<T>(work: (transaction: DatabaseAdapter) => Promise<T>): Promise<T>;
}

class RemoteProvider implements Provider {
  private readonly client: Client;
  private readonly executor: Client | Transaction;

  constructor(client: Client, executor: Client | Transaction = client) {
    this.client = client;
    this.executor = executor;
  }

  async get<T = Row>(sql: string, args: Args = []): Promise<T | undefined> {
    const result = await this.executor.execute({ sql, args: args as any });
    return result.rows[0] as T | undefined;
  }

  async all<T = Row>(sql: string, args: Args = []): Promise<T[]> {
    const result = await this.executor.execute({ sql, args: args as any });
    return result.rows as unknown as T[];
  }

  async run(sql: string, args: Args = []): Promise<RunResult> {
    const result = await this.executor.execute({ sql, args: args as any });
    return { changes: Number(result.rowsAffected), lastInsertRowid: result.lastInsertRowid };
  }

  async exec(sql: string): Promise<void> {
    await this.executor.executeMultiple(sql);
  }

  async transaction<T>(work: (transaction: Provider) => Promise<T>): Promise<T> {
    if (this.executor !== this.client) throw new Error("Nested database transactions are not supported.");
    const tx = await this.client.transaction("write");
    try {
      const result = await work(new RemoteProvider(this.client, tx));
      await tx.commit();
      return result;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }
}

class LocalProvider implements Provider {
  private readonly db: any;

  constructor(db: any) {
    this.db = db;
  }

  async get<T = Row>(sql: string, args: Args = []): Promise<T | undefined> {
    return this.db.prepare(sql).get(...args) as T | undefined;
  }

  async all<T = Row>(sql: string, args: Args = []): Promise<T[]> {
    return this.db.prepare(sql).all(...args) as T[];
  }

  async run(sql: string, args: Args = []): Promise<RunResult> {
    const result = this.db.prepare(sql).run(...args);
    return { changes: Number(result.changes), lastInsertRowid: result.lastInsertRowid };
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async transaction<T>(work: (transaction: Provider) => Promise<T>): Promise<T> {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = await work(this);
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

const MIGRATIONS = ["001_initial", "002_cast_gallery_media", "003_media_associations", "004_featured_order", "005_homepage_slides", "006_kverse_brand", "007_deardrama_brand", "008_title_catalog_metrics", "009_streaming_foundation"] as const;

function migrationSql(migration: typeof MIGRATIONS[number]): string {
  const file = path.join(process.cwd(), "db", "migrations", `${migration}.sql`);
  return readFileSync(file, "utf8").replace(/^\s*PRAGMA\s+foreign_keys\s*=\s*ON\s*;?/im, "");
}

function resolveRemoteSetting(primaryName: string, alternateName: string): string | undefined {
  const primary = process.env[primaryName]?.trim();
  const alternate = process.env[alternateName]?.trim();
  if (primary && alternate && primary !== alternate) {
    throw new Error(`Conflicting ${primaryName} and ${alternateName} settings. Configure only one value.`);
  }
  return primary || alternate || undefined;
}

export function getDatabaseConfigurationSummary() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
  const databaseToken = process.env.DATABASE_TOKEN?.trim();
  const tursoToken = process.env.TURSO_AUTH_TOKEN?.trim();
  const configuredUrl = databaseUrl || tursoUrl;
  let urlProtocol = "unset";
  if(configuredUrl) {
    try { urlProtocol=new URL(configuredUrl).protocol; } catch { urlProtocol="invalid"; }
  }

  return {
    provider: !configuredUrl ? process.env.NODE_ENV === "development" ? "local-development" : "unconfigured" : urlProtocol === "libsql:" ? "turso" : "invalid-remote-url",
    urlProtocol,
    urlVariable: databaseUrl ? "DATABASE_URL" : tursoUrl ? "TURSO_DATABASE_URL" : "unset",
    tokenVariable: databaseToken ? "DATABASE_TOKEN" : tursoToken ? "TURSO_AUTH_TOKEN" : "unset",
    tokenConfigured: Boolean(databaseToken || tursoToken),
    conflictingUrlAliases: Boolean(databaseUrl && tursoUrl && databaseUrl !== tursoUrl),
    conflictingTokenAliases: Boolean(databaseToken && tursoToken && databaseToken !== tursoToken),
  } as const;
}

async function createRemoteProvider(urlValue: string, token: string): Promise<Provider> {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throw new Error("DATABASE_URL must be a valid libsql:// Turso URL.");
  }
  if (url.protocol !== "libsql:" || !url.hostname || url.username || url.password) {
    throw new Error("DATABASE_URL must use a libsql:// Turso URL; keep the auth token in DATABASE_TOKEN.");
  }

  const provider = new RemoteProvider(createClient({ url: url.toString(), authToken: token }));
  await provider.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  for (const migration of MIGRATIONS) {
    const applied = await provider.get("SELECT id FROM schema_migrations WHERE id=?", [migration]);
    if (!applied) {
      await provider.exec(migrationSql(migration));
      await provider.run("INSERT OR IGNORE INTO schema_migrations(id) VALUES(?)", [migration]);
    }
  }
  return provider;
}

async function createLocalProvider(): Promise<Provider> {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Local SQLite is enabled only in development. Configure DATABASE_URL and DATABASE_TOKEN for deployment.");
  }

  const { mkdirSync } = await import("node:fs");
  const dataDir = path.resolve(process.cwd(), process.env.DATA_DIR || "./data");
  mkdirSync(dataDir, { recursive: true });
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path.join(dataDir, "deardrama.sqlite"));
  db.exec("PRAGMA busy_timeout = 30000; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  const provider = new LocalProvider(db);

  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    for (const migration of MIGRATIONS) {
      if (!db.prepare("SELECT id FROM schema_migrations WHERE id=?").get(migration)) {
        db.exec(migrationSql(migration));
        db.prepare("INSERT INTO schema_migrations(id) VALUES(?)").run(migration);
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    db.close();
    throw error;
  }

  await seedDemoDataWith(provider);
  return provider;
}

async function createProvider(): Promise<Provider> {
  const url = resolveRemoteSetting("DATABASE_URL", "TURSO_DATABASE_URL");
  const token = resolveRemoteSetting("DATABASE_TOKEN", "TURSO_AUTH_TOKEN");

  if (url) {
    if (!url.toLowerCase().startsWith("libsql://")) {
      throw new Error("DATABASE_URL must start with libsql:// for a Turso deployment.");
    }
    if (!token) throw new Error("Set DATABASE_TOKEN (or TURSO_AUTH_TOKEN) for the Turso database.");
    return createRemoteProvider(url, token);
  }

  if (process.env.NODE_ENV === "development") return createLocalProvider();
  throw new Error("Turso database configuration is required outside local development.");
}

let providerPromise: Promise<Provider> | undefined;
async function getProvider(): Promise<Provider> {
  if (!providerPromise) {
    providerPromise = createProvider().catch((error) => {
      providerPromise = undefined;
      throw error;
    });
  }
  return providerPromise;
}

function adapterFor(provider: Provider): DatabaseAdapter {
  return {
    prepare(sql) {
      return {
        get: (...args) => provider.get(sql, args),
        all: (...args) => provider.all(sql, args),
        run: (...args) => provider.run(sql, args),
      };
    },
    exec: (sql) => provider.exec(sql),
    transaction: (work) => provider.transaction((tx) => work(adapterFor(tx))),
  };
}

export const database: DatabaseAdapter = {
  prepare(sql) {
    return {
      get: async (...args) => (await getProvider()).get(sql, args),
      all: async (...args) => (await getProvider()).all(sql, args),
      run: async (...args) => (await getProvider()).run(sql, args),
    };
  },
  exec: async (sql) => (await getProvider()).exec(sql),
  transaction: async (work) => (await getProvider()).transaction((tx) => work(adapterFor(tx))),
};

const slugify = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function seedDemoDataWith(provider: Provider): Promise<void> {
  await provider.transaction(async (tx) => {
    const count = Number((await tx.get<{ n: number }>("SELECT COUNT(*) AS n FROM titles"))?.n || 0);
    if (count) return;

    for (const mood of moods) {
      await tx.run("INSERT OR IGNORE INTO genres(id,name,slug) VALUES(?,?,?)", [randomUUID(), mood, slugify(mood)]);
    }
    for (const title of demoTitles) {
      const id = randomUUID();
      await tx.run(`INSERT INTO titles(id,type,slug,title,alternative_title,synopsis,release_year,country,status,runtime_minutes,poster_url,backdrop_url,published,featured,demo)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,?,1)`, [id,title.type,title.slug,title.title,title.alt,title.synopsis,title.year,title.country,title.status,(title as {runtime?:number}).runtime || null,title.poster,title.backdrop,title.featured ? 1 : 0]);
      for (const genre of title.genres) {
        const genreSlug = slugify(genre);
        await tx.run("INSERT OR IGNORE INTO genres(id,name,slug) VALUES(?,?,?)", [randomUUID(),genre,genreSlug]);
        const genreRow = await tx.get<{id:string}>("SELECT id FROM genres WHERE slug=?", [genreSlug]);
        if (genreRow) await tx.run("INSERT OR IGNORE INTO title_genres(title_id,genre_id) VALUES(?,?)", [id,genreRow.id]);
      }
      if (title.type === "series") {
        const seasonId = randomUUID();
        await tx.run("INSERT INTO seasons(id,title_id,season_number,name) VALUES(?,?,1,'Season 1')", [seasonId,id]);
        for (let episode = 1; episode <= 4; episode++) {
          await tx.run("INSERT INTO episodes(id,season_id,episode_number,title,synopsis) VALUES(?,?,?, ?, ?)", [randomUUID(),seasonId,episode,`Episode ${episode}`,"Demonstration episode entry. No stream is configured."]);
        }
      }
    }
    for (const [key,value] of Object.entries({ brand:"DearDrama", tagline:"A little room for the stories that stay.", contactEmail:"", about:"An independent K-drama discovery experience. Replace this sample copy with your platform details." })) {
      await tx.run("INSERT OR IGNORE INTO site_settings(key,value) VALUES(?,?)", [key,value]);
    }
  });
}

export async function seedDemoData(): Promise<void> {
  await seedDemoDataWith(await getProvider());
}

export type Title = {
  id:string; type:"movie"|"series"|"variety"; slug:string; title:string; alternative_title:string; sinhala_title:string; synopsis:string; release_year:number|null;
  country:string; air_day:string; has_sinhala_subtitles:number; status:"ongoing"|"completed"|"upcoming"; runtime_minutes:number|null; imdb_rating:number|null; imdb_rating_is_estimate:number; total_episodes:number|null; total_runtime_minutes:number|null; poster_url:string; backdrop_url:string;
  content_rating:string; subtitle_languages:string; video_url:string; published:number; featured:number; featured_order:number; demo:number;
  genres?:string[]; episode_count?:number; season_count?:number; has_playable_source?:number; first_playable_episode_id?:string|null;
};

export type TitleSummary = Pick<Title,"id"|"type"|"slug"|"title"|"alternative_title"|"sinhala_title"|"has_sinhala_subtitles"|"synopsis"|"release_year"|"country"|"air_day"|"status"|"poster_url"|"backdrop_url"|"featured"|"demo"> & {
  genres?:string[];has_playable_source:number;first_playable_episode_id:string|null;
};

export type GalleryImage = {id:string;image_url:string;caption:string;attribution:string;sort_order:number};
export type CastCredit = {id:string;cast_member_id:string;slug:string;name:string;portrait_url:string;character_name:string;role_type:"cast"|"director"|"writer"|"producer";sort_order:number};
export type CastMember = {id:string;slug:string;name:string;biography:string;nationality:string;profession:string;portrait_url:string;created_at:string;updated_at:string;gallery?:GalleryImage[];credits?:Array<CastCredit & {title_id:string;title_slug:string;title:string;title_type:"movie"|"series"|"variety";release_year:number|null;poster_url:string}>};
export type CastDirectoryItem = Pick<CastMember,"id"|"slug"|"name"|"profession"|"nationality"|"portrait_url"> & { title_count:number; known_for:string|null };

export async function listTitles(filters: Record<string,string|undefined> = {}): Promise<TitleSummary[]> {
  const where = ["t.published=1"];
  const params: (string|number)[] = [];
  if (filters.sort === "featured") where.push("t.featured=1");
  for (const [key,column] of [["type","t.catalog_type"],["country","t.country"],["status","t.status"],["year","t.release_year"]] as const) {
    if (filters[key]) { where.push(`${column}=?`); params.push(key === "year" ? Number(filters[key]) : filters[key]!); }
  }
  if (filters.genre) { where.push("EXISTS (SELECT 1 FROM title_genres tg JOIN genres g ON g.id=tg.genre_id WHERE tg.title_id=t.id AND (g.slug=? OR lower(g.name)=lower(?)))"); params.push(slugify(filters.genre),filters.genre); }
  if (filters.hasSinhalaSubtitles === "true") where.push("t.has_sinhala_subtitles=1");
  if (filters.q?.trim()) { where.push("(lower(t.title) LIKE ? OR lower(t.alternative_title) LIKE ? OR t.sinhala_title LIKE ? OR EXISTS (SELECT 1 FROM title_cast tc JOIN cast_members cm ON cm.id=tc.cast_member_id WHERE tc.title_id=t.id AND lower(cm.name) LIKE ?))"); const query = `%${filters.q.trim().toLowerCase()}%`; params.push(query,query,query,query); }
  if (filters.sort === "popular") where.push("EXISTS (SELECT 1 FROM viewing_history vh WHERE vh.title_id=t.id AND vh.viewed_at>=datetime('now','-30 days'))");
  const sort = filters.sort === "alpha" ? "t.title COLLATE NOCASE ASC" : filters.sort === "oldest" ? "t.release_year ASC,t.title" : filters.sort === "popular" ? "(SELECT COUNT(*) FROM viewing_history vh WHERE vh.title_id=t.id AND vh.viewed_at>=datetime('now','-30 days')) DESC,t.title" : filters.sort === "featured" ? "t.featured_order ASC,t.updated_at DESC,t.title" : "t.created_at DESC,t.title";
  const page = Math.max(1,Number(filters.page || 1)); const limit = Math.min(48,Math.max(1,Number(filters.limit || 24)));
  const rows = await database.prepare(`SELECT t.id,t.catalog_type AS type,t.slug,t.title,t.alternative_title,t.sinhala_title,t.has_sinhala_subtitles,t.air_day,t.synopsis,t.release_year,t.country,t.status,t.poster_url,t.backdrop_url,t.featured,t.demo,
    CASE WHEN trim(t.video_url)<>'' OR EXISTS (SELECT 1 FROM episodes pe JOIN seasons ps ON ps.id=pe.season_id WHERE ps.title_id=t.id AND trim(pe.video_url)<>'') THEN 1 ELSE 0 END AS has_playable_source,
    (SELECT pe.id FROM episodes pe JOIN seasons ps ON ps.id=pe.season_id WHERE ps.title_id=t.id AND trim(pe.video_url)<>'' ORDER BY ps.season_number,pe.episode_number LIMIT 1) AS first_playable_episode_id
    FROM titles t WHERE ${where.join(" AND ")} ORDER BY ${sort} LIMIT ? OFFSET ?`).all(...params,limit,(page-1)*limit) as TitleSummary[];
  if(!rows.length)return [];
  const genreRows=await database.prepare(`SELECT tg.title_id,g.name FROM title_genres tg JOIN genres g ON g.id=tg.genre_id WHERE tg.title_id IN (${rows.map(()=>"?").join(",")}) ORDER BY g.name COLLATE NOCASE`).all(...rows.map(row=>row.id)) as {title_id:string;name:string}[];
  const genreMap=new Map<string,string[]>();
  for(const genre of genreRows){const names=genreMap.get(genre.title_id)||[];names.push(genre.name);genreMap.set(genre.title_id,names);}
  return rows.map(row=>({...row,genres:genreMap.get(row.id)||[]}));
}

export type HomepageSlide = TitleSummary & {slide_id:string};

export async function listHomepageSlides(): Promise<HomepageSlide[]> {
  const rows=await database.prepare(`SELECT hs.id AS slide_id,hs.sort_order AS slide_order,hs.backdrop_url AS slide_backdrop_url,
    t.id,t.catalog_type AS type,t.slug,t.title,t.alternative_title,t.sinhala_title,t.has_sinhala_subtitles,t.air_day,t.synopsis,t.release_year,t.country,t.status,t.poster_url,t.featured,t.demo,
    CASE WHEN trim(t.video_url)<>'' OR EXISTS (SELECT 1 FROM episodes pe JOIN seasons ps ON ps.id=pe.season_id WHERE ps.title_id=t.id AND trim(pe.video_url)<>'') THEN 1 ELSE 0 END AS has_playable_source,
    (SELECT pe.id FROM episodes pe JOIN seasons ps ON ps.id=pe.season_id WHERE ps.title_id=t.id AND trim(pe.video_url)<>'' ORDER BY ps.season_number,pe.episode_number LIMIT 1) AS first_playable_episode_id
    FROM homepage_slides hs JOIN titles t ON t.id=hs.title_id
    WHERE t.published=1 ORDER BY hs.sort_order,hs.created_at,hs.id LIMIT 50`).all() as Array<HomepageSlide & {slide_order:number;slide_backdrop_url:string}>;
  if(!rows.length)return [];
  const titleIds=[...new Set(rows.map(row=>row.id))];
  const genreRows=await database.prepare(`SELECT tg.title_id,g.name FROM title_genres tg JOIN genres g ON g.id=tg.genre_id WHERE tg.title_id IN (${titleIds.map(()=>"?").join(",")}) ORDER BY g.name COLLATE NOCASE`).all(...titleIds) as {title_id:string;name:string}[];
  const genreMap=new Map<string,string[]>();
  for(const genre of genreRows){const names=genreMap.get(genre.title_id)||[];names.push(genre.name);genreMap.set(genre.title_id,names);}
  return rows.map(row=>({...row,id:row.id,backdrop_url:row.slide_backdrop_url,featured:1,featured_order:row.slide_order,slide_id:row.slide_id,genres:genreMap.get(row.id)||[]}));
}

async function getGenres(titleId:string): Promise<string[]> {
  return (await database.prepare("SELECT g.name FROM genres g JOIN title_genres tg ON tg.genre_id=g.id WHERE tg.title_id=? ORDER BY g.name").all(titleId) as {name:string}[]).map(x=>x.name);
}

export async function getTitle(slug:string) {
  const rawRow = await database.prepare("SELECT * FROM titles WHERE slug=? AND published=1").get(slug) as (Title & {catalog_type?:Title["type"]})|undefined;
  if (!rawRow) return null;
  const row={...rawRow,type:rawRow.catalog_type||rawRow.type} as Title;
  const seasons = await database.prepare("SELECT id,season_number,name FROM seasons WHERE title_id=? ORDER BY season_number").all(row.id) as {id:string;season_number:number;name:string}[];
  const fullSeasons:any[] = await Promise.all(seasons.map(async (season) => {
    const episodes = await database.prepare("SELECT id,episode_number,title,synopsis,thumbnail_url,duration_minutes,video_url,air_date,publish_at,published,created_at FROM episodes WHERE season_id=? ORDER BY episode_number").all(season.id) as {id:string;episode_number:number;title:string;synopsis:string;thumbnail_url:string;duration_minutes:number|null;video_url:string;air_date:string|null;publish_at:string|null;published:number;created_at:string}[];
    return {...season,episodes:await Promise.all(episodes.map(async (episode) => ({...episode,subtitles:(await database.prepare("SELECT language,label,vtt_url AS file_url,kind,is_default,timing_offset FROM content_subtitle_tracks WHERE episode_id=? ORDER BY is_default DESC,language").all(episode.id)).map(track=>({...track}))})))};
  }));
  const [genres,galleryRows,castRows] = await Promise.all([
    getGenres(row.id),
    database.prepare("SELECT id,image_url,caption,attribution,sort_order FROM title_gallery WHERE title_id=? ORDER BY sort_order,id").all(row.id) as Promise<GalleryImage[]>,
    database.prepare("SELECT tc.id,tc.cast_member_id,cm.slug,cm.name,cm.portrait_url,tc.character_name,tc.role_type,tc.sort_order FROM title_cast tc JOIN cast_members cm ON cm.id=tc.cast_member_id WHERE tc.title_id=? ORDER BY tc.sort_order,cm.name COLLATE NOCASE").all(row.id) as Promise<CastCredit[]>,
  ]);
  return {...row,genres,seasons:fullSeasons,gallery:galleryRows.map(image=>({...image})),cast:castRows.map(member=>({...member} as CastCredit))};
}

export async function getCastMember(slug:string):Promise<CastMember|null> {
  const member=await database.prepare("SELECT cm.id,cm.slug,cm.name,cm.biography,cm.nationality,cm.profession,cm.portrait_url,cm.created_at,cm.updated_at FROM cast_members cm WHERE cm.slug=? AND EXISTS (SELECT 1 FROM title_cast tc JOIN titles t ON t.id=tc.title_id WHERE tc.cast_member_id=cm.id AND t.published=1)").get(slug) as CastMember|undefined;
  if(!member)return null;
  const [galleryRows,credits]=await Promise.all([
    database.prepare("SELECT id,image_url,caption,attribution,sort_order FROM cast_gallery WHERE cast_member_id=? ORDER BY sort_order,id").all(member.id) as Promise<GalleryImage[]>,
    database.prepare("SELECT tc.id,tc.cast_member_id,tc.character_name,tc.role_type,tc.sort_order,t.id AS title_id,t.slug AS title_slug,t.title,t.catalog_type AS title_type,t.release_year,t.poster_url FROM title_cast tc JOIN titles t ON t.id=tc.title_id WHERE tc.cast_member_id=? AND t.published=1 ORDER BY tc.sort_order,t.release_year DESC,t.title COLLATE NOCASE").all(member.id) as Promise<CastMember["credits"]>,
  ]);
  return {...member,gallery:galleryRows.map(image=>({...image})),credits:credits||[]};
}

export async function listCastMembers({query="",profession=""}:{query?:string;profession?:string}={}):Promise<CastDirectoryItem[]> {
  const term=query.trim().toLowerCase();
  const pattern="%"+term.replace(/[\\%_]/g,"\\$&")+"%";
  return await database.prepare(`SELECT cm.id,cm.slug,cm.name,cm.profession,cm.nationality,cm.portrait_url,
    (SELECT COUNT(DISTINCT tc.title_id) FROM title_cast tc JOIN titles t ON t.id=tc.title_id WHERE tc.cast_member_id=cm.id AND t.published=1) AS title_count,
    (SELECT t.title FROM title_cast tc JOIN titles t ON t.id=tc.title_id WHERE tc.cast_member_id=cm.id AND t.published=1 ORDER BY tc.sort_order,t.release_year DESC,t.title COLLATE NOCASE LIMIT 1) AS known_for
    FROM cast_members cm WHERE EXISTS (SELECT 1 FROM title_cast tc JOIN titles t ON t.id=tc.title_id WHERE tc.cast_member_id=cm.id AND t.published=1)
    AND (?='' OR lower(cm.name) LIKE ? ESCAPE '\\' OR lower(cm.profession) LIKE ? ESCAPE '\\')
    AND (?='' OR lower(cm.profession)=lower(?)) ORDER BY cm.name COLLATE NOCASE LIMIT 200`).all(term,pattern,pattern,profession,profession) as CastDirectoryItem[];
}

export async function listCastProfessions():Promise<string[]> {
  const rows=await database.prepare(`SELECT DISTINCT cm.profession FROM cast_members cm WHERE trim(cm.profession)<>''
    AND EXISTS (SELECT 1 FROM title_cast tc JOIN titles t ON t.id=tc.title_id WHERE tc.cast_member_id=cm.id AND t.published=1)
    ORDER BY cm.profession COLLATE NOCASE`).all() as Array<{profession:string}>;
  return rows.map(row=>row.profession);
}

export async function getUserByEmail(email:string) { return await database.prepare("SELECT * FROM users WHERE email=?").get(email.toLowerCase()) as Record<string,any>|undefined; }
export async function getUserById(id:string) { return await database.prepare("SELECT id,email,display_name,role,status,created_at FROM users WHERE id=?").get(id) as Record<string,any>|undefined; }
export async function createUser(data:{email:string;displayName:string;passwordHash:string;role?:string}) {
  const id=randomUUID();
  await database.prepare("INSERT INTO users(id,email,display_name,password_hash,role) VALUES(?,?,?,?,?)").run(id,data.email.toLowerCase(),data.displayName,data.passwordHash,data.role||"user");
  return (await getUserById(id))!;
}

export async function safeTitle(row:Title) { return {...row,genres:row.genres || await getGenres(row.id),subtitle_languages:JSON.parse(row.subtitle_languages || "[]")}; }
