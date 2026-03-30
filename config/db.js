const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  keepAlive: true,
  connectionTimeoutMillis: 10000,
});

// Test connection once on startup
pool.query("SELECT 1")
  .then(() => console.log("Connected to PostgreSQL database"))
  .catch((err) => console.error("Failed to connect to PostgreSQL:", err.message));

pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL client", err);
  process.exit(-1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
