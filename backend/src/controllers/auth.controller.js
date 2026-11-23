const authService = require("../services/auth.service");

async function register(req, res) {
  const result = await authService.register(req.validated.body);
  res.status(201).json({ data: result });
}

async function login(req, res) {
  const result = await authService.login(req.validated.body);
  res.json({ data: result });
}

async function logout(req, res) {
  await authService.logout(req.authToken);
  res.status(204).end();
}

async function me(req, res) {
  res.json({ data: authService.publicUser(req.user) });
}

module.exports = { register, login, logout, me };
