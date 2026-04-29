const pg = require("pg");
const { Pool } = pg;

process.env.TZ = process.env.TZ || process.env.TIMEZONE || "Asia/Kolkata";

// PostgreSQL TIMESTAMP WITHOUT TIME ZONE stores the app's local lab time.
// Parse it as local time; appending "Z" would incorrectly treat it as UTC.
pg.types.setTypeParser(1114, (str) => new Date(str.replace(" ", "T")));

const isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const dbTimeZone = process.env.DB_TIMEZONE || process.env.TIMEZONE || "Asia/Kolkata";

const pool = new Pool({
  ...(hasDatabaseUrl
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { require: true, rejectUnauthorized: false },
      }
    : {
        host: process.env.DB_HOST || "localhost",
        port: Number(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || "lab_management",
        user: process.env.DB_USER || "postgres",
        password: process.env.DB_PASSWORD || "",
        ssl: isProduction ? { require: true, rejectUnauthorized: false } : false,
      }),
  keepAlive: true,
  options: `-c TimeZone=${dbTimeZone}`,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 3000, // close idle connections quickly in serverless
  max: isProduction ? 1 : 10,
  allowExitOnIdle: true,
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
