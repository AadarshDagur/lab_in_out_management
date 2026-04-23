const db = require("../config/db");

const LabSession = {
  // Check in a student
  async checkIn({ user_id, lab_id, checked_in_by }) {
    const result = await db.query(
      `INSERT INTO lab_sessions (user_id, lab_id, checked_in_by, status)
       VALUES ($1, $2, $3, 'active') RETURNING *`,
      [user_id, lab_id, checked_in_by || null]
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

  async checkOutAllForLab(labId, checked_out_by = null) {
    const result = await db.query(
      `UPDATE lab_sessions
       SET check_out_time = CURRENT_TIMESTAMP,
           duration_minutes = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - check_in_time)) / 60,
           checked_out_by = $2,
           status = 'completed'
       WHERE lab_id = $1 AND status = 'active'
       RETURNING *`,
      [labId, checked_out_by]
    );
    return result.rows;
  },

  // Get active session for a user
  async getActiveSession(userId) {
    const result = await db.query(
      `SELECT ls.*, u.name AS user_name, u.profile_image, l.name as lab_name
       FROM lab_sessions ls
       JOIN users u ON ls.user_id = u.id
       JOIN labs l ON ls.lab_id = l.id
       WHERE ls.user_id = $1 AND ls.status = 'active'
       LIMIT 1`,
      [userId]
    );
    return result.rows[0];
  },

  // Get all active sessions for a lab
  async getActiveSessions(labId) {
    const result = await db.query(
      `SELECT ls.*, u.name as user_name, u.enrollment_no, u.profile_image
       FROM lab_sessions ls
       JOIN users u ON ls.user_id = u.id
       WHERE ls.lab_id = $1 AND ls.status = 'active'
       ORDER BY ls.check_in_time DESC`,
      [labId]
    );
    return result.rows;
  },

  // Get all active sessions across all labs
  async getAllActiveSessions() {
    const result = await db.query(
      `SELECT ls.*, u.name as user_name, u.enrollment_no, u.profile_image,
              l.name as lab_name
       FROM lab_sessions ls
       JOIN users u ON ls.user_id = u.id
       JOIN labs l ON ls.lab_id = l.id
       WHERE ls.status = 'active'
       ORDER BY ls.check_in_time DESC`
    );
    return result.rows;
  },

  // Get session history for a user
  async getUserHistory(userId, limit = 50) {
    const result = await db.query(
      `SELECT ls.*, l.name as lab_name
       FROM lab_sessions ls
       JOIN labs l ON ls.lab_id = l.id
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
      `SELECT ls.*, u.name as user_name, u.enrollment_no, u.profile_image
       FROM lab_sessions ls
       JOIN users u ON ls.user_id = u.id
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
      `SELECT ls.*, u.name as user_name, u.profile_image, l.name as lab_name
       FROM lab_sessions ls
       JOIN users u ON ls.user_id = u.id
       JOIN labs l ON ls.lab_id = l.id
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

  async getGlobalStatistics(days = 30) {
    const result = await db.query(
      `SELECT
         COUNT(ls.id) as total_sessions,
         COUNT(DISTINCT ls.user_id) as total_students,
         ROUND(SUM(ls.duration_minutes) / 60, 1) as total_hours
       FROM lab_sessions ls
       WHERE ls.check_in_time >= CURRENT_DATE - INTERVAL '${days} days'
         AND ls.status = 'completed'`
    );
    return result.rows[0];
  },

  async getLabStatistics(days = 30) {
    const result = await db.query(
      `WITH time_events AS (
           SELECT lab_id, check_in_time AS event_time, 1 AS change 
           FROM lab_sessions 
           WHERE check_in_time >= CURRENT_DATE - INTERVAL '${days} days'
           UNION ALL
           SELECT lab_id, COALESCE(check_out_time, CURRENT_TIMESTAMP) AS event_time, -1 AS change 
           FROM lab_sessions 
           WHERE check_in_time >= CURRENT_DATE - INTERVAL '${days} days'
       ),
       running_occupancy AS (
           SELECT lab_id, event_time, SUM(change) OVER (PARTITION BY lab_id ORDER BY event_time) AS current_occupancy
           FROM time_events
       ),
       daily_peaks AS (
           SELECT lab_id, MAX(current_occupancy) AS peak_occupancy, DATE(event_time) AS event_date
           FROM running_occupancy
           GROUP BY lab_id, DATE(event_time)
       )
       SELECT l.id as lab_id, l.name as lab_name, l.capacity,
              COALESCE(COUNT(dp.event_date) FILTER (WHERE dp.peak_occupancy > l.capacity), 0) AS overfill_days,
              COALESCE(ROUND(SUM(ls.duration_minutes) / (NULLIF(COUNT(DISTINCT DATE(ls.check_in_time)), 0) * 10 * 60), 1), 0) AS avg_occupancy
       FROM labs l
       LEFT JOIN daily_peaks dp ON l.id = dp.lab_id
       LEFT JOIN lab_sessions ls ON l.id = ls.lab_id AND ls.check_in_time >= CURRENT_DATE - INTERVAL '${days} days'
       GROUP BY l.id, l.name, l.capacity
       ORDER BY overfill_days DESC, avg_occupancy DESC`
    );
    return result.rows;
  },

  async getLabUtilization(period = "today") {
    let dateFilter;
    switch (period) {
      case "week":
        dateFilter = "check_in_time >= CURRENT_DATE - INTERVAL '7 days'";
        break;
      case "month":
        dateFilter = "check_in_time >= CURRENT_DATE - INTERVAL '30 days'";
        break;
      case "today":
      default:
        dateFilter = "DATE(check_in_time) = CURRENT_DATE";
        break;
    }

    const result = await db.query(`
      SELECT l.name AS lab_name, l.id AS lab_id,
             COUNT(ls.id)::int AS session_count
      FROM labs l
      LEFT JOIN lab_sessions ls ON l.id = ls.lab_id AND ${dateFilter}
      WHERE l.is_active = TRUE
      GROUP BY l.id, l.name
      ORDER BY session_count DESC
    `);
    return result.rows;
  },

  async getBatchUtilization(labId) {
    const result = await db.query(`
      SELECT
        CASE
          WHEN u.enrollment_no ~ '^[0-9]{4}' THEN
            SUBSTRING(u.enrollment_no FROM 1 FOR 4) || ' ' ||
            UPPER(REGEXP_REPLACE(SUBSTRING(u.enrollment_no FROM 5), '[0-9]+$', ''))
          ELSE COALESCE(u.department, 'Unknown')
        END AS batch,
        COUNT(ls.id)::int AS session_count
      FROM lab_sessions ls
      JOIN users u ON ls.user_id = u.id
      WHERE ls.lab_id = $1
        AND ls.check_in_time >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY batch
      ORDER BY session_count DESC
    `, [labId]);
    return result.rows;
  },

  async getHistoricalOverfillStats(period = "today") {
    let dateFilter;
    switch (period) {
      case "week":
        dateFilter = "s1.check_in_time >= CURRENT_DATE - INTERVAL '7 days'";
        break;
      case "month":
        dateFilter = "s1.check_in_time >= CURRENT_DATE - INTERVAL '30 days'";
        break;
      case "today":
      default:
        dateFilter = "DATE(s1.check_in_time) = CURRENT_DATE";
        break;
    }

    const result = await db.query(`
      WITH RecentSessions AS (
        SELECT s1.id AS session_id, s1.lab_id, s1.check_in_time
        FROM lab_sessions s1
        WHERE ${dateFilter}
      ),
      CheckInCounts AS (
        SELECT
          r.lab_id,
          r.session_id,
          (
            SELECT COUNT(*)
            FROM lab_sessions s2
            WHERE s2.lab_id = r.lab_id
              AND s2.check_in_time < r.check_in_time
              AND (s2.check_out_time IS NULL OR s2.check_out_time > r.check_in_time)
          ) AS active_at_checkin
        FROM RecentSessions r
      )
      SELECT
        l.name AS lab_name,
        l.capacity,
        COUNT(c.session_id)::int AS overfill_incidents
      FROM labs l
      LEFT JOIN CheckInCounts c ON l.id = c.lab_id AND c.active_at_checkin >= l.capacity
      WHERE l.is_active = TRUE
      GROUP BY l.id, l.name, l.capacity
      ORDER BY overfill_incidents DESC;
    `);
    return result.rows;
  }
};

module.exports = LabSession;
