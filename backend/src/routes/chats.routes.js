const express = require("express");
const validate = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const asyncHandler = require("../middleware/async-handler");
const { conversationSchema, messageSchema, sellerReviewSchema } = require("../schemas");
const controller = require("../controllers/chats.controller");

const router = express.Router();
router.use(authenticate);

router.get("/", asyncHandler(controller.list));
router.post("/", validate(conversationSchema), asyncHandler(controller.create));
router.get("/:id/messages", asyncHandler(controller.messages));
router.post("/:id/messages", validate(messageSchema), asyncHandler(controller.send));
router.post("/:id/rating", validate(sellerReviewSchema), asyncHandler(controller.rate));

module.exports = router;
