require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cookieSession = require("cookie-session");
const flash = require("connect-flash");
const methodOverride = require("method-override");
const path = require("path");
const { pool } = require("./config/db");

// Import middleware
const { setLocals, isAuthenticated, authorizeRoles, disallowRoles, requireStatisticsAccess } = require("./middleware/auth");

// Import routes
const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const labRoutes = require("./routes/labRoutes");
const sessionRoutes = require("./routes/sessionRoutes");
const userRoutes = require("./routes/userRoutes");
const adminRoutes = require("./routes/adminRoutes");
const statisticsRoutes = require("./routes/statisticsRoutes");
const profileRoutes = require("./routes/profileRoutes");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
const shouldRunRuntimeDbSetup =
  process.env.RUN_RUNTIME_DB_SETUP === "true" ||
  (!isProduction && process.env.RUN_RUNTIME_DB_SETUP !== "false");

// Make io accessible to routes/controllers
app.set("io", io);

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
        value TEXT NOT NULL
      )
    `);

    await pool.query("ALTER TABLE system_settings ALTER COLUMN value TYPE TEXT");

    await pool.query(
      `INSERT INTO system_settings (key, value)
       VALUES ('violation_limit', '3')
       ON CONFLICT (key) DO NOTHING`
    );

    await pool.query(
      `INSERT INTO system_settings (key, value)
       VALUES ('departments', $1)
       ON CONFLICT (key) DO NOTHING`,
      [JSON.stringify([
        "Computer Science",
        "Information Technology",
        "Electronics",
        "Electrical",
        "Mechanical",
        "Civil",
      ])]
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

// ── New migrations for feature changes ──

async function ensureDualRoleSupport() {
  try {
    // Relax the role CHECK constraint to allow 'student+assistant'
    await pool.query(`
      DO $$
      BEGIN
        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
        ALTER TABLE users ADD CONSTRAINT users_role_check
          CHECK (role IN ('student', 'assistant', 'admin', 'student+assistant'));
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END $$;
    `);
  } catch (error) {
    console.error("Failed to ensure dual role support:", error.message);
  }
}

async function ensureCanViewStatisticsColumn() {
  try {
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS can_view_statistics BOOLEAN DEFAULT FALSE");
  } catch (error) {
    console.error("Failed to ensure can_view_statistics column:", error.message);
  }
}

async function ensureViolationLockedColumn() {
  try {
    await pool.query("ALTER TABLE violation_logs ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT FALSE");
  } catch (error) {
    console.error("Failed to ensure violation locked column:", error.message);
  }
}

async function ensureLabManualInactiveColumn() {
  try {
    await pool.query("ALTER TABLE labs ADD COLUMN IF NOT EXISTS manual_inactive BOOLEAN DEFAULT FALSE");
    await pool.query("ALTER TABLE labs ADD COLUMN IF NOT EXISTS manual_active BOOLEAN DEFAULT FALSE");
  } catch (error) {
    console.error("Failed to ensure lab manual status columns:", error.message);
  }
}

async function ensureFixedLabHours() {
  try {
    await pool.query(`
      ALTER TABLE labs
      ALTER COLUMN open_time SET DEFAULT '09:00',
      ALTER COLUMN close_time SET DEFAULT '21:00'
    `);
    await pool.query("UPDATE labs SET open_time = '09:00', close_time = '21:00'");
  } catch (error) {
    console.error("Failed to ensure fixed lab hours:", error.message);
  }
}

async function ensureViolationRemovalRequestsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS violation_removal_requests (
        id SERIAL PRIMARY KEY,
        violation_id INT NOT NULL REFERENCES violation_logs(id) ON DELETE CASCADE,
        requested_by INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reason TEXT,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        reviewed_by INT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_violation_requests_status ON violation_removal_requests(status)`);
  } catch (error) {
    console.error("Failed to ensure violation removal requests table:", error.message);
  }
}

