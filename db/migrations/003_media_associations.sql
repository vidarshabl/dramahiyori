ALTER TABLE media_assets ADD COLUMN role TEXT NOT NULL DEFAULT 'other'
  CHECK (role IN ('poster','backdrop','gallery','portrait','episode_thumbnail','trailer_thumbnail','promotional','other'));
ALTER TABLE media_assets ADD COLUMN upload_id TEXT;
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
