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

function migrationSql(): string {
  const file = path.join(process.cwd(), "db", "migrations", "001_initial.sql");
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
  const migration = "001_initial";
  const applied = await provider.get("SELECT id FROM schema_migrations WHERE id=?", [migration]);
  if (!applied) {
    await provider.exec(migrationSql());
    await provider.run("INSERT OR IGNORE INTO schema_migrations(id) VALUES(?)", [migration]);
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
    const migration = "001_initial";
    if (!db.prepare("SELECT id FROM schema_migrations WHERE id=?").get(migration)) {
      db.exec(migrationSql());
      db.prepare("INSERT INTO schema_migrations(id) VALUES(?)").run(migration);
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
  id:string; type:"movie"|"series"; slug:string; title:string; alternative_title:string; synopsis:string; release_year:number|null;
  country:string; status:"ongoing"|"completed"|"upcoming"; runtime_minutes:number|null; poster_url:string; backdrop_url:string;
  content_rating:string; subtitle_languages:string; video_url:string; published:number; featured:number; demo:number;
  genres?:string[]; episode_count?:number; season_count?:number;
};

export async function listTitles(filters: Record<string,string|undefined> = {}): Promise<Title[]> {
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
  const rows = await database.prepare(`SELECT t.*, (SELECT COUNT(*) FROM episodes e JOIN seasons s ON s.id=e.season_id WHERE s.title_id=t.id) AS episode_count,
    (SELECT COUNT(*) FROM seasons s WHERE s.title_id=t.id) AS season_count FROM titles t WHERE ${where.join(" AND ")} ORDER BY ${sort} LIMIT ? OFFSET ?`).all(...params,limit,(page-1)*limit) as Title[];
  return Promise.all(rows.map(async (row) => ({...row,genres: await getGenres(row.id)})));
}

async function getGenres(titleId:string): Promise<string[]> {
  return (await database.prepare("SELECT g.name FROM genres g JOIN title_genres tg ON tg.genre_id=g.id WHERE tg.title_id=? ORDER BY g.name").all(titleId) as {name:string}[]).map(x=>x.name);
}

export async function getTitle(slug:string) {
  const row = await database.prepare("SELECT * FROM titles WHERE slug=? AND published=1").get(slug) as Title|undefined;
  if (!row) return null;
  const seasons = await database.prepare("SELECT id,season_number,name FROM seasons WHERE title_id=? ORDER BY season_number").all(row.id) as {id:string;season_number:number;name:string}[];
  const fullSeasons = await Promise.all(seasons.map(async (season) => {
    const episodes = await database.prepare("SELECT id,episode_number,title,synopsis,thumbnail_url,duration_minutes,video_url FROM episodes WHERE season_id=? ORDER BY episode_number").all(season.id) as {id:string;[key:string]:any}[];
    return {...season,episodes:await Promise.all(episodes.map(async (episode) => ({...episode,subtitles:await database.prepare("SELECT language,label,file_url,kind FROM subtitle_tracks WHERE episode_id=?").all(episode.id)})))};
  }));
  return {...row,genres:await getGenres(row.id),seasons:fullSeasons};
}

export async function getUserByEmail(email:string) { return await database.prepare("SELECT * FROM users WHERE email=?").get(email.toLowerCase()) as Record<string,any>|undefined; }
export async function getUserById(id:string) { return await database.prepare("SELECT id,email,display_name,role,status,created_at FROM users WHERE id=?").get(id) as Record<string,any>|undefined; }
export async function createUser(data:{email:string;displayName:string;passwordHash:string;role?:string}) {
  const id=randomUUID();
  await database.prepare("INSERT INTO users(id,email,display_name,password_hash,role) VALUES(?,?,?,?,?)").run(id,data.email.toLowerCase(),data.displayName,data.passwordHash,data.role||"user");
  return (await getUserById(id))!;
}

export async function safeTitle(row:Title) { return {...row,genres:row.genres || await getGenres(row.id),subtitle_languages:JSON.parse(row.subtitle_languages || "[]")}; }
