-- Backfill timestamps for episodes created by older seed/import paths.
UPDATE episodes
SET created_at = COALESCE(
  (SELECT t.created_at
   FROM seasons s
   JOIN titles t ON t.id = s.title_id
   WHERE s.id = episodes.season_id),
  CURRENT_TIMESTAMP
)
WHERE created_at IS NULL OR trim(created_at) = '';
