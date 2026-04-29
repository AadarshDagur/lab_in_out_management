const User = require("../models/userModel");
const LabSession = require("../models/sessionModel");
const Settings = require("../models/settingsModel");
const bcrypt = require("bcrypt");
const { saveProfileImage, deleteProfileImage } = require("../services/storageService");

const profileController = {
  async show(req, res) {
    try {
      const user = await User.findById(req.session.user.id);
      if (!user) {
        req.flash("error", "User not found");
        return res.redirect("/dashboard");
      }

      const recentSessions = await LabSession.getUserHistory(user.id, 5);
      const departments = await Settings.getDepartments();

      res.render("profile/index", {
        title: "My Profile",
        profileUser: user,
        recentSessions,
        departments,
      });
    } catch (err) {
      console.error("Profile page error:", err);
      req.flash("error", "Failed to load profile");
      res.redirect("/dashboard");
    }
  },

  async update(req, res) {
    let uploadedProfileImage = null;
    try {
      const role = req.session.user.role;
      const userId = req.session.user.id;
      const existingUser = await User.findById(userId);

      if (!existingUser) {
        req.flash("error", "User not found");
        return res.redirect("/profile");
      }

      uploadedProfileImage = await saveProfileImage(req.file);

      const updateFields = {};

      // Everyone can update profile image
      if (uploadedProfileImage) {
        updateFields.profile_image = uploadedProfileImage;
      }
      if (req.body.remove_profile_image === "true") {
        updateFields.clear_profile_image = true;
      }

      // Assistants can edit only contact details; admin manages identity fields.
      if (role === "assistant" || role === "admin") {
        if (req.body.phone !== undefined) {
          updateFields.phone = req.body.phone.trim();
        }
      }

      if (role === "admin") {
        if (req.body.name && req.body.name.trim()) {
          updateFields.name = req.body.name.trim();
        }
        if (req.body.department) {
          const departments = await Settings.getDepartments();
          if (req.body.department !== existingUser.department && !departments.includes(req.body.department)) {
            req.flash("error", "Please select a valid department");
            return res.redirect("/profile");
          }
          updateFields.department = req.body.department;
        }
      }

      // Admin can also edit email
      if (role === "admin") {
        if (req.body.email && req.body.email.trim()) {
          if (!User.isIitrprEmail(req.body.email)) {
            req.flash("error", "Email must be an @iitrpr.ac.in address");
            return res.redirect("/profile");
          }

          // Verify not already taken
          const existingEmail = await User.findByEmail(req.body.email.trim());
          if (existingEmail && existingEmail.id !== userId) {
            req.flash("error", "This email is already in use");
            return res.redirect("/profile");
          }
          updateFields.email = req.body.email.trim();
        }
      }

      // Admin can change password
      if (role === "admin" && req.body.new_password && req.body.new_password.length >= 6) {
        await User.changePassword(userId, req.body.new_password);
      }

      // Students: only image fields are populated, everything else stays untouched
      updateFields.is_active = existingUser.is_active;

      const updatedUser = await User.update(userId, updateFields);

      // Clean up old profile image if replaced
      if (uploadedProfileImage && existingUser.profile_image && existingUser.profile_image !== uploadedProfileImage) {
        await deleteProfileImage(existingUser.profile_image);
      }
      if (req.body.remove_profile_image === "true" && existingUser.profile_image) {
        await deleteProfileImage(existingUser.profile_image);
      }

      // Update session data
      if (updatedUser) {
        req.session.user = {
          ...req.session.user,
          name: updatedUser.name,
          email: updatedUser.email,
          profile_image: updatedUser.profile_image || null,
        };
      }

      req.flash("success", "Profile updated successfully");
      res.redirect("/profile");
    } catch (err) {
      console.error("Profile update error:", err);
      if (uploadedProfileImage) {
        await deleteProfileImage(uploadedProfileImage);
      }
      req.flash("error", "Failed to update profile");
      res.redirect("/profile");
    }
  },
};

module.exports = profileController;
