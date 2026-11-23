const db = require("../config/db");
const HttpError = require("../utils/http-error");
const { mapListing } = require("./listings.service");

const nextStatus = {
  approved: "published",
  returned: "needs_fix",
  rejected: "rejected"
};

async function list(status) {
  const result = await db.query(
    `SELECT l.*,
            u.display_name AS owner_name,
            u.email AS owner_email,
            u.avatar_path AS owner_avatar,
            (SELECT COALESCE(json_agg(p.file_path ORDER BY p.sort_order, p.photo_id), '[]'::json)
               FROM listing_photos p WHERE p.listing_id = l.listing_id) AS photos,
            (SELECT COALESCE(array_agg(o.direction_code::text), ARRAY[]::TEXT[])
               FROM listing_orientations o WHERE o.listing_id = l.listing_id) AS orientations,
            FALSE AS is_favorite,
            (SELECT COUNT(*) FROM favorites all_f WHERE all_f.listing_id = l.listing_id) AS favorite_count
       FROM listings l
       JOIN users u ON u.user_id = l.owner_id
      WHERE l.status = $1
      ORDER BY l.created_at ASC`,
    [status]
  );
  return result.rows.map(mapListing);
}

async function decide(listingId, moderatorId, decision, reason) {
  const status = nextStatus[decision];
  if (!status) throw new HttpError(400, "Неизвестное решение модератора");

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE listings
          SET status = $1::varchar,
              moderation_note = $2,
              reviewed_at = NOW(),
              published_at = CASE WHEN $1::text = 'published' THEN NOW() ELSE NULL END
        WHERE listing_id = $3 AND status IN ('pending', 'needs_fix')
        RETURNING listing_id`,
      [status, reason || null, listingId]
    );
    if (!result.rows[0]) throw new HttpError(404, "Объявление не найдено");

    await client.query(
      `INSERT INTO moderation_records (listing_id, moderator_id, decision, reason)
       VALUES ($1, $2, $3, $4)`,
      [listingId, moderatorId, decision, reason || null]
    );
    await client.query(
      "INSERT INTO listing_events (listing_id, user_id, event_type) VALUES ($1, $2, $3)",
      [listingId, moderatorId, `moderation_${decision}`]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { list, decide };
