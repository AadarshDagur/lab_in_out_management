const db = require("../config/db");

const LabSession = {
  // Check in a student
  async checkIn({ user_id, lab_id, seat_id, purpose, checked_in_by }) {
    const result = await db.query(
      `INSERT INTO lab_sessions (user_id, lab_id, seat_id, purpose, checked_in_by, status)
       VALUES ($1, $2, $3, $4, $5, 'active') RETURNING *`,
      [user_id, lab_id, seat_id || null, purpose, checked_in_by || null]
    );
    return result.rows[0];
  },

  // Check out a student
  async checkOut(sessionId, checked_out_by = null) {
    const result = await db.query(
      `UPDATE lab_sessions
       SET check_out_time = CURRENT_TIMESTAMP,
           duration_minutes = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - check_in_time)) / 60,
           checked_out_by = $2,
           status = 'completed'
       WHERE id = $1 AND status = 'active' RETURNING *`,
      [sessionId, checked_out_by]
    );
    return result.rows[0];
  },

  // Get active session for a user
  async getActiveSession(userId) {
    const result = await db.query(
      `SELECT ls.*, l.name as lab_name, s.seat_number
       FROM lab_sessions ls
       JOIN labs l ON ls.lab_id = l.id
       LEFT JOIN seats s ON ls.seat_id = s.id
       WHERE ls.user_id = $1 AND ls.status = 'active'
       LIMIT 1`,
      [userId]
    );
    return result.rows[0];
  },

  // Get all active sessions for a lab
  async getActiveSessions(labId) {
    const result = await db.query(
      `SELECT ls.*, u.name as user_name, u.enrollment_no, s.seat_number
       FROM lab_sessions ls
       JOIN users u ON ls.user_id = u.id
       LEFT JOIN seats s ON ls.seat_id = s.id
       WHERE ls.lab_id = $1 AND ls.status = 'active'
       ORDER BY ls.check_in_time DESC`,
      [labId]
    );
    return result.rows;
  },

  // Get all active sessions across all labs
  async getAllActiveSessions() {
    const result = await db.query(
      `SELECT ls.*, u.name as user_name, u.enrollment_no,
              l.name as lab_name, s.seat_number
       FROM lab_sessions ls
       JOIN users u ON ls.user_id = u.id
       JOIN labs l ON ls.lab_id = l.id
       LEFT JOIN seats s ON ls.seat_id = s.id
       WHERE ls.status = 'active'
       ORDER BY ls.check_in_time DESC`
    );
    return result.rows;
  },

  // Get session history for a user
  async getUserHistory(userId, limit = 50) {
    const result = await db.query(
      `SELECT ls.*, l.name as lab_name, s.seat_number
       FROM lab_sessions ls
       JOIN labs l ON ls.lab_id = l.id
       LEFT JOIN seats s ON ls.seat_id = s.id
       WHERE ls.user_id = $1
       ORDER BY ls.check_in_time DESC
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  },

  // Get session history for a lab
  async getLabHistory(labId, limit = 100) {
    const result = await db.query(
      `SELECT ls.*, u.name as user_name, u.enrollment_no, s.seat_number
       FROM lab_sessions ls
       JOIN users u ON ls.user_id = u.id
       LEFT JOIN seats s ON ls.seat_id = s.id
       WHERE ls.lab_id = $1
       ORDER BY ls.check_in_time DESC
       LIMIT $2`,
      [labId, limit]
    );
    return result.rows;
  },

  // Get today's stats
  async getTodayStats() {
    const result = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE DATE(check_in_time) = CURRENT_DATE) as today_total,
        COUNT(*) FILTER (WHERE status = 'active') as currently_active,
        ROUND(AVG(duration_minutes) FILTER (WHERE DATE(check_in_time) = CURRENT_DATE AND status = 'completed'), 1) as avg_duration
      FROM lab_sessions
    `);
    return result.rows[0];
  },

  // Get daily report
  async getDailyReport(date) {
    const result = await db.query(
      `SELECT l.name as lab_name,
        COUNT(*) as total_sessions,
        COUNT(DISTINCT ls.user_id) as unique_students,
        ROUND(AVG(ls.duration_minutes), 1) as avg_duration,
        MAX(ls.duration_minutes) as max_duration
      FROM lab_sessions ls
      JOIN labs l ON ls.lab_id = l.id
      WHERE DATE(ls.check_in_time) = $1
      GROUP BY l.id, l.name
      ORDER BY total_sessions DESC`,
      [date]
    );
    return result.rows;
  },

  // Find by ID
  async findById(id) {
    const result = await db.query(
      `SELECT ls.*, u.name as user_name, l.name as lab_name, s.seat_number
       FROM lab_sessions ls
       JOIN users u ON ls.user_id = u.id
       JOIN labs l ON ls.lab_id = l.id
       LEFT JOIN seats s ON ls.seat_id = s.id
       WHERE ls.id = $1`,
      [id]
    );
    return result.rows[0];
  },

  // Auto-close stale sessions (older than specified hours)
  async autoCloseStale(hours = 12) {
    const result = await db.query(
      `UPDATE lab_sessions
       SET check_out_time = CURRENT_TIMESTAMP,
           duration_minutes = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - check_in_time)) / 60,
           status = 'auto_closed'
       WHERE status = 'active'
         AND check_in_time < CURRENT_TIMESTAMP - INTERVAL '${hours} hours'
       RETURNING *`
    );
    return result.rows;
  },
};

module.exports = LabSession;
