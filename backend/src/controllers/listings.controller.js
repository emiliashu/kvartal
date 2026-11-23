const listingsService = require("../services/listings.service");
const HttpError = require("../utils/http-error");

function idFrom(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Некорректный идентификатор");
  return id;
}

async function list(req, res) {
  const listings = await listingsService.list(req.validated.query, req.user?.user_id || null);
  res.json({ data: listings });
}

async function getById(req, res) {
  const listing = await listingsService.getById(idFrom(req.params.id), req.user);
  res.json({ data: listing });
}

async function mine(req, res) {
  const listings = await listingsService.getMine(req.user.user_id);
  res.json({ data: listings });
}

async function create(req, res) {
  const listing = await listingsService.create(req.user.user_id, req.validated.body);
  res.status(201).json({ data: listing });
}

async function update(req, res) {
  const listing = await listingsService.update(idFrom(req.params.id), req.user.user_id, req.validated.body);
  res.json({ data: listing });
}

async function remove(req, res) {
  await listingsService.remove(idFrom(req.params.id), req.user.user_id);
  res.status(204).end();
}

async function close(req, res) {
  const listing = await listingsService.close(idFrom(req.params.id), req.user.user_id);
  res.json({ data: listing });
}

async function view(req, res) {
  await listingsService.registerView(idFrom(req.params.id), req.user?.user_id || null);
  res.status(204).end();
}

module.exports = { list, getById, mine, create, update, close, remove, view };
