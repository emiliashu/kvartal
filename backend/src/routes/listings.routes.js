const express = require("express");
const validate = require("../middleware/validate");
const { authenticate, optionalAuth } = require("../middleware/auth");
const asyncHandler = require("../middleware/async-handler");
const { listingBodySchema, listingUpdateSchema, listingQuerySchema } = require("../schemas");
const controller = require("../controllers/listings.controller");

const router = express.Router();

router.get("/", optionalAuth, validate(listingQuerySchema, "query"), asyncHandler(controller.list));
router.get("/mine", authenticate, asyncHandler(controller.mine));
router.get("/:id", optionalAuth, asyncHandler(controller.getById));
router.post("/", authenticate, validate(listingBodySchema), asyncHandler(controller.create));
router.patch("/:id", authenticate, validate(listingUpdateSchema), asyncHandler(controller.update));
router.patch("/:id/close", authenticate, asyncHandler(controller.close));
router.delete("/:id", authenticate, asyncHandler(controller.remove));
router.post("/:id/view", optionalAuth, asyncHandler(controller.view));

module.exports = router;
