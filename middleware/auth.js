// Authentication middleware

function getHomePathForRole(user) {
  if (!user) return "/auth/login";
  const activeRole = user.activeRole || user.role;
  if (activeRole === "admin") return "/labs/manage";
  return "/dashboard";
}

function getInactiveUserMessage(user) {
  if (user && user.suspended_until) {
    const reactivateDate = new Date(user.suspended_until).toLocaleDateString();
    return `Your account is suspended until ${reactivateDate}. Contact admin.`;
  }

  return "Your account has been deactivated. Contact admin.";
}

/**
 * Check if a user's role grants them one of the allowed roles.
 * 'student+assistant' grants both 'student' and 'assistant'.
 */
function roleMatches(userRole, allowedRole) {
  if (userRole === allowedRole) return true;
  if (userRole === "student+assistant") {
    return allowedRole === "student" || allowedRole === "assistant";
  }
  return false;
}

/**
 * Get the effective active role for routing/display.
 * For dual-role users, this is the role they selected at login.
 */
function getEffectiveRole(user) {
  return user.activeRole || user.role;
}

function normalizeActiveRole(user) {
  if (!user) return null;
  const activeRole = user.activeRole || user.role;

  if (user.role === "student+assistant") {
    return activeRole === "assistant" ? "assistant" : "student";
  }

  return user.role;
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
    const effectiveRole = normalizeActiveRole(req.session.user);
    const hasRole = roles.some(r => roleMatches(effectiveRole, r));
    if (!hasRole) {
      if (req.xhr || req.path.startsWith("/api/") || (req.get("accept") || "").includes("application/json")) {
        return res.status(403).json({ error: "You do not have permission to access this page" });
      }
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
    const effectiveRole = normalizeActiveRole(req.session.user);
    const blocked = roles.some(r => roleMatches(effectiveRole, r));
    if (blocked) {
      req.flash("error", "You do not have permission to access this page");
      return res.redirect(getHomePathForRole(req.session.user));
    }
    return next();
  };
}

/**
 * Middleware to check if assistant has statistics/history view permission.
 * Admins always pass. Assistants need can_view_statistics = true.
 */
function requireStatisticsAccess(req, res, next) {
  if (!req.session.user) {
    req.flash("error", "Please log in to continue");
    return res.redirect("/auth/login");
  }
  const effectiveRole = normalizeActiveRole(req.session.user);
  if (effectiveRole === "admin") return next();
  if (req.session.user.can_view_statistics) return next();
  
  // For AJAX/API requests return JSON
  if (req.xhr || req.path.startsWith("/api/")) {
    return res.status(403).json({ error: "You are not authorized to view statistics and history" });
  }
  req.flash("error", "You are not authorized to view statistics and history");
  return res.redirect(getHomePathForRole(req.session.user));
}

// Make user data available to all views
async function setLocals(req, res, next) {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.currentPath = req.path;
  res.locals.currentUser = null;
  res.locals.activeSection = null;
  res.locals.pendingViolationRequests = 0;

  if (req.session && req.session.user) {
    try {
      const User = require("../models/userModel");
      const freshUser = await User.findById(req.session.user.id);

      if (!freshUser || !freshUser.is_active) {
        const message = getInactiveUserMessage(freshUser);
        req.session = null;
        req.flash("error", message);
        res.locals.currentUser = null;

        if (req.xhr || req.path.startsWith("/api/")) {
          return res.status(401).json({ error: message });
        }

        return res.redirect("/auth/login");
      } else {
        req.session.user = {
          id: freshUser.id,
          name: freshUser.name,
          email: freshUser.email,
          role: freshUser.role,
          activeRole: normalizeActiveRole({
            role: freshUser.role,
            activeRole: req.session.user.activeRole,
          }),
          enrollment_no: freshUser.enrollment_no,
          profile_image: freshUser.profile_image || null,
          can_view_statistics: freshUser.can_view_statistics || false,
        };
        res.locals.currentUser = req.session.user;

        if (res.locals.currentUser.activeRole === 'admin' || res.locals.currentUser.role === 'admin') {
          const ViolationRequest = require("../models/violationRequestModel");
          res.locals.pendingViolationRequests = await ViolationRequest.countPending();
        }
      }
    } catch (e) {
      res.locals.currentUser = req.session ? req.session.user : null;
      res.locals.pendingViolationRequests = 0;
    }

    if (!req.session || !req.session.user) {
      res.locals.navLabs = [];
      return next();
    }

    // Load pending violation request count for admin
    const effectiveRole = normalizeActiveRole(req.session.user);
    if (effectiveRole === "admin") {
      try {
        const ViolationRequest = require("../models/violationRequestModel");
        res.locals.pendingViolationRequests = await ViolationRequest.countPending();
      } catch (e) {
        res.locals.pendingViolationRequests = 0;
      }
    }
  }

  // Load labs for navbar (assistant only)
  const effectiveRole = req.session && req.session.user ? normalizeActiveRole(req.session.user) : null;
  if (effectiveRole === 'assistant') {
    try {
      const db = require("../config/db");
      const result = await db.query("SELECT id, name, is_active FROM labs ORDER BY is_active DESC, name");
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
  requireStatisticsAccess,
  setLocals,
  getEffectiveRole,
  roleMatches,
};
