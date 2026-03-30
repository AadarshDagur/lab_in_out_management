const { Pool } = require("pg");
const isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  keepAlive: true,
  connectionTimeoutMillis: 10000,
});

// Avoid extra startup DB work on serverless cold starts.
if (!isProduction) {
  pool.query("SELECT 1")
    .then(() => console.log("Connected to PostgreSQL database"))
    .catch((err) => console.error("Failed to connect to PostgreSQL:", err.message));
}

pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL client", err);
  if (!isProduction) {
    process.exit(-1);
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
