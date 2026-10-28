-- Keep the original constrained `type` column as the legacy value. `catalog_type`
-- is the canonical public type so existing SQLite/Turso rows and foreign keys do
-- not need a destructive table rebuild just to add variety shows.
ALTER TABLE titles ADD COLUMN catalog_type TEXT NOT NULL DEFAULT 'series'
  CHECK (catalog_type IN ('series','movie','variety'));
UPDATE titles SET catalog_type=type;
ALTER TABLE titles ADD COLUMN air_day TEXT NOT NULL DEFAULT '';
ALTER TABLE titles ADD COLUMN sinhala_title TEXT NOT NULL DEFAULT '';
ALTER TABLE titles ADD COLUMN has_sinhala_subtitles INTEGER NOT NULL DEFAULT 0
  CHECK (has_sinhala_subtitles IN (0,1));

ALTER TABLE episodes ADD COLUMN air_date TEXT;
ALTER TABLE episodes ADD COLUMN publish_at TEXT;
ALTER TABLE episodes ADD COLUMN published INTEGER NOT NULL DEFAULT 1
  CHECK (published IN (0,1));
ALTER TABLE episodes ADD COLUMN created_at TEXT;
UPDATE episodes SET created_at=COALESCE(
  (SELECT titles.created_at FROM seasons JOIN titles ON titles.id=seasons.title_id WHERE seasons.id=episodes.season_id),
  '1970-01-01 00:00:00'
);
CREATE INDEX IF NOT EXISTS episodes_publish_idx ON episodes(published,publish_at,season_id,episode_number);

CREATE TABLE IF NOT EXISTS content_subtitle_tracks (
  id TEXT PRIMARY KEY,
  title_id TEXT REFERENCES titles(id) ON DELETE CASCADE,
  episode_id TEXT REFERENCES episodes(id) ON DELETE CASCADE,
  language TEXT NOT NULL CHECK (language IN ('si','en','ko') OR length(language) BETWEEN 2 AND 20),
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
INSERT INTO content_subtitle_tracks(id,episode_id,language,label,vtt_url,kind,is_default)
SELECT old.id,old.episode_id,old.language,old.label,old.file_url,
  CASE WHEN old.kind='captions' THEN 'captions' ELSE 'subtitles' END,
  CASE WHEN old.id=(SELECT first_track.id FROM subtitle_tracks first_track
    WHERE first_track.episode_id=old.episode_id ORDER BY first_track.rowid LIMIT 1) THEN 1 ELSE 0 END
FROM subtitle_tracks old;

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
INSERT INTO video_sources(id,title_id,kind,quality,url,priority,status)
SELECT 'legacy-title-'||id,id,'mp4','auto',video_url,0,'active' FROM titles WHERE trim(video_url)<>'';
INSERT INTO video_sources(id,episode_id,kind,quality,url,priority,status)
SELECT 'legacy-episode-'||e.id,e.id,'mp4','auto',e.video_url,0,'active'
FROM episodes e WHERE trim(e.video_url)<>'';

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

INSERT OR IGNORE INTO site_settings(key,value) VALUES('downloads_login_1080p','false');
