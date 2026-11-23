const { Pool, types } = require("pg");
const env = require("./env");

types.setTypeParser(1082, (value) => value);

const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: env.nodeEnv === "production" ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error", error);
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params)
};
