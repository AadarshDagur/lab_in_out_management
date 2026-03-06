const User = require("../models/userModel");
const { validationResult } = require("express-validator");

const authController = {
  // GET /auth/login
  getLogin(req, res) {
    res.render("auth/login", { title: "Login" });
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
        req.flash("error", "Your account has been deactivated. Contact admin.");
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
      };

      req.flash("success", `Welcome back, ${user.name}!`);
      return res.redirect("/dashboard");
    } catch (err) {
      console.error("Login error:", err);
      req.flash("error", "Something went wrong. Please try again.");
      return res.redirect("/auth/login");
    }
  },

  // GET /auth/register
  getRegister(req, res) {
    res.render("auth/register", { title: "Register" });
  },

  // POST /auth/register
  async postRegister(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        req.flash("error", errors.array().map((e) => e.msg).join(", "));
        return res.redirect("/auth/register");
      }

      const { name, email, password, role, enrollment_no, department, phone } = req.body;

      // Only allow student and assistant registration via form
      const allowedRoles = ["student", "assistant"];
      const selectedRole = allowedRoles.includes(role) ? role : "student";

      // Check if email already exists
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        req.flash("error", "An account with this email already exists");
        return res.redirect("/auth/register");
      }

      // Check if enrollment number already exists
      if (enrollment_no) {
        const existingEnrollment = await User.findByEnrollment(enrollment_no);
        if (existingEnrollment) {
          req.flash("error", "This enrollment/staff ID is already registered");
          return res.redirect("/auth/register");
        }
      }

      // Create user with selected role
      const user = await User.create({
        name,
        email,
        password,
        role: selectedRole,
        enrollment_no,
        department,
        phone,
      });

      // Auto-login after registration
      req.session.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        enrollment_no: user.enrollment_no,
      };

      req.flash("success", "Registration successful! Welcome aboard.");
      return res.redirect("/dashboard");
    } catch (err) {
      console.error("Registration error:", err);
      req.flash("error", "Something went wrong. Please try again.");
      return res.redirect("/auth/register");
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
