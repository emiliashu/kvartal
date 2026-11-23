const usersService = require("../services/users.service");

async function me(req, res) {
  const user = await usersService.getById(req.user.user_id);
  res.json({ data: user });
}

async function updateMe(req, res) {
  const user = await usersService.update(req.user.user_id, req.validated.body);
  res.json({ data: user });
}

async function preferences(req, res) {
  res.json({ data: await usersService.getPreferences(req.user.user_id) });
}

async function updatePreferences(req, res) {
  const result = await usersService.savePreferences(req.user.user_id, req.validated.body);
  res.json({ data: result });
}

module.exports = { me, updateMe, preferences, updatePreferences };