async function ensureAuditLogsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE SET NULL,
        user_name VARCHAR(100),
        action VARCHAR(100) NOT NULL,
        target_type VARCHAR(50),
        target_id INT,
        details TEXT,
        ip_address VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON admin_audit_logs(created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON admin_audit_logs(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON admin_audit_logs(action)`);
  } catch (error) {
    console.error("Failed to ensure audit logs table:", error.message);
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
    const activeRole = req.session.user.activeRole || req.session.user.role;
    return res.redirect(activeRole === "admin" ? "/labs/manage" : "/dashboard");
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

// Admin routes (settings, logs, violation requests, directory)
app.use("/admin", adminRoutes);

// Statistics routes (admin + authorized assistant)
app.use("/statistics", statisticsRoutes);

// Profile routes (all authenticated users)
app.use("/profile", profileRoutes);

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

// API: Live sessions for WebSocket fallback / initial load
app.get("/api/live-sessions", isAuthenticated, async (req, res) => {
  try {
    const LabSession = require("./models/sessionModel");
    const Lab = require("./models/labModel");
    const activeSessions = await LabSession.getAllActiveSessions();
    const stats = await LabSession.getTodayStats();
    const labs = await Lab.findAllWithOccupancy();
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json({ activeSessions, stats, labs });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch live data" });
  }
});

app.get("/api/labs-state", isAuthenticated, disallowRoles("admin"), async (req, res) => {
  try {
    const LabSession = require("./models/sessionModel");
    const Lab = require("./models/labModel");
    const labs = await Lab.findAllWithOccupancy(false);
    const activeSession = req.session.user
      ? await LabSession.getActiveSession(req.session.user.id)
      : null;
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json({ labs, activeSession });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch labs" });
  }
});

app.get("/api/student-dashboard-state", isAuthenticated, authorizeRoles("student"), async (req, res) => {
  try {
    const LabSession = require("./models/sessionModel");
    const Lab = require("./models/labModel");
    const User = require("./models/userModel");
    const labs = await Lab.findAllWithOccupancy(false);
    const activeSession = await LabSession.getActiveSession(req.session.user.id);
    const student = await User.findById(req.session.user.id);
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json({ labs, activeSession, student });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch student dashboard state" });
  }
});

app.get("/api/labs/:labId/live", isAuthenticated, authorizeRoles("assistant", "admin"), async (req, res) => {
  try {
    const LabSession = require("./models/sessionModel");
    const Lab = require("./models/labModel");
    const lab = await Lab.findById(req.params.labId);
    if (!lab) return res.status(404).json({ error: "Lab not found" });

    const activeSessions = await LabSession.getActiveSessions(lab.id);
    const recentHistory = await LabSession.getLabHistory(lab.id, 10);
    const occupancy = await Lab.getOccupancy(lab.id);
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json({ lab, activeSessions, recentHistory, occupancy });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch lab live data" });
  }
});

app.get("/api/my-history", isAuthenticated, authorizeRoles("student"), async (req, res) => {
  try {
    const LabSession = require("./models/sessionModel");
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const sessions = await LabSession.getUserHistory(req.session.user.id, limit);
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

app.get("/api/labs/:labId/history", isAuthenticated, authorizeRoles("assistant", "admin"), requireStatisticsAccess, async (req, res) => {
  try {
    const LabSession = require("./models/sessionModel");
    const Lab = require("./models/labModel");
    const lab = await Lab.findById(req.params.labId);
    if (!lab) return res.status(404).json({ error: "Lab not found" });

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const sessions = await LabSession.getLabHistory(lab.id, limit);
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch lab history" });
  }
});

app.get("/api/students/:studentId/history", isAuthenticated, authorizeRoles("assistant", "admin"), requireStatisticsAccess, async (req, res) => {
  try {
    const LabSession = require("./models/sessionModel");
    const User = require("./models/userModel");
    const student = await User.findById(req.params.studentId);
    if (!student) return res.status(404).json({ error: "Student not found" });

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
    const sessions = await LabSession.getUserHistory(student.id, limit);
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch student history" });
  }
});

app.get("/api/admin/logs", isAuthenticated, authorizeRoles("admin"), async (req, res) => {
  try {
    const AuditLog = require("./models/auditLogModel");
    const selectedAction =
      typeof req.query.action_choice !== "undefined"
        ? req.query.action_choice
        : req.query.action;
    const filters = {
      from: req.query.from || "",
      to: req.query.to || "",
      action: selectedAction || "",
      user: req.query.user || "",
      q: req.query.q || "",
    };
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const logs = await AuditLog.findFiltered(filters, limit, 0);
    const totalLogs = await AuditLog.countFiltered(filters);
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json({ logs, totalLogs });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

app.get("/api/admin/violation-requests", isAuthenticated, authorizeRoles("admin"), async (req, res) => {
  try {
    const ViolationRequest = require("./models/violationRequestModel");
    const requests = await ViolationRequest.findPending();
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch violation requests" });
  }
});

app.get("/api/admin/labs", isAuthenticated, authorizeRoles("admin"), async (req, res) => {
  try {
    const Lab = require("./models/labModel");
    const labs = await Lab.findAll(false);
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json({ labs });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch labs" });
  }
});

// =========================
// WebSocket
// =========================
io.on("connection", (socket) => {
  // Send initial data on connect
  (async () => {
    try {
      const LabSession = require("./models/sessionModel");
      const Lab = require("./models/labModel");
      const activeSessions = await LabSession.getAllActiveSessions();
      const stats = await LabSession.getTodayStats();
      const labs = await Lab.findAllWithOccupancy();
      socket.emit("live-update", { activeSessions, stats, labs, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error("WebSocket initial data error:", err.message);
    }
  })();
});

/**
 * Broadcast live session data to all connected clients.
 * Call this after any check-in / check-out / violation action.
 */
async function broadcastLiveUpdate() {
  try {
    const LabSession = require("./models/sessionModel");
    const Lab = require("./models/labModel");
    const activeSessions = await LabSession.getAllActiveSessions();
    const stats = await LabSession.getTodayStats();
    const labs = await Lab.findAllWithOccupancy();
    io.emit("live-update", { activeSessions, stats, labs, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("Broadcast live update error:", err.message);
  }
}

function broadcastAppUpdate(type, payload = {}) {
  io.emit("app-update", { type, ...payload, timestamp: new Date().toISOString() });
}

// Make broadcastLiveUpdate accessible
app.set("broadcastLiveUpdate", broadcastLiveUpdate);
app.set("broadcastAppUpdate", broadcastAppUpdate);
global.__broadcastAppUpdate = broadcastAppUpdate;

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
      
      // New migrations
      await ensureDualRoleSupport();
      await ensureCanViewStatisticsColumn();
      await ensureViolationLockedColumn();
      await ensureLabManualInactiveColumn();
      await ensureFixedLabHours();
      await ensureViolationRemovalRequestsTable();
      await ensureAuditLogsTable();
      
      try {
        const LabSession = require("./models/sessionModel");
        const scheduledClosed = await LabSession.autoClosePastScheduledClose();
        if (scheduledClosed && scheduledClosed.length > 0) {
            console.log(`[Auto-Close] Automatically closed ${scheduledClosed.length} sessions at their scheduled lab close time.`);
        }

        const closed = await LabSession.autoCloseStale(16); // fallback for unusually stale sessions
        if (closed && closed.length > 0) {
            console.log(`[Auto-Close] Automatically closed ${closed.length} stale sessions from yesterday.`);
        }

        // Keep active sessions aligned with the scheduled 9 PM close time.
        setInterval(async () => {
          try {
            const LabSession = require("./models/sessionModel");
            const scheduledClosed = await LabSession.autoClosePastScheduledClose();
            if (scheduledClosed && scheduledClosed.length > 0) {
                console.log(`[Auto-Close] Automatically closed ${scheduledClosed.length} sessions at their scheduled lab close time.`);
                broadcastLiveUpdate();
            }

          } catch(e) {
            console.error("Periodic lab status update error:", e);
          }
        }, 60000); // 1 minute checks

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
    server.listen(PORT, () => {
      console.log(`
  ========================================
   Lab In/Out Management System
   Running on http://localhost:${PORT}
   Environment: ${process.env.NODE_ENV || "development"}
   WebSocket: enabled
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
