const express = require("express");
const { authenticate } = require("../middleware/auth");
const asyncHandler = require("../middleware/async-handler");
const controller = require("../controllers/favorites.controller");

const router = express.Router();
router.use(authenticate);

router.get("/", asyncHandler(controller.list));
router.post("/:listingId", asyncHandler(controller.add));
router.delete("/:listingId", asyncHandler(controller.remove));

module.exports = router;
