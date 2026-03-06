// Authentication middleware

// Check if user is logged in
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  req.flash("error", "Please log in to continue");
  return res.redirect("/auth/login");
}

// Check if user is NOT logged in (for login/register pages)
function isGuest(req, res, next) {
  if (req.session && req.session.user) {
    return res.redirect("/dashboard");
  }
  return next();
}

// Role-based access control
function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      req.flash("error", "Please log in to continue");
      return res.redirect("/auth/login");
    }
    if (!roles.includes(req.session.user.role)) {
      req.flash("error", "You do not have permission to access this page");
      return res.redirect("/dashboard");
    }
    return next();
  };
}

// Make user data available to all views
async function setLocals(req, res, next) {
  res.locals.currentUser = req.session.user || null;
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");

  // Load labs for navbar QR dropdown (admin/assistant only)
  if (req.session.user && (req.session.user.role === 'admin' || req.session.user.role === 'assistant')) {
    try {
      const db = require("../config/db");
      const result = await db.query("SELECT id, name FROM labs WHERE is_active = TRUE ORDER BY name");
      res.locals.navLabs = result.rows;
    } catch (e) {
      res.locals.navLabs = [];
    }
  } else {
    res.locals.navLabs = [];
  }

  next();
}

module.exports = {
  isAuthenticated,
  isGuest,
  authorizeRoles,
  setLocals,
};
