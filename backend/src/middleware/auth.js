const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const { query } = require("../config/db");
const HttpError = require("../utils/http-error");
const asyncHandler = require("./async-handler");

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest();
}

const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    throw new HttpError(401, "Требуется авторизация");
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new HttpError(401, "Недействительный или истёкший токен");
  }

  const result = await query(
    `SELECT u.user_id, u.email, u.display_name, u.role, u.phone, u.avatar_path, u.birth_date
       FROM auth_sessions s
       JOIN users u ON u.user_id = s.user_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > NOW()
        AND u.user_id = $2`,
    [tokenHash(token), payload.sub]
  );

  if (!result.rows[0]) throw new HttpError(401, "Сессия завершена");

  req.user = result.rows[0];
  req.authToken = token;
  next();
});

const optionalAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return next();

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const result = await query(
      `SELECT u.user_id, u.email, u.display_name, u.role, u.phone, u.avatar_path, u.birth_date
         FROM auth_sessions s
         JOIN users u ON u.user_id = s.user_id
        WHERE s.token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > NOW()
          AND u.user_id = $2`,
      [tokenHash(token), payload.sub]
    );
    if (result.rows[0]) {
      req.user = result.rows[0];
      req.authToken = token;
    }
  } catch {
    req.user = null;
  }

  next();
});

function requireRole(...roles) {
  return function roleMiddleware(req, _res, next) {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new HttpError(403, "Недостаточно прав"));
    }
    return next();
  };
}

module.exports = { authenticate, optionalAuth, requireRole, tokenHash };
