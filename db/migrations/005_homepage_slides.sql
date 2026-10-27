CREATE TABLE IF NOT EXISTS homepage_slides (
  id TEXT PRIMARY KEY,
  title_id TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  backdrop_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS homepage_slides_order_idx ON homepage_slides(sort_order,created_at);

INSERT INTO homepage_slides(id,title_id,backdrop_url,sort_order)
SELECT 'legacy-' || id,id,backdrop_url,featured_order
FROM titles
WHERE published=1 AND featured=1 AND trim(backdrop_url)<>'';
