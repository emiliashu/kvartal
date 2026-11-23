const { pool } = require("../config/db");
const HttpError = require("../utils/http-error");
const { geocodeAddress } = require("./geocoding.service");

const directionToCode = {
  N: "N",
  E: "E",
  S: "S",
  W: "W",
  Север: "N",
  Восток: "E",
  Юг: "S",
  Запад: "W"
};

const codeToDirection = { N: "Север", E: "Восток", S: "Юг", W: "Запад" };

const listingSelect = `
  SELECT l.*,
         u.display_name AS owner_name,
         u.email AS owner_email,
         u.avatar_path AS owner_avatar,
         (SELECT COALESCE(json_agg(p.file_path ORDER BY p.sort_order, p.photo_id), '[]'::json)
            FROM listing_photos p WHERE p.listing_id = l.listing_id) AS photos,
         (SELECT COALESCE(array_agg(o.direction_code::text), ARRAY[]::TEXT[])
            FROM listing_orientations o WHERE o.listing_id = l.listing_id) AS orientations,
         EXISTS (
           SELECT 1 FROM favorites f
            WHERE f.listing_id = l.listing_id AND f.user_id = $1
         ) AS is_favorite,
         (SELECT COUNT(*) FROM favorites f WHERE f.listing_id = l.listing_id) AS favorite_count,
         (SELECT AVG(r.score) FROM seller_reviews r WHERE r.seller_id = l.owner_id) AS seller_review_avg,
         (SELECT COUNT(*) FROM seller_reviews r WHERE r.seller_id = l.owner_id) AS seller_review_count,
         EXISTS (
           SELECT 1 FROM seller_reviews r
            WHERE r.listing_id = l.listing_id AND r.buyer_id = $1
         ) AS is_rated_by_me,
         (
           SELECT CASE
             WHEN COUNT(*) = 0 THEN NULL
             ELSE ROUND(
               100.0 * COUNT(*) FILTER (
                 WHERE EXISTS (
                   SELECT 1
                     FROM messages reply
                    WHERE reply.conversation_id = c.conversation_id
                      AND reply.sender_id = l.owner_id
                      AND reply.sent_at > buyer_message.sent_at
                      AND reply.sent_at <= buyer_message.sent_at + INTERVAL '24 hours'
                 )
               ) / COUNT(*)
             )
           END
             FROM messages buyer_message
             JOIN conversations c ON c.conversation_id = buyer_message.conversation_id
            WHERE buyer_message.sender_id = c.buyer_id
              AND EXISTS (
                SELECT 1 FROM listings owned
                 WHERE owned.listing_id = c.listing_id
                   AND owned.owner_id = l.owner_id
              )
         ) AS seller_response_rate
    FROM listings l
    JOIN users u ON u.user_id = l.owner_id
`;

function mapListing(row) {
  if (!row) return null;
  const reviewAverage = row.seller_review_avg === null ? null : Number(row.seller_review_avg);
  const responseRate = row.seller_response_rate === null ? null : Number(row.seller_response_rate);
  const reviewCount = Number(row.seller_review_count || 0);
  let rating = null;

  if (reviewAverage !== null || responseRate !== null) {
    let weightedRating = 0;
    let totalWeight = 0;
    if (reviewAverage !== null) {
      weightedRating += reviewAverage * 0.7;
      totalWeight += 0.7;
    }
    if (responseRate !== null) {
      weightedRating += (responseRate / 20) * 0.3;
      totalWeight += 0.3;
    }
    rating = Math.round((weightedRating / totalWeight) * 10) / 10;
  }

  return {
    id: Number(row.listing_id),
    ownerId: Number(row.owner_id),
    ownerName: row.owner_name,
    ownerEmail: row.owner_email,
    ownerAvatar: row.owner_avatar,
    title: row.title,
    description: row.description,
    kind: row.kind,
    price: Number(row.price),
    area: Number(row.area),
    rooms: row.rooms,
    floor: row.floor,
    totalFloors: row.total_floors,
    district: row.district,
    address: row.address,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    parking: row.parking,
    status: row.status,
    moderationNote: row.moderation_note,
    views: row.views,
    saves: Number(row.favorite_count || 0),
    ownerRating: rating,
    ownerReviewCount: reviewCount,
    ownerResponseRate: responseRate,
    ratedByMe: Boolean(row.is_rated_by_me),
    orientations: (row.orientations || []).map((code) => codeToDirection[code] || code),
    photos: row.photos || [],
    isFavorite: Boolean(row.is_favorite),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at,
    publishedAt: row.published_at,
    closedAt: row.closed_at
  };
}

