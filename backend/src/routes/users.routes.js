const express = require("express");
const validate = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const asyncHandler = require("../middleware/async-handler");
const { updateUserSchema, preferencesSchema } = require("../schemas");
const controller = require("../controllers/users.controller");

const router = express.Router();

router.get("/me", authenticate, asyncHandler(controller.me));
router.patch("/me", authenticate, validate(updateUserSchema), asyncHandler(controller.updateMe));
router.get("/me/preferences", authenticate, asyncHandler(controller.preferences));
router.put(
  "/me/preferences",
  authenticate,
  validate(preferencesSchema),
  asyncHandler(controller.updatePreferences)
);

module.exports = router;
