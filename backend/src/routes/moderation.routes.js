const express = require("express");
const validate = require("../middleware/validate");
const { authenticate, requireRole } = require("../middleware/auth");
const asyncHandler = require("../middleware/async-handler");
const { moderationQuerySchema, decisionSchema } = require("../schemas");
const controller = require("../controllers/moderation.controller");

const router = express.Router();
router.use(authenticate, requireRole("moderator"));

router.get("/listings", validate(moderationQuerySchema, "query"), asyncHandler(controller.list));
router.get("/listings/:id", asyncHandler(controller.getById));
router.post("/listings/:id/decision", validate(decisionSchema), asyncHandler(controller.decide));

module.exports = router;
