const express = require("express");
const path = require("node:path");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const env = require("./config/env");
const db = require("./config/db");
const routes = require("./routes");
const { notFound, errorHandler } = require("./middleware/error-handler");

const app = express();

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      scriptSrc: ["'self'", "https://unpkg.com"],
      imgSrc: [
        "'self'",
        "data:",
        "https://images.unsplash.com",
        "https://unpkg.com",
        "https://tile.openstreetmap.org",
        "https://*.tile.openstreetmap.org"
      ]
    }
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === "null" || env.corsOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed by CORS"));
  }
}));
app.use(express.json({ limit: "5mb" }));
app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

const frontendPath = path.resolve(__dirname, "../../code");

app.get("/api/health", async (_req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "error", database: "unavailable" });
  }
});

app.use("/api", routes);
app.use(express.static(frontendPath));
app.get("/", (_req, res) => res.sendFile(path.join(frontendPath, "index.html")));
app.use(notFound);
app.use(errorHandler);

module.exports = app;
