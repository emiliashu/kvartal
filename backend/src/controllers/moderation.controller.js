const moderationService = require("../services/moderation.service");
const listingsService = require("../services/listings.service");
const HttpError = require("../utils/http-error");

function idFrom(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Некорректный идентификатор");
  return id;
}

async function list(req, res) {
  res.json({ data: await moderationService.list(req.validated.query.status) });
}

async function getById(req, res) {
  const listing = await listingsService.getById(idFrom(req.params.id), req.user);
  res.json({ data: listing });
}

async function decide(req, res) {
  const id = idFrom(req.params.id);
  const { decision, reason } = req.validated.body;
  await moderationService.decide(id, req.user.user_id, decision, reason);
  const listing = await listingsService.getById(id, req.user);
  res.json({ data: listing });
}

module.exports = { list, getById, decide };
