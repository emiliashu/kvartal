const HttpError = require("../utils/http-error");

function notFound(req, _res, next) {
  next(new HttpError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

function errorHandler(error, _req, res, _next) {
  if (error.code === "23505") {
    return res.status(409).json({ error: "Запись с такими данными уже существует" });
  }

  if (error.code === "23503" || error.code === "23514") {
    return res.status(400).json({ error: "Нарушены ограничения базы данных" });
  }

  const status = error.status || 500;
  if (status >= 500) console.error(error);

  return res.status(status).json({
    error: status >= 500 ? "Внутренняя ошибка сервера" : error.message,
    ...(error.details ? { details: error.details } : {})
  });
}

module.exports = { notFound, errorHandler };