function normalizeDirections(values) {
  return [...new Set(values.map((value) => directionToCode[value]))];
}

function buildTitle(data) {
  if (data.title) return data.title;
  if (data.rooms === 0) return "Студия";
  return `${data.rooms}-комнатная квартира`;
}

async function list(filters, userId = null) {
  const values = [userId];
  const where = ["l.status = 'published'"];

  function add(value, clause) {
    values.push(value);
    where.push(clause(values.length));
  }

  if (filters.query) {
    add(
      `%${filters.query}%`,
      (index) => `(l.title ILIKE $${index} OR l.description ILIKE $${index} OR l.address ILIKE $${index} OR l.district ILIKE $${index})`
    );
  }
  if (filters.kind) add(filters.kind, (index) => `l.kind = $${index}`);
  if (filters.rooms !== undefined) {
    if (filters.rooms === 3) {
      where.push("l.rooms >= 3");
    } else {
      add(filters.rooms, (index) => `l.rooms = $${index}`);
    }
  }
  if (filters.district) add(filters.district, (index) => `l.district = $${index}`);
  if (filters.minPrice !== undefined) add(filters.minPrice, (index) => `l.price >= $${index}`);
  if (filters.maxPrice !== undefined) add(filters.maxPrice, (index) => `l.price <= $${index}`);
  if (filters.minArea !== undefined) add(filters.minArea, (index) => `l.area >= $${index}`);
  if (filters.maxArea !== undefined) add(filters.maxArea, (index) => `l.area <= $${index}`);

  const orderBy = {
    priceAsc: "l.price ASC",
    priceDesc: "l.price DESC",
    areaDesc: "l.area DESC",
    newest: "l.published_at DESC NULLS LAST, l.created_at DESC",
    match: "l.published_at DESC NULLS LAST, l.created_at DESC"
  }[filters.sort] || "l.created_at DESC";

  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 100);
  values.push(limit);

  const result = await pool.query(
    `${listingSelect}
      WHERE ${where.join(" AND ")}
      ORDER BY ${orderBy}
      LIMIT $${values.length}`,
    values
  );
  return result.rows.map(mapListing);
}

async function getById(listingId, user = null) {
  const result = await pool.query(
    `${listingSelect} WHERE l.listing_id = $2`,
    [user?.user_id || null, listingId]
  );
  const listing = mapListing(result.rows[0]);
  if (!listing) throw new HttpError(404, "Объявление не найдено");

  const canView = listing.status === "published"
    || listing.ownerId === Number(user?.user_id)
    || user?.role === "moderator";
  if (!canView) throw new HttpError(404, "Объявление не найдено");
  return listing;
}

async function getMine(userId) {
  const result = await pool.query(
    `${listingSelect}
      WHERE l.owner_id = $2
      ORDER BY l.created_at DESC`,
    [userId, userId]
  );
  return result.rows.map(mapListing);
}

