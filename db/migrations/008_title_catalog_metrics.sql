ALTER TABLE titles ADD COLUMN imdb_rating REAL
  CHECK (imdb_rating IS NULL OR (imdb_rating >= 0 AND imdb_rating <= 10));
ALTER TABLE titles ADD COLUMN imdb_rating_is_estimate INTEGER NOT NULL DEFAULT 0
  CHECK (imdb_rating_is_estimate IN (0,1));
ALTER TABLE titles ADD COLUMN total_episodes INTEGER
  CHECK (total_episodes IS NULL OR (total_episodes BETWEEN 1 AND 500));
ALTER TABLE titles ADD COLUMN total_runtime_minutes INTEGER
  CHECK (total_runtime_minutes IS NULL OR (total_runtime_minutes BETWEEN 1 AND 500000));
