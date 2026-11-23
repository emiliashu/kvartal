const express = require("express");
const authRoutes = require("./auth.routes");
const userRoutes = require("./users.routes");
const listingRoutes = require("./listings.routes");
const favoriteRoutes = require("./favorites.routes");
const chatRoutes = require("./chats.routes");
const moderationRoutes = require("./moderation.routes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/listings", listingRoutes);
router.use("/favorites", favoriteRoutes);
router.use("/chats", chatRoutes);
router.use("/moderation", moderationRoutes);

module.exports = router;
