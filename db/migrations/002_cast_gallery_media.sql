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
  uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS media_assets_created_idx ON media_assets(created_at DESC);
