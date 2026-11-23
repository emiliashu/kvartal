const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../config/db");
const env = require("../config/env");
const HttpError = require("../utils/http-error");

function publicUser(row) {
  return {
    id: Number(row.user_id),
    name: row.display_name,
    email: row.email,
    role: row.role,
    phone: row.phone,
    avatarPath: row.avatar_path,
    birthDate: row.birth_date
  };
}

async function createSession(user, client = pool) {
  const token = jwt.sign(
    { sub: String(user.id), role: user.role, email: user.email },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
  const hash = crypto.createHash("sha256").update(token).digest();
  const decoded = jwt.decode(token);

  await client.query(
    `INSERT INTO auth_sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, to_timestamp($3))`,
    [user.id, hash, decoded.exp]
  );

  return token;
}

async function register({ name, email, password, birthDate }) {
  const passwordHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO users (email, password_hash, display_name, birth_date)
       VALUES ($1, $2, $3, $4)
       RETURNING user_id, email, display_name, role, phone, avatar_path, birth_date`,
      [email, passwordHash, name, birthDate || null]
    );
    const user = publicUser(inserted.rows[0]);
    const token = await createSession(user, client);
    await client.query("COMMIT");
    return { user, token };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function login({ email, password }) {
  const result = await pool.query(
    `SELECT user_id, email, password_hash, display_name, role, phone, avatar_path, birth_date
       FROM users
      WHERE LOWER(email) = LOWER($1)`,
    [email]
  );
  const row = result.rows[0];
  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    throw new HttpError(401, "Неверный email или пароль");
  }

  const user = publicUser(row);
  const token = await createSession(user);
  return { user, token };
}

async function logout(token) {
  const hash = crypto.createHash("sha256").update(token).digest();
  await pool.query(
    "UPDATE auth_sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL",
    [hash]
  );
}

module.exports = { register, login, logout, publicUser };
