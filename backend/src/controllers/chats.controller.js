const chatsService = require("../services/chats.service");
const HttpError = require("../utils/http-error");

function idFrom(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Некорректный идентификатор");
  return id;
}

async function list(req, res) {
  res.json({ data: await chatsService.list(req.user.user_id) });
}

async function create(req, res) {
  const chat = await chatsService.create(req.user.user_id, req.validated.body.listingId);
  res.status(201).json({ data: chat });
}

async function messages(req, res) {
  const rows = await chatsService.getMessages(req.user.user_id, idFrom(req.params.id));
  res.json({ data: rows });
}

async function send(req, res) {
  const message = await chatsService.sendMessage(
    req.user.user_id,
    idFrom(req.params.id),
    req.validated.body.body
  );
  res.status(201).json({ data: message });
}

async function rate(req, res) {
  const result = await chatsService.rateSeller(
    req.user.user_id,
    idFrom(req.params.id),
    req.validated.body.score,
    req.validated.body.comment
  );
  res.json({ data: result });
}

module.exports = { list, create, messages, send, rate };
