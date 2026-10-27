ALTER TABLE titles ADD COLUMN featured_order INTEGER NOT NULL DEFAULT 0 CHECK (featured_order >= 0);
CREATE INDEX IF NOT EXISTS titles_featured_order_idx ON titles(featured,featured_order,updated_at DESC);
