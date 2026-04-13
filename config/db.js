const { Pool } = require("pg");
const isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

const pool = new Pool({
  ...(hasDatabaseUrl
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      }
    : {
        host: process.env.DB_HOST || "localhost",
        port: Number(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || "lab_management",
        user: process.env.DB_USER || "postgres",
        password: process.env.DB_PASSWORD || "",
        ssl: false,
      }),
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
