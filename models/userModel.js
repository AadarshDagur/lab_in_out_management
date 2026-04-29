const db = require("../config/db");
const bcrypt = require("bcrypt");

const SALT_ROUNDS = 10;
const IITRPR_EMAIL_REGEX = /^[^\s@]+@iitrpr\.ac\.in$/i;

const User = {
  isIitrprEmail(email) {
    return IITRPR_EMAIL_REGEX.test(String(email || "").trim());
  },

  // Helper to auto-reactivate if suspension expired
  async checkAndReactivate(user) {
    if (user && user.suspended_until && new Date() >= new Date(user.suspended_until)) {
      const result = await db.query(
        `UPDATE users SET is_active = TRUE, suspended_until = NULL, violation_count = 0 WHERE id = $1 RETURNING *`,
        [user.id]
      );
      return result.rows[0];
    }
    return user;
  },
  // Find user by email
  async findByEmail(email) {
    const result = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    return await this.checkAndReactivate(result.rows[0]);
  },

  // Find user by ID
  async findById(id) {
    const result = await db.query("SELECT * FROM users WHERE id = $1", [id]);
    return await this.checkAndReactivate(result.rows[0]);
  },

  // Find user by enrollment number
  async findByEnrollment(enrollment_no) {
    const result = await db.query(
      "SELECT * FROM users WHERE enrollment_no = $1",
      [enrollment_no]
    );
    return await this.checkAndReactivate(result.rows[0]);
  },

  // Create new user
  async create({ name, email, password, role, enrollment_no, department, phone, profile_image }) {
    if (!this.isIitrprEmail(email)) {
      throw new Error("Email must be an @iitrpr.ac.in address");
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await db.query(
      `INSERT INTO users (name, email, password_hash, role, enrollment_no, department, phone, profile_image)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [name, email, password_hash, role || "student", enrollment_no, department, phone, profile_image || null]
    );
    return result.rows[0];
  },

  // Verify password
  async verifyPassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  },

  // Update user
  async update(id, fields) {
    const { name, email, department, phone, is_active, profile_image, clear_profile_image, enrollment_no, can_view_statistics } = fields;
    if (email && !this.isIitrprEmail(email)) {
      throw new Error("Email must be an @iitrpr.ac.in address");
    }

    const result = await db.query(
      `UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email),
       department = COALESCE($3, department), phone = COALESCE($4, phone),
       is_active = COALESCE($5, is_active),
       profile_image = CASE
         WHEN $6::boolean = TRUE THEN NULL
         WHEN $7::text IS NOT NULL THEN $7::text
         ELSE profile_image
       END,
       enrollment_no = COALESCE($8, enrollment_no),
       can_view_statistics = COALESCE($9, can_view_statistics),
       updated_at = CURRENT_TIMESTAMP
       WHERE id = $10 RETURNING *`,
      [name, email, department, phone, is_active, Boolean(clear_profile_image), profile_image || null, enrollment_no, can_view_statistics, id]
    );
    return result.rows[0];
  },

  // Get all users (with optional role filter)
  async findAll(role = null) {
    let query =
      "SELECT id, name, email, role, enrollment_no, department, phone, is_active, violation_count, profile_image, can_view_statistics, created_at, suspended_until FROM users";
    const params = [];
    if (role) {
      // For 'student' filter, also include 'student+assistant'
      if (role === "student") {
        query += " WHERE role IN ('student', 'student+assistant')";
      } else if (role === "assistant") {
        query += " WHERE role IN ('assistant', 'student+assistant')";
      } else {
        query += " WHERE role = $1";
        params.push(role);
      }
    }
    query += " ORDER BY created_at DESC";
    const result = await db.query(query, params);
    return result.rows;
  },

  async countByRole(role) {
    let query;
    const params = [];
    if (role === "student") {
      query = "SELECT COUNT(*)::int AS total FROM users WHERE role IN ('student', 'student+assistant')";
    } else if (role === "assistant") {
      query = "SELECT COUNT(*)::int AS total FROM users WHERE role IN ('assistant', 'student+assistant')";
    } else {
      query = "SELECT COUNT(*)::int AS total FROM users WHERE role = $1";
      params.push(role);
    }
    const result = await db.query(query, params);
    return result.rows[0]?.total || 0;
  },

  async countActiveByRole(role) {
    let query;
    const params = [];
    if (role === "student") {
      query = "SELECT COUNT(*)::int AS total FROM users WHERE role IN ('student', 'student+assistant') AND is_active = TRUE";
    } else if (role === "assistant") {
      query = "SELECT COUNT(*)::int AS total FROM users WHERE role IN ('assistant', 'student+assistant') AND is_active = TRUE";
    } else {
      query = "SELECT COUNT(*)::int AS total FROM users WHERE role = $1 AND is_active = TRUE";
      params.push(role);
    }
    const result = await db.query(query, params);
    return result.rows[0]?.total || 0;
  },

  // Change password
  async changePassword(id, newPassword) {
    const password_hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await db.query(
      "UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [password_hash, id]
    );
  },

  // Delete user
  async delete(id) {
    await db.query("DELETE FROM users WHERE id = $1", [id]);
  },

  async findStudentDirectory() {
    const result = await db.query(
      `SELECT id, name, email, enrollment_no, department, violation_count, is_active, profile_image, suspended_until
       FROM users
       WHERE role IN ('student', 'student+assistant')
       ORDER BY violation_count DESC, name ASC`
    );
    return result.rows;
  },

  async findStudentForViolation(identifier) {
    const result = await db.query(
      `SELECT id, name, enrollment_no, email, violation_count
       FROM users
       WHERE role IN ('student', 'student+assistant')
         AND is_active = TRUE
         AND (
           LOWER(enrollment_no) = LOWER($1)
           OR LOWER(email) = LOWER($1)
         )
       LIMIT 1`,
      [identifier]
    );
    return await this.checkAndReactivate(result.rows[0]);
  },

  async suspendUser(id, days) {
    const result = await db.query(
      `UPDATE users SET is_active = FALSE, suspended_until = CURRENT_TIMESTAMP + ($1 || ' days')::INTERVAL WHERE id = $2 RETURNING *`,
      [days, id]
    );
    return result.rows[0];
  },

  async earlyReactivate(id) {
    // Lock all existing violations before resetting count
    await db.query(
      `UPDATE violation_logs SET locked = TRUE WHERE user_id = $1 AND locked = FALSE`,
      [id]
    );
    const result = await db.query(
      `UPDATE users SET is_active = TRUE, suspended_until = NULL, violation_count = 0 WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0];
  },

  async liftSuspension(id) {
    const result = await db.query(
      `UPDATE users SET is_active = TRUE, suspended_until = NULL WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0];
  },

  async bulkCreate(users) {
    const created = [];
    const errors = [];

    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      const rowNum = i + 2; // +2 because row 1 is header, data starts at row 2
      try {
        if (!u.name || !u.name.trim()) {
          errors.push({ row: rowNum, name: u.name, email: u.email, reason: "Name is required" });
          continue;
        }
        if (!u.email || !u.email.trim()) {
          errors.push({ row: rowNum, name: u.name, email: u.email, reason: "Email is required" });
          continue;
        }
        if (!this.isIitrprEmail(u.email)) {
          errors.push({ row: rowNum, name: u.name, email: u.email, reason: "Email must be an @iitrpr.ac.in address" });
          continue;
        }
        if (!u.password || u.password.length < 6) {
          errors.push({ row: rowNum, name: u.name, email: u.email, reason: "Password must be at least 6 characters" });
          continue;
        }
        if (!u.enrollment_no || !u.enrollment_no.trim()) {
          errors.push({ row: rowNum, name: u.name, email: u.email, reason: "Enrollment/Staff ID is required" });
          continue;
        }

        const existingEmail = await this.findByEmail(u.email.trim());
        if (existingEmail) {
          errors.push({ row: rowNum, name: u.name, email: u.email, reason: "Email already exists" });
          continue;
        }

        const existingEnrollment = await this.findByEnrollment(u.enrollment_no.trim());
        if (existingEnrollment) {
          errors.push({ row: rowNum, name: u.name, email: u.email, reason: "Enrollment/Staff ID already exists" });
          continue;
        }

        const validRoles = ["student", "assistant", "admin", "student+assistant"];
        const role = validRoles.includes(u.role) ? u.role : "student";

        const password_hash = await bcrypt.hash(u.password, SALT_ROUNDS);
        const result = await db.query(
          `INSERT INTO users (name, email, password_hash, role, enrollment_no, department, phone)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [u.name.trim(), u.email.trim(), password_hash, role, u.enrollment_no.trim(), u.department || null, u.phone || null]
        );
        created.push(result.rows[0]);
      } catch (err) {
        errors.push({ row: rowNum, name: u.name, email: u.email, reason: err.message || "Unknown error" });
      }
    }

    return { created, errors };
  },
};

module.exports = User;
