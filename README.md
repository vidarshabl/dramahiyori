# DearDrama

DearDrama is a responsive K-drama discovery and streaming-platform foundation built with Next.js App Router, React, TypeScript, SQLite, and the built-in Node.js server APIs. It uses original sample story records so the catalog is useful on first launch without claiming real ratings, cast details, or streaming rights.

## Requirements

- Node.js 22.6 or newer (Node 24 is recommended; the seed and admin tools use Node's built-in TypeScript stripping).
- npm.
- A persistent local directory for the SQLite database.

## Run locally

~~~sh
npm install
npm run dev
~~~

Open http://localhost:3000. On first start, the app creates data/deardrama.sqlite, applies the SQL migration in db/migrations/001_initial.sql, and inserts the sample catalog into an empty titles table. The database path defaults to ./data; set DATA_DIR to move it. Copy .env.example to .env.local if you want to configure the public site URL or an allowed media-host list.

The migration runner records applied migration IDs in schema_migrations. The current initial migration is repeatable on a fresh database. Back up the database before changing schema or deploying updates.

## Create the first administrator

Public registration always assigns the user role. Create the initial administrator from a local terminal after choosing a unique password. The setup command refuses to promote an existing account and refuses to run once an administrator exists.

PowerShell:

~~~powershell
$env:DATA_DIR = "./data"
$env:ADMIN_EMAIL = "you@example.com"
$env:ADMIN_PASSWORD = "use-a-unique-password-of-at-least-14-characters"
$env:ADMIN_NAME = "Platform Administrator"
npm run admin:create
Remove-Item Env:ADMIN_PASSWORD
~~~

macOS/Linux:

~~~sh
DATA_DIR=./data ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='use-a-unique-password-of-at-least-14-characters' ADMIN_NAME='Platform Administrator' npm run admin:create
~~~

The command stores only a salted scrypt password hash. Keep the password in a password manager; it is not written into the project. Sign in at /admin/login. Do not run the setup command with a production password in shell history or CI logs.

## What is implemented

- Cinematic, responsive home page with featured stories, recent catalog additions, genre rails, mood navigation, and a viewing-activity popularity rail when viewing data exists.
- Search by title or alternative title; genre, country, year, movie/series, completion, and sort filters; debounced requests, shareable query parameters, suggestions, and incremental loading.
- Database-backed title details, seasons and episode navigation, sample labels, related titles, subtitles, and an unavailable-stream state.
- Public registration, login, logout, profile changes, password changes, account deletion, 30-day HttpOnly same-site sessions, scrypt password hashing, same-origin checks on mutations, and database-backed login throttling.
- Watchlist and playback-progress persistence for signed-in users.
- An independent administrator login and server-protected dashboard with database-backed metrics, content create/edit/publish/draft/delete, genre tagging, episode ordering and seasons, subtitle URLs, basic account search/disable, site settings, and audit entries.
- HTML5 playback controls and HLS playback through hls.js where Media Source Extensions are available, plus native HLS fallback. An unconfigured source never pretends to play.
- Responsive layouts, keyboard focus styles, reduced-motion support, basic metadata, sitemap, robots rules, and security headers.

## External services and production limits

- **Video:** no sample title has a stream. Add a direct MP4 or HLS URL in the admin dashboard; video sources may use any valid HTTPS host in production, including Internet Archive. Add only sources you own or are authorized to distribute. The browser still needs a directly playable file/playlist, supported codec, and a source that permits playback. `MEDIA_ALLOWED_HOSTS` remains for image and subtitle URLs; Internet Archive HTTPS hosts are explicitly accepted. HLS playback uses native support when available and hls.js on supported Media Source Extensions browsers; see the [hls.js documentation](https://github.com/video-dev/hls.js/).
- **Images and uploads:** the sample catalog uses remote illustrative images. The dashboard accepts authorized image URLs, but does not implement binary uploads, signed uploads, object-storage credentials, or cleanup. Connect a storage provider and replace the sample URLs before production.
- **Email:** password reset, verification, and email change are not implemented. The recovery page explains that recovery is unavailable; it does not send email.
- **Reports and legal text:** report intake needs an operator contact/review workflow. The privacy policy and terms are starter placeholders and must be reviewed and replaced before accepting real users.
- **Database:** local development uses a SQLite file under `DATA_DIR` (default `./data`). Vercel/serverless deployments use the remote Turso database through `@libsql/client`; set server-only `DATABASE_URL` to the exact `libsql://...` URL and `DATABASE_TOKEN` to its auth token. The compatible aliases `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are also supported, but conflicting pairs are rejected. Local SQLite is never used outside development.
- **Deployment:** on Vercel, configure `DATABASE_URL`, `DATABASE_TOKEN`, and `NEXT_PUBLIC_SITE_URL` in Project Settings → Environment Variables, then redeploy. Keep the database token server-only; never prefix it with `NEXT_PUBLIC_`. `admin:create` loads Next.js environment files and reports only the selected provider and variable names so the administrator is created in the same configured database. Set NEXT_PUBLIC_SITE_URL to the public HTTPS origin. Configure backups, monitoring, rate limits at the edge, and your media provider separately.
- **Admin sign-in diagnostics:** temporarily set the server-only `ADMIN_AUTH_DEBUG=true` variable to log the selected database provider, whether the account was found, its role/status, stored hash algorithm, and password-match result. These logs never include the submitted password, stored hash, email, database URL, or token. Remove the variable after diagnosis.

The styling and core application do not depend on optional Codex tools, plugins, or services.

## Tests and checks

TypeScript check:

~~~sh
npm run typecheck
~~~

Production build:

~~~sh
npm run build
~~~

The end-to-end suite expects a running app and a disposable database with an administrator account. Create a temporary test database with DATA_DIR=./data-test and the administrator setup command above, then start the app with the same DATA_DIR. Set TEST_BASE_URL, TEST_ADMIN_EMAIL, and TEST_ADMIN_PASSWORD, then run:

~~~sh
npm run test:e2e
~~~

The suite exercises role separation, unauthorized admin requests, media create/edit/delete, search and genre filtering, watchlist persistence, progress validation and storage, and audit logging. Use a disposable test database; remove it after testing.

## Project structure

~~~text
app/                 App Router pages and API route handlers
components/          Public, player, account, discovery, and admin UI
db/migrations/       SQL schema migrations
db/schema.sql        Readable schema reference
lib/                 SQLite, seed data, authentication, and security helpers
scripts/             Development seed and first-admin commands
tests/               HTTP integration suite
data/                Local SQLite database (ignored by git)
.env.example         Safe configuration template
~~~
