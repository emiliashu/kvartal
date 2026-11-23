const db = require("../config/db");
const HttpError = require("../utils/http-error");

function mapConversation(row, userId) {
  const currentIsBuyer = Number(row.buyer_id) === Number(userId);
  return {
    id: Number(row.conversation_id),
    listingId: Number(row.listing_id),
    listingTitle: row.listing_title,
    listingDistrict: row.listing_district,
    sellerId: Number(row.seller_id),
    sellerName: row.owner_name,
    person: currentIsBuyer ? row.owner_name : row.buyer_name,
    unread: Number(row.unread || 0),
    updatedAt: row.updated_at,
    lastMessage: row.last_message,
    canRate: currentIsBuyer && Boolean(row.buyer_asked) && Boolean(row.seller_replied),
    ratedByMe: Boolean(row.rated_by_me),
    myRating: row.my_rating === null || row.my_rating === undefined ? null : Number(row.my_rating)
  };
}

async function list(userId) {
  const result = await db.query(
    `SELECT c.*,
            l.title AS listing_title,
            l.district AS listing_district,
            l.owner_id AS seller_id,
            buyer.display_name AS buyer_name,
            owner.display_name AS owner_name,
            (SELECT r.score FROM seller_reviews r
              WHERE r.listing_id = c.listing_id AND r.buyer_id = $1) AS my_rating,
            EXISTS (
              SELECT 1 FROM seller_reviews r
               WHERE r.listing_id = c.listing_id AND r.buyer_id = $1
            ) AS rated_by_me,
            EXISTS (
              SELECT 1 FROM messages m
               WHERE m.conversation_id = c.conversation_id AND m.sender_id = c.buyer_id
            ) AS buyer_asked,
            EXISTS (
              SELECT 1 FROM messages m
               WHERE m.conversation_id = c.conversation_id AND m.sender_id = l.owner_id
            ) AS seller_replied,
            (SELECT m.body FROM messages m WHERE m.conversation_id = c.conversation_id ORDER BY m.sent_at DESC LIMIT 1) AS last_message,
            (SELECT COUNT(*) FROM messages m
              WHERE m.conversation_id = c.conversation_id
                AND m.sender_id <> $1
                AND m.read_at IS NULL) AS unread
       FROM conversations c
       JOIN listings l ON l.listing_id = c.listing_id
       JOIN users buyer ON buyer.user_id = c.buyer_id
       JOIN users owner ON owner.user_id = l.owner_id
      WHERE c.buyer_id = $1 OR l.owner_id = $1
      ORDER BY c.updated_at DESC`,
    [userId]
  );
  return result.rows.map((row) => mapConversation(row, userId));
}

async function create(userId, listingId) {
  const listing = await db.query(
    "SELECT listing_id, owner_id FROM listings WHERE listing_id = $1 AND status = 'published'",
    [listingId]
  );
  if (!listing.rows[0]) throw new HttpError(404, "Объявление не найдено");
  if (Number(listing.rows[0].owner_id) === Number(userId)) {
    throw new HttpError(400, "Нельзя начать диалог с самим собой");
  }

  const result = await db.query(
    `INSERT INTO conversations (listing_id, buyer_id)
     VALUES ($1, $2)
     ON CONFLICT (listing_id, buyer_id)
     DO UPDATE SET updated_at = NOW()
     RETURNING conversation_id`,
    [listingId, userId]
  );
  return { id: Number(result.rows[0].conversation_id), listingId };
}

async function getMessages(userId, conversationId) {
  const conversation = await db.query(
    `SELECT c.conversation_id, c.buyer_id, l.owner_id
       FROM conversations c
       JOIN listings l ON l.listing_id = c.listing_id
      WHERE c.conversation_id = $1
        AND (c.buyer_id = $2 OR l.owner_id = $2)`,
    [conversationId, userId]
  );
  if (!conversation.rows[0]) throw new HttpError(404, "Диалог не найден");

  await db.query(
    `UPDATE messages
        SET read_at = COALESCE(read_at, NOW())
      WHERE conversation_id = $1 AND sender_id <> $2`,
    [conversationId, userId]
  );

  const result = await db.query(
    `SELECT message_id, sender_id, body, sent_at, read_at
       FROM messages
      WHERE conversation_id = $1
      ORDER BY sent_at ASC`,
    [conversationId]
  );
  return result.rows.map((row) => ({
    id: Number(row.message_id),
    senderId: Number(row.sender_id),
    body: row.body,
    sentAt: row.sent_at,
    readAt: row.read_at,
    mine: Number(row.sender_id) === Number(userId)
  }));
}

async function sendMessage(userId, conversationId, body) {
  const access = await db.query(
    `SELECT c.conversation_id
       FROM conversations c
       JOIN listings l ON l.listing_id = c.listing_id
      WHERE c.conversation_id = $1
        AND (c.buyer_id = $2 OR l.owner_id = $2)`,
    [conversationId, userId]
  );
  if (!access.rows[0]) throw new HttpError(404, "Диалог не найден");

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO messages (conversation_id, sender_id, body)
       VALUES ($1, $2, $3)
       RETURNING message_id, sender_id, body, sent_at, read_at`,
      [conversationId, userId, body]
    );
    await client.query("UPDATE conversations SET updated_at = NOW() WHERE conversation_id = $1", [conversationId]);
    await client.query("COMMIT");
    const row = result.rows[0];
    return {
      id: Number(row.message_id),
      senderId: Number(row.sender_id),
      body: row.body,
      sentAt: row.sent_at,
      readAt: row.read_at,
      mine: true
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function rateSeller(userId, conversationId, score, comment) {
  const access = await db.query(
    `SELECT c.listing_id, c.buyer_id, l.owner_id,
            EXISTS (
              SELECT 1 FROM messages m
               WHERE m.conversation_id = c.conversation_id AND m.sender_id = c.buyer_id
            ) AS buyer_asked,
            EXISTS (
              SELECT 1 FROM messages m
               WHERE m.conversation_id = c.conversation_id AND m.sender_id = l.owner_id
            ) AS seller_replied
       FROM conversations c
       JOIN listings l ON l.listing_id = c.listing_id
      WHERE c.conversation_id = $1`,
    [conversationId]
  );
  const conversation = access.rows[0];
  if (!conversation) throw new HttpError(404, "Диалог не найден");
  if (Number(conversation.buyer_id) !== Number(userId)) {
    throw new HttpError(403, "Оценивать продавца может только покупатель");
  }
  if (!conversation.buyer_asked || !conversation.seller_replied) {
    throw new HttpError(409, "Оценка станет доступна после обмена сообщениями");
  }

  await db.query(
    `INSERT INTO seller_reviews (listing_id, seller_id, buyer_id, score, comment)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (listing_id, buyer_id)
     DO UPDATE SET score = EXCLUDED.score, comment = EXCLUDED.comment, updated_at = NOW()`,
    [
      conversation.listing_id,
      conversation.owner_id,
      conversation.buyer_id,
      score,
      comment || null
    ]
  );

  const summary = await db.query(
    `SELECT ROUND(AVG(score)::numeric, 1) AS average, COUNT(*) AS count
       FROM seller_reviews
      WHERE seller_id = $1`,
    [conversation.owner_id]
  );
  return {
    score,
    average: Number(summary.rows[0].average),
    count: Number(summary.rows[0].count)
  };
}

module.exports = { list, create, getMessages, sendMessage, rateSeller };
