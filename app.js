require("dotenv").config();
const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const flash = require("connect-flash");
const methodOverride = require("method-override");
const path = require("path");
const { pool } = require("./config/db");

// Import middleware
const { setLocals } = require("./middleware/auth");

// Import routes
const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const labRoutes = require("./routes/labRoutes");
const sessionRoutes = require("./routes/sessionRoutes");
const userRoutes = require("./routes/userRoutes");
const qrRoutes = require("./routes/qrRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

// =========================
// Middleware
// =========================

// EJS view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static files
app.use(express.static(path.join(__dirname, "public")));

// Method override for PUT/DELETE in forms
app.use(methodOverride("_method"));

// Session configuration
app.use(
  session({
    store: new pgSession({
      pool: pool,
      tableName: "session",
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || "lab-management-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    },
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
    return res.redirect("/dashboard");
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

// QR code routes
app.use("/qr", qrRoutes);

// API endpoints (for AJAX)
app.get("/api/lab-occupancy/:labId", async (req, res) => {
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
  console.error("Server error:", err);
  res.status(500).send("Something went wrong! Please try again later.");
});

// =========================
// Start Server
// =========================
app.listen(PORT, () => {
  console.log(`
  ========================================
   Lab In/Out Management System
   Running on http://localhost:${PORT}
   Environment: ${process.env.NODE_ENV || "development"}
  ========================================
  `);
});

module.exports = app;
