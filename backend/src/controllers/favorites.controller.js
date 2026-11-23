const favoritesService = require("../services/favorites.service");
const HttpError = require("../utils/http-error");

function listingId(req) {
  const id = Number(req.params.listingId);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Некорректный идентификатор");
  return id;
}

async function list(req, res) {
  res.json({ data: await favoritesService.list(req.user.user_id) });
}

async function add(req, res) {
  await favoritesService.add(req.user.user_id, listingId(req));
  res.status(204).end();
}

async function remove(req, res) {
  await favoritesService.remove(req.user.user_id, listingId(req));
  res.status(204).end();
}

module.exports = { list, add, remove };
