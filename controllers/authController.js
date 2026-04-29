const User = require("../models/userModel");
const AuditLog = require("../models/auditLogModel");
const { validationResult } = require("express-validator");
const { roleMatches } = require("../middleware/auth");

const authController = {
  getDefaultRedirectForUser(user) {
    const activeRole = user.activeRole || user.role;
    return activeRole === "admin" ? "/labs/manage" : "/dashboard";
  },

  // GET /auth/login
  getLogin(req, res) {
    res.render("auth/login", {
      title: "Login",
      redirectTo: req.query.redirect || "",
    });
  },

  // POST /auth/login
  async postLogin(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        req.flash("error", errors.array().map((e) => e.msg).join(", "));
        return res.redirect("/auth/login");
      }

      const { email, password, role } = req.body;
      const user = await User.findByEmail(email);

      if (!user) {
        req.flash("error", "Invalid email or password");
        return res.redirect("/auth/login");
      }

      if (!user.is_active) {
        if (user.suspended_until) {
            const reactivateDate = new Date(user.suspended_until).toLocaleDateString();
            req.flash("error", `Your account is suspended until ${reactivateDate}. Contact admin.`);
        } else {
            req.flash("error", "Your account has been deactivated. Contact admin.");
        }
        return res.redirect("/auth/login");
      }

      const isValid = await User.verifyPassword(password, user.password_hash);
      if (!isValid) {
        req.flash("error", "Invalid email or password");
        return res.redirect("/auth/login");
      }

      // Verify selected role matches user's actual role
      // For dual-role users, accept either student or assistant
      if (!roleMatches(user.role, role)) {
        console.log(`Role mismatch: selected=${role}, actual=${user.role}`);
        req.flash("error", "Invalid email or password");
        return res.redirect("/auth/login");
      }

      // Determine active role for this session
      let activeRole = user.role;
      if (user.role === "student+assistant") {
        activeRole = role; // Use the role they selected at login
      }

      // Set session
      req.session.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        activeRole: activeRole,
        enrollment_no: user.enrollment_no,
        profile_image: user.profile_image || null,
        can_view_statistics: user.can_view_statistics || false,
      };

      if (activeRole === "admin" || activeRole === "assistant") {
        await AuditLog.log({
          userId: user.id,
          userName: user.name,
          action: "LOGIN",
          targetType: "user",
          targetId: user.id,
          details: `${activeRole.charAt(0).toUpperCase() + activeRole.slice(1)} ${user.name} logged in`,
          ipAddress: req.ip,
        });
      }

      req.flash("success", `Welcome back, ${user.name}!`);
      const redirectTo = req.body.redirect || authController.getDefaultRedirectForUser({ activeRole });
      return res.redirect(redirectTo);
    } catch (err) {
      console.error("Login error:", err);
      req.flash("error", "Something went wrong. Please try again.");
      return res.redirect("/auth/login");
    }
  },

  // POST /auth/logout
  async logout(req, res) {
    if (req.session.user) {
      await AuditLog.log({
        userId: req.session.user.id,
        userName: req.session.user.name,
        action: "LOGOUT",
        targetType: "user",
        targetId: req.session.user.id,
        details: null,
        ipAddress: req.ip,
      });
    }
    req.session = null;
    res.redirect("/auth/login");
  },

  // POST /auth/switch-role — for dual-role users
  async switchRole(req, res) {
    try {
      if (!req.session.user) {
        return res.redirect("/auth/login");
      }

      const user = req.session.user;
      if (user.role !== "student+assistant") {
        req.flash("error", "Role switching is not available for your account");
        return res.redirect("/dashboard");
      }

      const currentActive = user.activeRole || user.role;
      const newActive = currentActive === "student" ? "assistant" : "student";

      req.session.user.activeRole = newActive;

      await AuditLog.log({
        userId: user.id,
        userName: user.name,
        action: "SWITCH_ROLE",
        targetType: "user",
        targetId: user.id,
        details: `Switched from ${currentActive} to ${newActive}`,
        ipAddress: req.ip,
      });

      req.flash("success", `Switched to ${newActive} mode`);
      return res.redirect(newActive === "admin" ? "/labs/manage" : "/dashboard");
    } catch (err) {
      console.error("Switch role error:", err);
      req.flash("error", "Failed to switch role");
      return res.redirect("/dashboard");
    }
  },
};

module.exports = authController;
