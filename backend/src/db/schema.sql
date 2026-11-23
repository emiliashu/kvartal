BEGIN;

CREATE TABLE IF NOT EXISTS users (
  user_id BIGSERIAL PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user'
    CHECK (role IN ('user', 'moderator')),
  phone VARCHAR(20),
  avatar_path TEXT,
  birth_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS auth_sessions (
  session_id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash BYTEA NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS listings (
  listing_id BIGSERIAL PRIMARY KEY,
  owner_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  title VARCHAR(150) NOT NULL,
  description TEXT NOT NULL,
  kind VARCHAR(16) NOT NULL CHECK (kind IN ('new', 'secondary')),
  price NUMERIC(12, 2) NOT NULL CHECK (price > 0),
  area NUMERIC(8, 2) NOT NULL CHECK (area > 0),
  rooms SMALLINT NOT NULL CHECK (rooms BETWEEN 0 AND 10),
  floor SMALLINT NOT NULL CHECK (floor >= 0),
  total_floors SMALLINT NOT NULL CHECK (total_floors >= floor),
  district VARCHAR(100) NOT NULL,
  address TEXT NOT NULL,
  latitude NUMERIC(9, 6) CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMERIC(9, 6) CHECK (longitude BETWEEN -180 AND 180),
  parking BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(24) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'published', 'needs_fix', 'rejected', 'closed')),
  moderation_note TEXT,
  views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS listings_status_idx ON listings (status);
CREATE INDEX IF NOT EXISTS listings_owner_idx ON listings (owner_id);
CREATE INDEX IF NOT EXISTS listings_search_idx ON listings (district, rooms, price, area);

CREATE TABLE IF NOT EXISTS listing_photos (
  photo_id BIGSERIAL PRIMARY KEY,
  listing_id BIGINT NOT NULL REFERENCES listings(listing_id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS listing_photos_listing_idx ON listing_photos (listing_id, sort_order);

CREATE TABLE IF NOT EXISTS listing_orientations (
  listing_id BIGINT NOT NULL REFERENCES listings(listing_id) ON DELETE CASCADE,
  direction_code CHAR(1) NOT NULL CHECK (direction_code IN ('N', 'E', 'S', 'W')),
  PRIMARY KEY (listing_id, direction_code)
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  listing_id BIGINT NOT NULL REFERENCES listings(listing_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, listing_id)
);

CREATE TABLE IF NOT EXISTS user_preferences (
  preference_id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
  max_price NUMERIC(12, 2),
  min_area NUMERIC(8, 2),
  rooms SMALLINT[],
  directions CHAR(1)[],
  districts TEXT[],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
  conversation_id BIGSERIAL PRIMARY KEY,
  listing_id BIGINT NOT NULL REFERENCES listings(listing_id) ON DELETE CASCADE,
  buyer_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (listing_id, buyer_id)
);

CREATE TABLE IF NOT EXISTS messages (
  message_id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  sender_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (LENGTH(TRIM(body)) > 0),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages (conversation_id, sent_at);

CREATE TABLE IF NOT EXISTS moderation_records (
  record_id BIGSERIAL PRIMARY KEY,
  listing_id BIGINT NOT NULL REFERENCES listings(listing_id) ON DELETE CASCADE,
  moderator_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  decision VARCHAR(20) NOT NULL CHECK (decision IN ('approved', 'returned', 'rejected')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE INDEX IF NOT EXISTS seller_reviews_seller_idx ON seller_reviews (seller_id, created_at DESC);

CREATE TABLE IF NOT EXISTS listing_events (
  event_id BIGSERIAL PRIMARY KEY,
  listing_id BIGINT NOT NULL REFERENCES listings(listing_id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  event_type VARCHAR(24) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS listings_set_updated_at ON listings;
CREATE TRIGGER listings_set_updated_at
BEFORE UPDATE ON listings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS preferences_set_updated_at ON user_preferences;
CREATE TRIGGER preferences_set_updated_at
BEFORE UPDATE ON user_preferences
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS conversations_set_updated_at ON conversations;
CREATE TRIGGER conversations_set_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS seller_reviews_set_updated_at ON seller_reviews;
CREATE TRIGGER seller_reviews_set_updated_at
BEFORE UPDATE ON seller_reviews
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
