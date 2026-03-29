const db = require("../config/db");
const bcrypt = require("bcrypt");

const SALT_ROUNDS = 10;

const User = {
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
    const { name, email, department, phone, is_active, profile_image, clear_profile_image } = fields;
    const result = await db.query(
      `UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email),
       department = COALESCE($3, department), phone = COALESCE($4, phone),
       is_active = COALESCE($5, is_active),
       profile_image = CASE
         WHEN $6::boolean = TRUE THEN NULL
         WHEN $7::text IS NOT NULL THEN $7::text
         ELSE profile_image
       END,
       updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 RETURNING *`,
      [name, email, department, phone, is_active, Boolean(clear_profile_image), profile_image || null, id]
    );
    return result.rows[0];
  },

  // Get all users (with optional role filter)
  async findAll(role = null) {
    let query =
      "SELECT id, name, email, role, enrollment_no, department, phone, is_active, violation_count, profile_image, created_at, suspended_until FROM users";
    const params = [];
    if (role) {
      query += " WHERE role = $1";
      params.push(role);
    }
    query += " ORDER BY created_at DESC";
    const result = await db.query(query, params);
    return result.rows;
  },

  async countByRole(role) {
    const result = await db.query(
      "SELECT COUNT(*)::int AS total FROM users WHERE role = $1",
      [role]
    );
    return result.rows[0]?.total || 0;
  },

  async countActiveByRole(role) {
    const result = await db.query(
      "SELECT COUNT(*)::int AS total FROM users WHERE role = $1 AND is_active = TRUE",
      [role]
    );
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
       WHERE role = 'student'
       ORDER BY violation_count DESC, name ASC`
    );
    return result.rows;
  },

  async findStudentForViolation(identifier) {
    const result = await db.query(
      `SELECT id, name, enrollment_no, email, violation_count
       FROM users
       WHERE role = 'student'
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
    const result = await db.query(
      `UPDATE users SET is_active = TRUE, suspended_until = NULL, violation_count = 0 WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0];
  },
};

module.exports = User;
