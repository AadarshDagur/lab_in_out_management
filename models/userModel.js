const db = require("../config/db");
const bcrypt = require("bcrypt");

const SALT_ROUNDS = 10;

const User = {
  // Find user by email
  async findByEmail(email) {
    const result = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    return result.rows[0];
  },

  // Find user by ID
  async findById(id) {
    const result = await db.query("SELECT * FROM users WHERE id = $1", [id]);
    return result.rows[0];
  },

  // Find user by enrollment number
  async findByEnrollment(enrollment_no) {
    const result = await db.query(
      "SELECT * FROM users WHERE enrollment_no = $1",
      [enrollment_no]
    );
    return result.rows[0];
  },

  // Create new user
  async create({ name, email, password, role, enrollment_no, department, phone }) {
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await db.query(
      `INSERT INTO users (name, email, password_hash, role, enrollment_no, department, phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, email, password_hash, role || "student", enrollment_no, department, phone]
    );
    return result.rows[0];
  },

  // Verify password
  async verifyPassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  },

  // Update user
  async update(id, fields) {
    const { name, email, department, phone, is_active } = fields;
    const result = await db.query(
      `UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email),
       department = COALESCE($3, department), phone = COALESCE($4, phone),
       is_active = COALESCE($5, is_active), updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 RETURNING *`,
      [name, email, department, phone, is_active, id]
    );
    return result.rows[0];
  },

  // Get all users (with optional role filter)
  async findAll(role = null) {
    let query = "SELECT id, name, email, role, enrollment_no, department, phone, is_active, created_at FROM users";
    const params = [];
    if (role) {
      query += " WHERE role = $1";
      params.push(role);
    }
    query += " ORDER BY created_at DESC";
    const result = await db.query(query, params);
    return result.rows;
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
};

module.exports = User;