async function create(userId, data) {
  let coordinates = { latitude: null, longitude: null };
  try {
    coordinates = await geocodeAddress(data.address, data.district);
  } catch (error) {
    console.warn("Address was not geocoded:", error.message);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO listings (
         owner_id, title, description, kind, price, area, rooms, floor,
         total_floors, district, address, latitude, longitude, parking
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING listing_id`,
      [
        userId,
        buildTitle(data),
        data.description,
        data.kind,
        data.price,
        data.area,
        data.rooms,
        data.floor,
        data.totalFloors,
        data.district,
        data.address,
        coordinates.latitude,
        coordinates.longitude,
        data.parking ?? false
      ]
    );
    const listingId = result.rows[0].listing_id;
    await replaceRelations(client, listingId, data);
    await client.query(
      "INSERT INTO listing_events (listing_id, user_id, event_type) VALUES ($1, $2, 'created')",
      [listingId, userId]
    );
    await client.query("COMMIT");
    return getById(listingId, { user_id: userId, role: "user" });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function update(listingId, userId, data) {
  const existing = await getById(listingId, { user_id: userId, role: "user" });
  if (existing.ownerId !== Number(userId)) throw new HttpError(403, "Можно изменять только свои объявления");
  if (["published", "closed"].includes(existing.status)) {
    throw new HttpError(409, "Редактирование опубликованных и закрытых объявлений пока не предусмотрено");
  }

  const merged = {
    ...existing,
    ...data,
    orientations: data.orientations || existing.orientations,
    photos: data.photos || existing.photos
  };
  if (merged.totalFloors < merged.floor) {
    throw new HttpError(400, "Этаж не может быть выше общего числа этажей");
  }

  let coordinates = { latitude: existing.latitude, longitude: existing.longitude };
  if (data.address || data.district) {
    try {
      coordinates = await geocodeAddress(merged.address, merged.district);
    } catch (error) {
      console.warn("Address was not geocoded:", error.message);
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE listings
          SET title = $1, description = $2, kind = $3, price = $4, area = $5,
              rooms = $6, floor = $7, total_floors = $8, district = $9,
              address = $10, latitude = $11, longitude = $12, parking = $13,
              status = 'pending', moderation_note = NULL, reviewed_at = NULL, published_at = NULL
        WHERE listing_id = $14 AND owner_id = $15`,
      [
        buildTitle(merged), merged.description, merged.kind, merged.price, merged.area,
        merged.rooms, merged.floor, merged.totalFloors, merged.district,
        merged.address, coordinates.latitude, coordinates.longitude, merged.parking, listingId, userId
      ]
    );
    await client.query("DELETE FROM listing_photos WHERE listing_id = $1", [listingId]);
    await client.query("DELETE FROM listing_orientations WHERE listing_id = $1", [listingId]);
    await replaceRelations(client, listingId, merged);
    await client.query(
      "INSERT INTO listing_events (listing_id, user_id, event_type) VALUES ($1, $2, 'updated')",
      [listingId, userId]
    );
    await client.query("COMMIT");
    return getById(listingId, { user_id: userId, role: "user" });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function close(listingId, userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE listings
          SET status = 'closed', closed_at = NOW()
        WHERE listing_id = $1 AND owner_id = $2 AND status = 'published'
        RETURNING listing_id`,
      [listingId, userId]
    );
    if (!result.rows[0]) {
      throw new HttpError(409, "Закрыть можно только собственное опубликованное объявление");
    }
    await client.query(
      "INSERT INTO listing_events (listing_id, user_id, event_type) VALUES ($1, $2, 'closed')",
      [listingId, userId]
    );
    await client.query("COMMIT");
    return getById(listingId, { user_id: userId, role: "user" });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function replaceRelations(client, listingId, data) {
  const photos = data.photos || [];
  for (let index = 0; index < photos.length; index += 1) {
    await client.query(
      "INSERT INTO listing_photos (listing_id, file_path, sort_order) VALUES ($1, $2, $3)",
      [listingId, photos[index], index]
    );
  }
  for (const code of normalizeDirections(data.orientations)) {
    await client.query(
      "INSERT INTO listing_orientations (listing_id, direction_code) VALUES ($1, $2)",
      [listingId, code]
    );
  }
}

async function remove(listingId, userId) {
  const result = await pool.query(
    "DELETE FROM listings WHERE listing_id = $1 AND owner_id = $2 RETURNING listing_id",
    [listingId, userId]
  );
  if (!result.rows[0]) throw new HttpError(404, "Объявление не найдено");
}

async function registerView(listingId, userId = null) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "UPDATE listings SET views = views + 1 WHERE listing_id = $1 AND status = 'published' RETURNING listing_id",
      [listingId]
    );
    if (!result.rows[0]) throw new HttpError(404, "Объявление не найдено");
    await client.query(
      "INSERT INTO listing_events (listing_id, user_id, event_type) VALUES ($1, $2, 'viewed')",
      [listingId, userId]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { list, getById, getMine, create, update, close, remove, registerView, mapListing };
