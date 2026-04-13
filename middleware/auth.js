// Authentication middleware

function getHomePathForRole(user) {
  if (!user) return "/auth/login";
  if (user.role === "admin") return "/labs/manage";
  return "/dashboard";
}

function getInactiveUserMessage(user) {
  if (user && user.suspended_until) {
    const reactivateDate = new Date(user.suspended_until).toLocaleDateString();
    return `Your account is suspended until ${reactivateDate}. Contact admin.`;
  }

  return "Your account has been deactivated. Contact admin.";
}

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
    return res.redirect(getHomePathForRole(req.session.user));
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
      return res.redirect(getHomePathForRole(req.session.user));
    }
    return next();
  };
}

function disallowRoles(...roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      req.flash("error", "Please log in to continue");
      return res.redirect("/auth/login");
    }
    if (roles.includes(req.session.user.role)) {
      req.flash("error", "You do not have permission to access this page");
      return res.redirect(getHomePathForRole(req.session.user));
    }
    return next();
  };
}

// Make user data available to all views
async function setLocals(req, res, next) {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.currentPath = req.path;
  res.locals.currentUser = null;
  res.locals.activeSection = null;

  if (req.session.user) {
    try {
      const User = require("../models/userModel");
      const freshUser = await User.findById(req.session.user.id);

      if (!freshUser || !freshUser.is_active) {
        const message = getInactiveUserMessage(freshUser);
        req.session.user = null;
        req.flash("error", message);
        res.locals.currentUser = null;

        return req.session.save(() => {
          if (req.xhr || req.path.startsWith("/api/")) {
            return res.status(401).json({ error: message });
          }

          return res.redirect("/auth/login");
        });
      } else {
        req.session.user = {
          id: freshUser.id,
          name: freshUser.name,
          email: freshUser.email,
          role: freshUser.role,
          enrollment_no: freshUser.enrollment_no,
          profile_image: freshUser.profile_image || null,
        };
        res.locals.currentUser = req.session.user;
      }
    } catch (e) {
      res.locals.currentUser = req.session.user;
    }
  }

  // Load labs for navbar QR dropdown (admin/assistant only)
  if (req.session.user && req.session.user.role === 'assistant') {
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
  disallowRoles,
  setLocals,
};
