const db = require("../config/db");
const HttpError = require("../utils/http-error");
const { publicUser } = require("./auth.service");

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

async function getById(userId) {
  const result = await db.query(
    `SELECT user_id, email, display_name, role, phone, avatar_path, birth_date, created_at, updated_at
       FROM users
      WHERE user_id = $1`,
    [userId]
  );
  if (!result.rows[0]) throw new HttpError(404, "Пользователь не найден");
  return publicUser(result.rows[0]);
}

async function update(userId, data) {
  const fields = [];
  const values = [];

  const mapping = {
    name: "display_name",
    email: "email",
    birthDate: "birth_date",
    phone: "phone",
    avatarPath: "avatar_path"
  };

  for (const [key, column] of Object.entries(mapping)) {
    if (data[key] !== undefined) {
      values.push(data[key]);
      fields.push(`${column} = $${values.length}`);
    }
  }

  if (!fields.length) throw new HttpError(400, "Нет полей для обновления");
  values.push(userId);

  const result = await db.query(
    `UPDATE users
        SET ${fields.join(", ")}
      WHERE user_id = $${values.length}
      RETURNING user_id, email, display_name, role, phone, avatar_path, birth_date`,
    values
  );
  if (!result.rows[0]) throw new HttpError(404, "Пользователь не найден");
  return publicUser(result.rows[0]);
}

async function getPreferences(userId) {
  const result = await db.query(
    `SELECT max_price, min_area, rooms, directions, districts, updated_at
       FROM user_preferences
      WHERE user_id = $1`,
    [userId]
  );
  const row = result.rows[0];
  if (!row) {
    return { maxPrice: null, minArea: null, rooms: [], directions: [], districts: [], updatedAt: null };
  }
  return {
    maxPrice: row.max_price === null ? null : Number(row.max_price),
    minArea: row.min_area === null ? null : Number(row.min_area),
    rooms: row.rooms || [],
    directions: row.directions || [],
    districts: row.districts || [],
    updatedAt: row.updated_at
  };
}

async function savePreferences(userId, data) {
  const directions = data.directions?.map((value) => directionToCode[value]);
  const result = await db.query(
    `INSERT INTO user_preferences (user_id, max_price, min_area, rooms, directions, districts)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id)
     DO UPDATE SET
       max_price = COALESCE(EXCLUDED.max_price, user_preferences.max_price),
       min_area = COALESCE(EXCLUDED.min_area, user_preferences.min_area),
       rooms = COALESCE(EXCLUDED.rooms, user_preferences.rooms),
       directions = COALESCE(EXCLUDED.directions, user_preferences.directions),
       districts = COALESCE(EXCLUDED.districts, user_preferences.districts)
     RETURNING max_price, min_area, rooms, directions, districts, updated_at`,
    [
      userId,
      data.maxPrice ?? null,
      data.minArea ?? null,
      data.rooms ?? null,
      directions ?? null,
      data.districts ?? null
    ]
  );
  const row = result.rows[0];
  return {
    maxPrice: row.max_price === null ? null : Number(row.max_price),
    minArea: row.min_area === null ? null : Number(row.min_area),
    rooms: row.rooms || [],
    directions: row.directions || [],
    districts: row.districts || [],
    updatedAt: row.updated_at
  };
}

module.exports = { getById, update, getPreferences, savePreferences };
