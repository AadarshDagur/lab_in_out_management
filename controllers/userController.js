const User = require("../models/userModel");
const { validationResult } = require("express-validator");
const fs = require("fs");
const path = require("path");

function getUploadedProfileImagePath(file) {
  return file ? `/uploads/users/${file.filename}` : null;
}

function deleteStoredProfileImage(profileImage) {
  if (!profileImage || !profileImage.startsWith("/uploads/users/")) return;
  const imagePath = path.join(__dirname, "..", "public", profileImage.replace(/^\/+/, ""));
  if (fs.existsSync(imagePath)) {
    fs.unlinkSync(imagePath);
  }
}

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
      const profile_image = getUploadedProfileImagePath(req.file);

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
        profile_image,
      });

      req.flash("success", `${role.charAt(0).toUpperCase() + role.slice(1)} "${name}" created successfully`);
      res.redirect("/users");
    } catch (err) {
      console.error("Error creating user:", err);
      if (req.file) {
        deleteStoredProfileImage(getUploadedProfileImagePath(req.file));
      }
      req.flash("error", "Failed to create user");
      res.redirect("/users");
    }
  },

  // PUT /users/:id - Update user
  async update(req, res) {
    try {
      const { name, email, department, phone, is_active, remove_profile_image } = req.body;
      const existingUser = await User.findById(req.params.id);
      if (!existingUser) {
        req.flash("error", "User not found");
        return res.redirect("/users");
      }

      const nextIsActive = is_active === "true";
      if (existingUser.role === "admin" && existingUser.is_active && !nextIsActive) {
        const activeAdminCount = await User.countActiveByRole("admin");
        if (activeAdminCount <= 1) {
          req.flash("error", "The last active admin cannot be deactivated");
          return res.redirect("/users");
        }
      }

      const uploadedProfileImage = getUploadedProfileImagePath(req.file);
      const updatedUser = await User.update(req.params.id, {
        name,
        email,
        department,
        phone,
        is_active: nextIsActive,
        profile_image: uploadedProfileImage,
        clear_profile_image: remove_profile_image === "true",
      });

      if (uploadedProfileImage && existingUser?.profile_image && existingUser.profile_image !== uploadedProfileImage) {
        deleteStoredProfileImage(existingUser.profile_image);
      }

      if (remove_profile_image === "true" && existingUser?.profile_image) {
        deleteStoredProfileImage(existingUser.profile_image);
      }

      if (parseInt(req.params.id, 10) === req.session.user.id && updatedUser) {
        req.session.user = {
          ...req.session.user,
          name: updatedUser.name,
          email: updatedUser.email,
          profile_image: updatedUser.profile_image || null,
        };
      }

      req.flash("success", "User updated successfully");
      res.redirect("/users");
    } catch (err) {
      console.error("Error updating user:", err);
      if (req.file) {
        deleteStoredProfileImage(getUploadedProfileImagePath(req.file));
      }
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

      const targetUser = await User.findById(req.params.id);
      if (!targetUser) {
        req.flash("error", "User not found");
        return res.redirect("/users");
      }

      if (targetUser.role === "admin" && role !== "admin") {
        const adminCount = await User.countByRole("admin");
        if (adminCount <= 1) {
          req.flash("error", "At least one admin account must remain in the system");
          return res.redirect("/users");
        }
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

  async reactivate(req, res) {
    try {
      const userId = parseInt(req.params.id, 10);

      if (!Number.isInteger(userId)) {
        req.flash("error", "Invalid user selected");
        return res.redirect("/users");
      }

      const user = await User.findById(userId);
      if (!user) {
        req.flash("error", "User not found");
        return res.redirect("/users");
      }

      const updatedUser = await User.earlyReactivate(userId);
      req.flash(
        "success",
        `${updatedUser.name} was reactivated and violation count was reset to 0`
      );
      return res.redirect("/users");
    } catch (err) {
      console.error("Error reactivating user:", err);
      req.flash("error", "Failed to reactivate user");
      return res.redirect("/users");
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

      const targetUser = await User.findById(req.params.id);
      if (!targetUser) {
        req.flash("error", "User not found");
        return res.redirect("/users");
      }

      if (targetUser.role === "admin") {
        const adminCount = await User.countByRole("admin");
        if (adminCount <= 1) {
          req.flash("error", "The last remaining admin cannot be deleted");
          return res.redirect("/users");
        }
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
