BEGIN;

ALTER TABLE listings
  DROP CONSTRAINT IF EXISTS listings_status_check;

ALTER TABLE listings
  ADD CONSTRAINT listings_status_check
  CHECK (status IN ('pending', 'published', 'needs_fix', 'rejected', 'closed'));

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS seller_reviews (
  review_id BIGSERIAL PRIMARY KEY,
  listing_id BIGINT NOT NULL REFERENCES listings(listing_id) ON DELETE CASCADE,
  seller_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  buyer_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  score SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment TEXT CHECK (comment IS NULL OR LENGTH(comment) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (listing_id, buyer_id),
  CHECK (seller_id <> buyer_id)
);

CREATE INDEX IF NOT EXISTS seller_reviews_seller_idx
  ON seller_reviews (seller_id, created_at DESC);

DROP TRIGGER IF EXISTS seller_reviews_set_updated_at ON seller_reviews;
CREATE TRIGGER seller_reviews_set_updated_at
BEFORE UPDATE ON seller_reviews
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
