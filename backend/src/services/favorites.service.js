const db = require("../config/db");
const HttpError = require("../utils/http-error");
const { mapListing } = require("./listings.service");

async function list(userId) {
  const result = await db.query(
    `SELECT l.*,
            u.display_name AS owner_name,
            u.email AS owner_email,
            u.avatar_path AS owner_avatar,
            (SELECT COALESCE(json_agg(p.file_path ORDER BY p.sort_order, p.photo_id), '[]'::json)
               FROM listing_photos p WHERE p.listing_id = l.listing_id) AS photos,
            (SELECT COALESCE(array_agg(o.direction_code::text), ARRAY[]::TEXT[])
               FROM listing_orientations o WHERE o.listing_id = l.listing_id) AS orientations,
            TRUE AS is_favorite,
            (SELECT COUNT(*) FROM favorites all_f WHERE all_f.listing_id = l.listing_id) AS favorite_count
       FROM favorites f
       JOIN listings l ON l.listing_id = f.listing_id
       JOIN users u ON u.user_id = l.owner_id
      WHERE f.user_id = $1 AND l.status = 'published'
      ORDER BY f.created_at DESC`,
    [userId]
  );
  return result.rows.map(mapListing);
}

async function add(userId, listingId) {
  const listing = await db.query(
    "SELECT listing_id FROM listings WHERE listing_id = $1 AND status = 'published'",
    [listingId]
  );
  if (!listing.rows[0]) throw new HttpError(404, "Объявление не найдено");

  await db.query(
    `INSERT INTO favorites (user_id, listing_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, listing_id) DO NOTHING`,
    [userId, listingId]
  );
}

async function remove(userId, listingId) {
  await db.query(
    "DELETE FROM favorites WHERE user_id = $1 AND listing_id = $2",
    [userId, listingId]
  );
}

module.exports = { list, add, remove };
