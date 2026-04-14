require("dotenv").config();
const express = require("express");
const cookieSession = require("cookie-session");
const flash = require("connect-flash");
const methodOverride = require("method-override");
const path = require("path");
const { pool } = require("./config/db");

// Import middleware
const { setLocals, isAuthenticated, disallowRoles } = require("./middleware/auth");

// Import routes
const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const labRoutes = require("./routes/labRoutes");
const sessionRoutes = require("./routes/sessionRoutes");
const userRoutes = require("./routes/userRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
const shouldRunRuntimeDbSetup =
  process.env.RUN_RUNTIME_DB_SETUP === "true" ||
  (!isProduction && process.env.RUN_RUNTIME_DB_SETUP !== "false");

// Vercel/other reverse proxies terminate TLS before forwarding requests to Express.
// Trusting forwarded headers keeps secure cookies and req.protocol accurate on Vercel.
app.set("trust proxy", isProduction ? true : 1);

async function ensureUserProfileImageColumn() {
  try {
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image TEXT");
  } catch (error) {
    console.error("Failed to ensure profile image column:", error.message);
  }
}

async function ensureSystemSettingsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(100) PRIMARY KEY,
        value VARCHAR(255) NOT NULL
      )
    `);

    await pool.query(
      `INSERT INTO system_settings (key, value)
       VALUES ('violation_limit', '3')
       ON CONFLICT (key) DO NOTHING`
    );
  } catch (error) {
    console.error("Failed to ensure system settings table:", error.message);
  }
}

async function ensurePasswordResetTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_prt_token
      ON password_reset_tokens(token_hash)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_prt_user
      ON password_reset_tokens(user_id)
    `);
  } catch (error) {
    console.error("Failed to ensure password reset table:", error.message);
  }
}

async function ensureDatabaseCleanup() {
  try {
    await pool.query(`
      ALTER TABLE labs
      DROP COLUMN IF EXISTS qr_token
    `);

    await pool.query(`
      DROP TABLE IF EXISTS lab_assistants
    `);
  } catch (error) {
    console.error("Failed to clean unused database features:", error.message);
  }
}

async function ensureViolationTerminology() {
  try {
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'defaulter_count'
        ) AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'violation_count'
        ) THEN
          ALTER TABLE users RENAME COLUMN defaulter_count TO violation_count;
        END IF;

        IF EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_name = 'defaulter_logs'
        ) AND NOT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_name = 'violation_logs'
        ) THEN
          ALTER TABLE defaulter_logs RENAME TO violation_logs;
        END IF;
      END $$;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS violation_logs (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        lab_id INT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
        marked_by INT REFERENCES users(id) ON DELETE SET NULL,
        note VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_violation_logs_created_at
      ON violation_logs(created_at DESC)
    `);

    await pool.query(`
      UPDATE system_settings
      SET key = 'violation_limit'
      WHERE key = 'defaulter_limit'
        AND NOT EXISTS (
          SELECT 1 FROM system_settings WHERE key = 'violation_limit'
        )
    `);

    await pool.query(`
      DELETE FROM system_settings
      WHERE key = 'defaulter_limit'
    `);
  } catch (error) {
    console.error("Failed to ensure violation terminology:", error.message);
  }
}

// =========================
// Middleware
// =========================

// EJS view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Body parsers
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.json({ limit: "10mb" }));

// Static files
app.use(express.static(path.join(__dirname, "public")));

// Method override for PUT/DELETE in forms
app.use(methodOverride("_method"));

// Session configuration
app.use(
  cookieSession({
    name: "session",
    keys: [process.env.SESSION_SECRET || "lab-management-secret-key"],
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: isProduction,
    httpOnly: true,
    sameSite: "lax",
  })
);

// Flash messages
app.use(flash());

// Set locals (user data + flash messages available in all views)
app.use(setLocals);

// =========================
// Routes
// =========================

// Home page
app.get("/", (req, res) => {
  if (req.session.user) {
    return res.redirect(req.session.user.role === "admin" ? "/labs/manage" : "/dashboard");
  }
  res.render("home", { title: "Home" });
});

// Auth routes
app.use("/auth", authRoutes);

// Dashboard routes
app.use("/dashboard", dashboardRoutes);

// Lab routes
app.use("/labs", labRoutes);

// Session routes (check-in/check-out)
app.use("/sessions", sessionRoutes);

// User management routes (admin)
app.use("/users", userRoutes);

// Admin routes (settings)
app.use("/admin", adminRoutes);

// API endpoints (for AJAX)
app.get("/api/lab-occupancy/:labId", isAuthenticated, disallowRoles("admin"), async (req, res) => {
  try {
    const Lab = require("./models/labModel");
    const occupancy = await Lab.getOccupancy(req.params.labId);
    res.json({ occupancy });
  } catch (err) {
    res.status(500).json({ error: "Failed to get occupancy" });
  }
});

// =========================
// Error Handling
// =========================

// 404
app.use((req, res) => {
  res.status(404).render("home", {
    title: "404 - Not Found",
  });
});

// General error handler
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  console.error("Server error:", err);
  res.status(500).send("Something went wrong! Please try again later.");
});


// =========================
// Start Server / Bootstrap
// =========================
let bootstrapPromise = null;

function ensureAppReady() {
  if (!shouldRunRuntimeDbSetup) {
    return Promise.resolve();
  }

  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await ensureUserProfileImageColumn();
      await ensureSystemSettingsTable();
      await ensurePasswordResetTable();
      await ensureDatabaseCleanup();
      await ensureViolationTerminology();
      
      try {
        const LabSession = require("./models/sessionModel");
        const closed = await LabSession.autoCloseStale(16); // close sessions older than 16 hours
        if (closed && closed.length > 0) {
            console.log(`[Auto-Close] Automatically closed ${closed.length} stale sessions from yesterday.`);
        }
      } catch (err) {
        console.error("Failed to auto-close stale sessions:", err.message);
      }
    })().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }

  return bootstrapPromise;
}

async function startServer() {
  try {
    await ensureAppReady();
  } finally {
    app.listen(PORT, () => {
      console.log(`
  ========================================
   Lab In/Out Management System
   Running on http://localhost:${PORT}
   Environment: ${process.env.NODE_ENV || "development"}
  ========================================
  `);
    });
  }
}

if (require.main === module) {
  startServer();
} else {
  module.exports = async (req, res) => {
    await ensureAppReady();
    return app(req, res);
  };

  module.exports.app = app;
  module.exports.ensureAppReady = ensureAppReady;
}
