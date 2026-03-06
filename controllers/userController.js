const User = require("../models/userModel");
const { validationResult } = require("express-validator");

const userController = {
  // GET /users - List all users
  async index(req, res) {
    try {
      const students = await User.findAll("student");
      const assistants = await User.findAll("assistant");
      const admins = await User.findAll("admin");

      res.render("users/index", {
        title: "Manage Users",
        students,
        assistants,
        admins,
      });
    } catch (err) {
      console.error("Error fetching users:", err);
      req.flash("error", "Failed to fetch users");
      res.redirect("/dashboard");
    }
  },

  // POST /users - Create a new user (admin can create any role)
  async create(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        req.flash("error", errors.array().map((e) => e.msg).join(", "));
        return res.redirect("/users");
      }

      const { name, email, password, role, enrollment_no, department, phone } = req.body;

      // Ensure enrollment/staff ID is provided
      if (!enrollment_no || !enrollment_no.trim()) {
        req.flash("error", "Enrollment / Staff ID is required");
        return res.redirect("/users");
      }

      // Ensure phone is provided
      if (!phone || !phone.trim()) {
        req.flash("error", "Phone number is required");
        return res.redirect("/users");
      }

      // Check if email already exists
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        req.flash("error", "An account with this email already exists");
        return res.redirect("/users");
      }

      // Check if enrollment/staff ID already exists
      if (enrollment_no) {
        const existingEnrollment = await User.findByEnrollment(enrollment_no);
        if (existingEnrollment) {
          req.flash("error", "This enrollment/staff ID is already registered");
          return res.redirect("/users");
        }
      }

      await User.create({
        name,
        email,
        password,
        role: role || "student",
        enrollment_no,
        department,
        phone,
      });

      req.flash("success", `${role.charAt(0).toUpperCase() + role.slice(1)} "${name}" created successfully`);
      res.redirect("/users");
    } catch (err) {
      console.error("Error creating user:", err);
      req.flash("error", "Failed to create user");
      res.redirect("/users");
    }
  },

  // PUT /users/:id - Update user
  async update(req, res) {
    try {
      const { name, email, department, phone, is_active } = req.body;
      await User.update(req.params.id, {
        name,
        email,
        department,
        phone,
        is_active: is_active === "true",
      });
      req.flash("success", "User updated successfully");
      res.redirect("/users");
    } catch (err) {
      console.error("Error updating user:", err);
      req.flash("error", "Failed to update user");
      res.redirect("/users");
    }
  },

  // PUT /users/:id/role - Change user role
  async changeRole(req, res) {
    try {
      const { role } = req.body;
      const allowedRoles = ["student", "assistant", "admin"];
      if (!allowedRoles.includes(role)) {
        req.flash("error", "Invalid role");
        return res.redirect("/users");
      }

      // Prevent admin from changing their own role
      if (parseInt(req.params.id) === req.session.user.id) {
        req.flash("error", "You cannot change your own role");
        return res.redirect("/users");
      }

      const db = require("../config/db");
      await db.query(
        "UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [role, req.params.id]
      );

      req.flash("success", "User role updated successfully");
      res.redirect("/users");
    } catch (err) {
      console.error("Error changing role:", err);
      req.flash("error", "Failed to change user role");
      res.redirect("/users");
    }
  },

  // DELETE /users/:id - Delete user
  async delete(req, res) {
    try {
      // Prevent admin from deleting themselves
      if (parseInt(req.params.id) === req.session.user.id) {
        req.flash("error", "You cannot delete your own account");
        return res.redirect("/users");
      }

      await User.delete(req.params.id);
      req.flash("success", "User deleted successfully");
      res.redirect("/users");
    } catch (err) {
      console.error("Error deleting user:", err);
      req.flash("error", "Failed to delete user");
      res.redirect("/users");
    }
  },
};

module.exports = userController;
