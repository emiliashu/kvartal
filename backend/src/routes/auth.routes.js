const express = require("express");
const validate = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const asyncHandler = require("../middleware/async-handler");
const { registerSchema, loginSchema } = require("../schemas");
const controller = require("../controllers/auth.controller");

const router = express.Router();

router.post("/register", validate(registerSchema), asyncHandler(controller.register));
router.post("/login", validate(loginSchema), asyncHandler(controller.login));
router.post("/logout", authenticate, asyncHandler(controller.logout));
router.get("/me", authenticate, asyncHandler(controller.me));

module.exports = router;
