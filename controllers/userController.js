const User = require("../models/userModel");
const AuditLog = require("../models/auditLogModel");
const Settings = require("../models/settingsModel");
const { validationResult } = require("express-validator");
const { saveProfileImage, deleteProfileImage } = require("../services/storageService");

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

const userController = {
  // GET /users - List all users
  async index(req, res) {
    try {
      const students = await User.findAll("student");
      const assistants = await User.findAll("assistant");
      const admins = await User.findAll("admin");
      const departments = await Settings.getDepartments();

      const bulkResults = req.session?.bulkResults || null;
      delete req.session?.bulkResults;

      res.render("users/index", {
        title: "Manage Users",
        students,
        assistants,
        admins,
        bulkResults,
        departments,
      });
    } catch (err) {
      console.error("Error fetching users:", err);
      req.flash("error", "Failed to fetch users");
      res.redirect("/dashboard");
    }
  },

  // POST /users - Create a new user (admin can create any role)
  async create(req, res) {
    let profileImage = null;
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        req.flash("error", errors.array().map((e) => e.msg).join(", "));
        return res.redirect("/users");
      }

      const { name, email, password, role, enrollment_no, department, phone } = req.body;
      if (!User.isIitrprEmail(email)) {
        req.flash("error", "Email must be an @iitrpr.ac.in address");
        return res.redirect("/users");
      }

      const allowedDepartments = await Settings.getDepartments();
      if (!allowedDepartments.includes(department)) {
        req.flash("error", "Please select a valid department");
        return res.redirect("/users");
      }

      if (!enrollment_no || !enrollment_no.trim()) {
        req.flash("error", "Enrollment / Staff ID is required");
        return res.redirect("/users");
      }

      if (!phone || !phone.trim()) {
        req.flash("error", "Phone number is required");
        return res.redirect("/users");
      }
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        req.flash("error", "An account with this email already exists");
        return res.redirect("/users");
      }

      if (enrollment_no) {
        const existingEnrollment = await User.findByEnrollment(enrollment_no);
        if (existingEnrollment) {
          req.flash("error", "This enrollment/staff ID is already registered");
          return res.redirect("/users");
        }
      }

      profileImage = await saveProfileImage(req.file);

      const createdUser = await User.create({
        name,
        email,
        password,
        role: role || "student",
        enrollment_no,
        department,
        phone,
        profile_image: profileImage,
      });

      await AuditLog.log({
        userId: req.session.user.id,
        userName: req.session.user.name,
        action: "CREATE_USER",
        targetType: "user",
        targetId: createdUser.id,
        details: `Admin added ${name} as ${role || "student"}`,
        ipAddress: req.ip,
      });

      req.flash("success", `User "${name}" created successfully`);
      res.redirect("/users");
    } catch (err) {
      console.error("Error creating user:", err);
      if (profileImage) {
        await deleteProfileImage(profileImage);
      }
      req.flash("error", "Failed to create user");
      res.redirect("/users");
    }
  },

  // PUT /users/:id - Update user
  async update(req, res) {
    let uploadedProfileImage = null;
    try {
      const { name, email, department, phone, is_active, remove_profile_image, enrollment_no, can_view_statistics } = req.body;
      const existingUser = await User.findById(req.params.id);
      if (!existingUser) {
        req.flash("error", "User not found");
        return res.redirect("/users");
      }

      if (email && !User.isIitrprEmail(email)) {
        req.flash("error", "Email must be an @iitrpr.ac.in address");
        return res.redirect("/users");
      }

      const allowedDepartments = await Settings.getDepartments();
      if (department && department !== existingUser.department && !allowedDepartments.includes(department)) {
        req.flash("error", "Please select a valid department");
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

      uploadedProfileImage = await saveProfileImage(req.file);
      const updatedUser = await User.update(req.params.id, {
        name,
        email,
        department,
        phone,
        is_active: nextIsActive,
        profile_image: uploadedProfileImage,
        clear_profile_image: remove_profile_image === "true",
        enrollment_no,
        can_view_statistics: can_view_statistics === "on", // HTML checkbox
      });

      if (uploadedProfileImage && existingUser?.profile_image && existingUser.profile_image !== uploadedProfileImage) {
        await deleteProfileImage(existingUser.profile_image);
      }

      if (remove_profile_image === "true" && existingUser?.profile_image) {
        await deleteProfileImage(existingUser.profile_image);
      }

      if (parseInt(req.params.id, 10) === req.session.user.id && updatedUser) {
        req.session.user = {
          ...req.session.user,
          name: updatedUser.name,
          email: updatedUser.email,
          profile_image: updatedUser.profile_image || null,
          can_view_statistics: updatedUser.can_view_statistics,
        };
      }

      await AuditLog.log({
        userId: req.session.user.id,
        userName: req.session.user.name,
        action: "UPDATE_USER",
        targetType: "user",
        targetId: updatedUser.id,
        details: `Updated details for ${updatedUser.name}`,
        ipAddress: req.ip,
      });

      req.flash("success", "User updated successfully");
      res.redirect("/users");
    } catch (err) {
      console.error("Error updating user:", err);
      if (uploadedProfileImage) {
        await deleteProfileImage(uploadedProfileImage);
      }
      
      if (err.code === "23505" && err.constraint === "users_enrollment_no_key") {
        req.flash("error", "Failed to update: That Enrollment/Staff ID is already in use by another user.");
      } else if (err.code === "23505" && err.constraint === "users_email_key") {
        req.flash("error", "Failed to update: That email is already in use.");
      } else {
        req.flash("error", "Failed to update user");
      }
      res.redirect("/users");
    }
  },

  // PUT /users/:id/role - Change user role
  async changeRole(req, res) {
    try {
      const { role } = req.body;
      const allowedRoles = ["student", "assistant", "admin", "student+assistant"];
      if (!allowedRoles.includes(role)) {
        req.flash("error", "Invalid role");
        return res.redirect("/users");
      }

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

      await AuditLog.log({
        userId: req.session.user.id,
        userName: req.session.user.name,
        action: "CHANGE_ROLE",
        targetType: "user",
        targetId: targetUser.id,
        details: `Admin changed ${targetUser.name} (ID: ${targetUser.id}) from ${targetUser.role} to ${role}`,
        ipAddress: req.ip,
      });

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

      await AuditLog.log({
        userId: req.session.user.id,
        userName: req.session.user.name,
        action: "REACTIVATE_USER",
        targetType: "user",
        targetId: updatedUser.id,
        details: `Early reactivated ${updatedUser.name} and locked their previous violations`,
        ipAddress: req.ip,
      });

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

  // POST /users/bulk-upload — process CSV
  async bulkUpload(req, res) {
    try {
      if (!req.file) {
        req.flash("error", "Please select a CSV file to upload");
        return res.redirect("/users");
      }

      const csvContent = req.file.buffer.toString("utf-8");
      const lines = csvContent.split(/\r?\n/).filter((line) => line.trim());

      if (lines.length < 2) {
        req.flash("error", "CSV file must have a header row and at least one data row");
        return res.redirect("/users");
      }

      const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/^["']|["']$/g, ""));
      const requiredCols = ["name", "email", "password", "role", "enrollment_no", "department"];
      const missingCols = requiredCols.filter((c) => !header.includes(c));
      if (missingCols.length > 0) {
        req.flash("error", `CSV is missing required columns: ${missingCols.join(", ")}`);
        return res.redirect("/users");
      }

      const users = [];
      let skipped = 0;
      const allowedDepartments = await Settings.getDepartments();
      const allowedDepartmentSet = new Set(allowedDepartments.map((department) => department.toLowerCase()));
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length === 0 || values.every((v) => !v.trim())) {
          skipped++;
          continue;
        }

        const row = {};
        header.forEach((col, idx) => {
          row[col] = values[idx] ? values[idx].trim().replace(/^["']|["']$/g, "") : "";
        });
        
        if (!["admin", "assistant", "student", "student+assistant"].includes(row.role.toLowerCase())) {
          row.role = "student"; 
        } else {
          row.role = row.role.toLowerCase();
        }

        const normalizedDepartment = allowedDepartments.find(
          (department) => department.toLowerCase() === String(row.department || "").toLowerCase()
        );
        if (!row.department || !allowedDepartmentSet.has(row.department.toLowerCase())) {
          skipped++;
          continue;
        }
        row.department = normalizedDepartment;
        
        users.push(row);
      }

      if (users.length === 0) {
        req.flash("error", "No valid data rows found in CSV");
        return res.redirect("/users");
      }

      const results = await User.bulkCreate(users);
      results.skipped = skipped;

      await AuditLog.log({
        userId: req.session.user.id,
        userName: req.session.user.name,
        action: "BULK_UPLOAD",
        targetType: "system",
        targetId: null,
        details: `Admin added ${results.created.length} users by CSV import; ${results.errors.length} rows failed`,
        ipAddress: req.ip,
      });

      req.session.bulkResults = results;
      req.flash("success", `Processed CSV file. Total processed: ${users.length}`);
      res.redirect("/users");
    } catch (err) {
      console.error("Bulk upload error:", err);
      req.flash("error", "Failed to process CSV file");
      res.redirect("/users");
    }
  },

  // GET /users/bulk-upload/template — download CSV template
  async downloadTemplate(req, res) {
    const departments = await Settings.getDepartments();
    const firstDepartment = departments[0] || "Computer Science";
    const secondDepartment = departments[1] || firstDepartment;
    const template = `name,email,password,role,enrollment_no,department,phone
Aarav Sharma,aarav@iitrpr.ac.in,Pass@123,student,2023CSB1001,${firstDepartment},9876543210
Priya Singh,priya@iitrpr.ac.in,Pass@456,student+assistant,2023EEB1002,${secondDepartment},9876543211
`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=users_template.csv");
    res.send(template);
  },

  // DELETE /users/:id - Delete user
  async delete(req, res) {
    try {
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

      await deleteProfileImage(targetUser.profile_image);
      await User.delete(req.params.id);

      await AuditLog.log({
        userId: req.session.user.id,
        userName: req.session.user.name,
        action: "DELETE_USER",
        targetType: "user",
        targetId: req.params.id,
        details: `Deleted user ${targetUser.name}`,
        ipAddress: req.ip,
      });

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
