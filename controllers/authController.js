const User = require("../models/userModel");
const { validationResult } = require("express-validator");

const authController = {
  getDefaultRedirectForUser(user) {
    return user.role === "admin" ? "/labs/manage" : "/dashboard";
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
      if (user.role !== role) {
        console.log(`Role mismatch: selected=${role}, actual=${user.role}`);
        req.flash("error", "Invalid email or password");
        return res.redirect("/auth/login");
      }

      // Set session
      req.session.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        enrollment_no: user.enrollment_no,
        profile_image: user.profile_image || null,
      };

      req.flash("success", `Welcome back, ${user.name}!`);
      const redirectTo = req.body.redirect || authController.getDefaultRedirectForUser(user);
      return res.redirect(redirectTo);
    } catch (err) {
      console.error("Login error:", err);
      req.flash("error", "Something went wrong. Please try again.");
      return res.redirect("/auth/login");
    }
  },

  // POST /auth/logout
  logout(req, res) {
    req.session.destroy((err) => {
      if (err) console.error("Logout error:", err);
      res.redirect("/auth/login");
    });
  },
};

module.exports = authController;
