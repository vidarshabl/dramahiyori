PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE TABLE IF NOT EXISTS auth_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_key TEXT NOT NULL,
  attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS auth_attempts_window_idx ON auth_attempts(email_key,attempted_at);

CREATE TABLE IF NOT EXISTS titles (
  id TEXT PRIMARY KEY,
  -- `type` is retained for backwards compatibility. `catalog_type` is the public enum.
  type TEXT NOT NULL CHECK (type IN ('movie','series')),
  catalog_type TEXT NOT NULL DEFAULT 'series' CHECK (catalog_type IN ('series','movie','variety')),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  alternative_title TEXT NOT NULL DEFAULT '',
  sinhala_title TEXT NOT NULL DEFAULT '',
  synopsis TEXT NOT NULL DEFAULT '',
  release_year INTEGER,
  country TEXT NOT NULL DEFAULT '',
  air_day TEXT NOT NULL DEFAULT '',
  has_sinhala_subtitles INTEGER NOT NULL DEFAULT 0 CHECK (has_sinhala_subtitles IN (0,1)),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('ongoing','completed','upcoming')),
  runtime_minutes INTEGER,
  imdb_rating REAL CHECK (imdb_rating IS NULL OR (imdb_rating >= 0 AND imdb_rating <= 10)),
  imdb_rating_is_estimate INTEGER NOT NULL DEFAULT 0 CHECK (imdb_rating_is_estimate IN (0,1)),
  total_episodes INTEGER CHECK (total_episodes IS NULL OR (total_episodes BETWEEN 1 AND 500)),
  total_runtime_minutes INTEGER CHECK (total_runtime_minutes IS NULL OR (total_runtime_minutes BETWEEN 1 AND 500000)),
  poster_url TEXT NOT NULL DEFAULT '',
  backdrop_url TEXT NOT NULL DEFAULT '',
  content_rating TEXT NOT NULL DEFAULT '',
  subtitle_languages TEXT NOT NULL DEFAULT '[]',
  video_url TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0,1)),
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0,1)),
  featured_order INTEGER NOT NULL DEFAULT 0 CHECK (featured_order >= 0),
  demo INTEGER NOT NULL DEFAULT 0 CHECK (demo IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS titles_public_idx ON titles(published,type,release_year);
CREATE INDEX IF NOT EXISTS titles_year_idx ON titles(release_year);
CREATE INDEX IF NOT EXISTS titles_featured_order_idx ON titles(featured,featured_order,updated_at DESC);
CREATE TABLE IF NOT EXISTS genres (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS title_genres (
  title_id TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  genre_id TEXT NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY(title_id,genre_id)
);
CREATE INDEX IF NOT EXISTS title_genres_genre_idx ON title_genres(genre_id,title_id);
CREATE TABLE IF NOT EXISTS seasons (
  id TEXT PRIMARY KEY,
  title_id TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  season_number INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  UNIQUE(title_id,season_number)
);
CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  synopsis TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT NOT NULL DEFAULT '',
  duration_minutes INTEGER,
  video_url TEXT NOT NULL DEFAULT '',
  air_date TEXT,
  publish_at TEXT,
  published INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(season_id,episode_number)
);
CREATE INDEX IF NOT EXISTS episodes_publish_idx ON episodes(published,publish_at,season_id,episode_number);
CREATE TABLE IF NOT EXISTS subtitle_tracks (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  label TEXT NOT NULL,
  file_url TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'subtitles'
);
CREATE TABLE IF NOT EXISTS watchlist_items (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,title_id)
);
CREATE TABLE IF NOT EXISTS favorite_items (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,title_id)
);
CREATE TABLE IF NOT EXISTS watch_progress (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL,
  position_seconds REAL NOT NULL DEFAULT 0,
  duration_seconds REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,title_id)
);
CREATE TABLE IF NOT EXISTS viewing_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL,
  viewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS history_user_idx ON viewing_history(user_id,viewed_at DESC);
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS cast_members (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  biography TEXT NOT NULL DEFAULT '',
  nationality TEXT NOT NULL DEFAULT '',
  profession TEXT NOT NULL DEFAULT 'Actor',
  portrait_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS cast_members_name_idx ON cast_members(name COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS title_cast (
  id TEXT PRIMARY KEY,
  title_id TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  cast_member_id TEXT NOT NULL REFERENCES cast_members(id) ON DELETE CASCADE,
  character_name TEXT NOT NULL DEFAULT '',
  role_type TEXT NOT NULL DEFAULT 'cast' CHECK (role_type IN ('cast','director','writer','producer')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(title_id,cast_member_id,role_type,character_name)
);
CREATE INDEX IF NOT EXISTS title_cast_person_idx ON title_cast(cast_member_id,sort_order);
CREATE INDEX IF NOT EXISTS title_cast_title_idx ON title_cast(title_id,sort_order);
CREATE TABLE IF NOT EXISTS title_gallery (
  id TEXT PRIMARY KEY,
  title_id TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  attribution TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(title_id,image_url)
);
CREATE INDEX IF NOT EXISTS title_gallery_order_idx ON title_gallery(title_id,sort_order);
CREATE TABLE IF NOT EXISTS cast_gallery (
  id TEXT PRIMARY KEY,
  cast_member_id TEXT NOT NULL REFERENCES cast_members(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  attribution TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(cast_member_id,image_url)
);
CREATE INDEX IF NOT EXISTS cast_gallery_order_idx ON cast_gallery(cast_member_id,sort_order);
CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  pathname TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  role TEXT NOT NULL DEFAULT 'other' CHECK (role IN ('poster','backdrop','gallery','portrait','episode_thumbnail','trailer_thumbnail','promotional','other')),
  upload_id TEXT,
  uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS media_assets_created_idx ON media_assets(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS media_assets_upload_id_idx ON media_assets(upload_id) WHERE upload_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS media_asset_usages (
  id TEXT PRIMARY KEY,
  media_asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  title_id TEXT REFERENCES titles(id) ON DELETE CASCADE,
  cast_member_id TEXT REFERENCES cast_members(id) ON DELETE CASCADE,
  episode_id TEXT REFERENCES episodes(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('poster','backdrop','gallery','portrait','episode_thumbnail','trailer_thumbnail','promotional','other')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  caption TEXT NOT NULL DEFAULT '',
  attribution TEXT NOT NULL DEFAULT '',
  CHECK ((title_id IS NOT NULL) + (cast_member_id IS NOT NULL) + (episode_id IS NOT NULL) = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS media_usage_title_idx ON media_asset_usages(media_asset_id,title_id,role) WHERE title_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS media_usage_cast_idx ON media_asset_usages(media_asset_id,cast_member_id,role) WHERE cast_member_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS media_usage_episode_idx ON media_asset_usages(media_asset_id,episode_id,role) WHERE episode_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS media_usage_asset_idx ON media_asset_usages(media_asset_id);
CREATE INDEX IF NOT EXISTS media_usage_title_order_idx ON media_asset_usages(title_id,role,sort_order);
CREATE INDEX IF NOT EXISTS media_usage_cast_order_idx ON media_asset_usages(cast_member_id,role,sort_order);

-- Canonical extensible subtitle table; legacy episode-only tracks remain available for migration.
CREATE TABLE IF NOT EXISTS content_subtitle_tracks (
  id TEXT PRIMARY KEY,
  title_id TEXT REFERENCES titles(id) ON DELETE CASCADE,
  episode_id TEXT REFERENCES episodes(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  label TEXT NOT NULL,
  vtt_url TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'subtitles' CHECK (kind IN ('subtitles','captions')),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  timing_offset REAL NOT NULL DEFAULT 0 CHECK (timing_offset BETWEEN -60 AND 60),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((title_id IS NOT NULL) + (episode_id IS NOT NULL) = 1)
);
CREATE INDEX IF NOT EXISTS content_subtitles_title_idx ON content_subtitle_tracks(title_id,language,is_default);
CREATE INDEX IF NOT EXISTS content_subtitles_episode_idx ON content_subtitle_tracks(episode_id,language,is_default);
CREATE TABLE IF NOT EXISTS video_sources (
  id TEXT PRIMARY KEY,
  title_id TEXT REFERENCES titles(id) ON DELETE CASCADE,
  episode_id TEXT REFERENCES episodes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('hls','mp4','embed')),
  quality TEXT NOT NULL DEFAULT 'auto' CHECK (quality IN ('auto','480p','720p','1080p')),
  url TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((title_id IS NOT NULL) + (episode_id IS NOT NULL) = 1)
);
CREATE INDEX IF NOT EXISTS video_sources_title_idx ON video_sources(title_id,status,priority);
CREATE INDEX IF NOT EXISTS video_sources_episode_idx ON video_sources(episode_id,status,priority);
CREATE TABLE IF NOT EXISTS download_links (
  id TEXT PRIMARY KEY,
  title_id TEXT REFERENCES titles(id) ON DELETE CASCADE,
  episode_id TEXT REFERENCES episodes(id) ON DELETE CASCADE,
  quality TEXT NOT NULL CHECK (quality IN ('480p','720p','1080p','subtitle')),
  size_mb REAL CHECK (size_mb IS NULL OR size_mb BETWEEN 0 AND 1000000),
  host_label TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  clicks INTEGER NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((title_id IS NOT NULL) + (episode_id IS NOT NULL) = 1)
);
CREATE INDEX IF NOT EXISTS download_links_title_idx ON download_links(title_id,status,quality);
CREATE INDEX IF NOT EXISTS download_links_episode_idx ON download_links(episode_id,status,quality);
CREATE TABLE IF NOT EXISTS download_clicks (
  id TEXT PRIMARY KEY,
  download_link_id TEXT NOT NULL REFERENCES download_links(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS download_clicks_time_idx ON download_clicks(created_at DESC);
CREATE TABLE IF NOT EXISTS view_events (
  id TEXT PRIMARY KEY,
  title_id TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  visitor_key TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS view_events_popular_idx ON view_events(created_at,title_id);
CREATE INDEX IF NOT EXISTS view_events_episode_idx ON view_events(episode_id,created_at);
CREATE TABLE IF NOT EXISTS watched_episodes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  watched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,episode_id)
);
CREATE TABLE IF NOT EXISTS user_playback_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  volume REAL NOT NULL DEFAULT 1 CHECK (volume BETWEEN 0 AND 1),
  quality TEXT NOT NULL DEFAULT 'auto' CHECK (quality IN ('auto','480p','720p','1080p')),
  subtitle_language TEXT NOT NULL DEFAULT 'si',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS title_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  requested_title TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','added','declined')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS title_requests_status_idx ON title_requests(status,created_at DESC);
CREATE TABLE IF NOT EXISTS link_reports (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('title','episode','video_source','download')),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS link_reports_status_idx ON link_reports(status,created_at DESC);

CREATE TABLE IF NOT EXISTS api_rate_limits (
  key_hash TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0)
);
CREATE INDEX IF NOT EXISTS api_rate_limits_window_idx ON api_rate_limits(window_started_at);
