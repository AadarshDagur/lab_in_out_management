const db = require("../config/db");

const STAT_PERIODS = {
  working: { windows: [["09:00", "13:00"], ["14:00", "18:00"]], label: "Working Hours" },
  non_working: { windows: [["18:00", "21:00"]], label: "Non-Working Hours" },
};

function resolveStatsPeriod(period) {
  return STAT_PERIODS[period] || STAT_PERIODS.working;
}

function getStatsWindowParams(period) {
  const windows = resolveStatsPeriod(period).windows;
  const first = windows[0] || ["00:00", "00:00"];
  const second = windows[1] || ["00:00", "00:00"];
  return [first[0], first[1], second[0], second[1]];
}

function getLocalTimestamp(timeZone = process.env.TIMEZONE || "Asia/Kolkata") {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (values.hour === "24") values.hour = "00";
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

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



  async getGlobalStatistics(startDate, endDate) {
    const result = await db.query(
      `WITH lab_days AS (
         SELECT l.id, l.capacity, d::date AS service_date,
                d::timestamp AS open_at,
                d::timestamp + INTERVAL '1 day' AS close_at
       FROM labs l
       CROSS JOIN generate_series($1::date, $2::date, INTERVAL '1 day') d
     ),
       availability AS (
         SELECT SUM((EXTRACT(EPOCH FROM (close_at - open_at)) / 60) * capacity) AS capacity_minutes
         FROM lab_days
       ),
       session_overlaps AS (
         SELECT ld.id AS lab_id,
                CASE WHEN ls.id IS NOT NULL THEN
                  GREATEST(
                    0,
                    EXTRACT(EPOCH FROM (
                      LEAST(COALESCE(ls.check_out_time, CURRENT_TIMESTAMP), ld.close_at)
                      - GREATEST(ls.check_in_time, ld.open_at)
                    )) / 60
                  )
                ELSE 0 END AS occupied_minutes,
                ls.id AS session_id,
                ls.user_id
         FROM lab_days ld
         LEFT JOIN lab_sessions ls
           ON ls.lab_id = ld.id
          AND ls.status IN ('active', 'completed')
          AND ls.check_in_time < ld.close_at
          AND COALESCE(ls.check_out_time, CURRENT_TIMESTAMP) > ld.open_at
       )
       SELECT
         COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL) AS total_sessions,
         COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS total_students,
         ROUND(COALESCE(SUM(occupied_minutes), 0) / 60, 1) AS total_hours,
         ROUND(COALESCE(SUM(occupied_minutes), 0), 0) AS occupied_minutes,
         ROUND(COALESCE((SELECT capacity_minutes FROM availability), 0), 0) AS capacity_minutes,
         COALESCE(ROUND((SUM(occupied_minutes) / NULLIF((SELECT capacity_minutes FROM availability), 0)) * 100, 1), 0) AS utilization_percent
       FROM session_overlaps`,
      [startDate, endDate]
    );
    return result.rows[0];
  },

  async getLabStatistics(startDate, endDate) {
    const result = await db.query(
      `WITH time_events AS (
           SELECT lab_id, check_in_time AS event_time, 1 AS change 
           FROM lab_sessions 
           WHERE check_in_time >= $1::date AND check_in_time < ($2::date + INTERVAL '1 day')
           UNION ALL
           SELECT lab_id, COALESCE(check_out_time, CURRENT_TIMESTAMP) AS event_time, -1 AS change 
           FROM lab_sessions 
           WHERE check_in_time >= $1::date AND check_in_time < ($2::date + INTERVAL '1 day')
       ),
       running_occupancy AS (
           SELECT lab_id, event_time, SUM(change) OVER (PARTITION BY lab_id ORDER BY event_time) AS current_occupancy
           FROM time_events
       ),
       daily_peaks AS (
           SELECT lab_id, MAX(current_occupancy) AS peak_occupancy, DATE(event_time) AS event_date
           FROM running_occupancy
           GROUP BY lab_id, DATE(event_time)
       ),
       utilization AS (
         SELECT *
         FROM (
           WITH lab_days AS (
              SELECT l.id, l.name, l.capacity, d::date AS service_date,
                     d::timestamp AS open_at,
                     d::timestamp + INTERVAL '1 day' AS close_at
             FROM labs l
             CROSS JOIN generate_series($1::date, $2::date, INTERVAL '1 day') d
           ),
           availability AS (
             SELECT id AS lab_id,
                    ROUND(SUM(EXTRACT(EPOCH FROM (close_at - open_at)) / 60), 0) AS open_minutes,
                    ROUND(SUM((EXTRACT(EPOCH FROM (close_at - open_at)) / 60) * capacity), 0) AS capacity_minutes
             FROM lab_days
             GROUP BY id
           ),
           occupied AS (
             SELECT ld.id AS lab_id,
                  ROUND(COALESCE(SUM(CASE WHEN ls.id IS NOT NULL THEN GREATEST(
                    0,
                    EXTRACT(EPOCH FROM (
                      LEAST(COALESCE(ls.check_out_time, CURRENT_TIMESTAMP), ld.close_at)
                      - GREATEST(ls.check_in_time, ld.open_at)
                    )) / 60
                  ) ELSE 0 END), 0), 0) AS occupied_minutes,
                  COUNT(DISTINCT ls.id)::int AS total_sessions
           FROM lab_days ld
           LEFT JOIN lab_sessions ls
             ON ls.lab_id = ld.id
            AND ls.status IN ('active', 'completed')
            AND ls.check_in_time < ld.close_at
            AND COALESCE(ls.check_out_time, CURRENT_TIMESTAMP) > ld.open_at
           GROUP BY ld.id
           )
           SELECT a.lab_id,
                  COALESCE(o.occupied_minutes, 0) AS occupied_minutes,
                  COALESCE(o.total_sessions, 0) AS total_sessions,
                  a.open_minutes,
                  a.capacity_minutes
           FROM availability a
           LEFT JOIN occupied o ON o.lab_id = a.lab_id
         ) u
       )
       SELECT l.id as lab_id, l.name as lab_name, l.capacity,
              COALESCE(COUNT(dp.event_date) FILTER (WHERE dp.peak_occupancy > l.capacity), 0) AS overfill_days,
              COALESCE(u.total_sessions, 0) AS total_sessions,
              COALESCE(u.occupied_minutes, 0) AS occupied_minutes,
              COALESCE(u.open_minutes, 0) AS open_minutes,
              COALESCE(ROUND(u.occupied_minutes / NULLIF(u.open_minutes, 0), 1), 0) AS avg_occupancy,
              COALESCE(u.capacity_minutes, 0) AS capacity_minutes,
              COALESCE(ROUND((u.occupied_minutes / NULLIF(u.capacity_minutes, 0)) * 100, 1), 0) AS utilization_percent
       FROM labs l
       LEFT JOIN daily_peaks dp ON l.id = dp.lab_id
       LEFT JOIN utilization u ON u.lab_id = l.id
       GROUP BY l.id, l.name, l.capacity, u.total_sessions, u.occupied_minutes, u.open_minutes, u.capacity_minutes
       ORDER BY utilization_percent DESC, overfill_days DESC`,
      [startDate, endDate]
    );
    return result.rows;
  },

  async getLabUtilization(startDate, endDate, period = "working") {
    const windowParams = getStatsWindowParams(period);
    const result = await db.query(`
      WITH period_windows AS (
        SELECT start_time, end_time
        FROM (VALUES ($3::time, $4::time), ($5::time, $6::time)) AS w(start_time, end_time)
        WHERE start_time < end_time
      ),
      lab_days AS (
        SELECT l.id, l.name, l.capacity, d::date AS service_date,
               d::timestamp + pw.start_time AS open_at,
               d::timestamp + pw.end_time AS close_at
        FROM labs l
        CROSS JOIN generate_series($1::date, $2::date, INTERVAL '1 day') d
        CROSS JOIN period_windows pw
      ),
      availability AS (
        SELECT ld.id AS lab_id,
               ld.name AS lab_name,
               ld.capacity,
               SUM(EXTRACT(EPOCH FROM (ld.close_at - ld.open_at)) / 60) AS open_minutes,
               SUM((EXTRACT(EPOCH FROM (ld.close_at - ld.open_at)) / 60) * ld.capacity) AS capacity_minutes
        FROM lab_days ld
        GROUP BY ld.id, ld.name, ld.capacity
      ),
      occupied AS (
        SELECT ld.id AS lab_id,
               COALESCE(SUM(CASE WHEN ls.id IS NOT NULL THEN GREATEST(
                 0,
                 EXTRACT(EPOCH FROM (
                   LEAST(COALESCE(ls.check_out_time, CURRENT_TIMESTAMP), ld.close_at)
                   - GREATEST(ls.check_in_time, ld.open_at)
                 )) / 60
               ) ELSE 0 END), 0) AS occupied_minutes,
               COUNT(DISTINCT ls.id)::int AS total_sessions
        FROM lab_days ld
        LEFT JOIN lab_sessions ls
          ON ls.lab_id = ld.id
         AND ls.status IN ('active', 'completed')
         AND ls.check_in_time < ld.close_at
         AND COALESCE(ls.check_out_time, CURRENT_TIMESTAMP) > ld.open_at
        GROUP BY ld.id
      )
      SELECT lab_id,
             lab_name,
             capacity,
             COALESCE(total_sessions, 0)::int AS total_sessions,
             ROUND(open_minutes, 0)::int AS open_minutes,
             ROUND(capacity_minutes, 0)::int AS capacity_minutes,
             ROUND(COALESCE(occupied_minutes, 0), 0)::int AS occupied_minutes,
             COALESCE(ROUND((COALESCE(occupied_minutes, 0) / NULLIF(capacity_minutes, 0)) * 100, 1), 0) AS utilization_percent
      FROM availability
      LEFT JOIN occupied USING (lab_id)
      ORDER BY utilization_percent DESC NULLS LAST, occupied_minutes DESC
    `, [startDate, endDate, ...windowParams]);
    return result.rows;
  },

  async getBatchUtilization(labId, startDate, endDate, period = "working") {
    const windowParams = getStatsWindowParams(period);
    const result = await db.query(`
      WITH period_windows AS (
        SELECT start_time, end_time
        FROM (VALUES ($4::time, $5::time), ($6::time, $7::time)) AS w(start_time, end_time)
        WHERE start_time < end_time
      ),
      period_days AS (
        SELECT d::date AS service_date,
               d::timestamp + pw.start_time AS open_at,
               d::timestamp + pw.end_time AS close_at
        FROM generate_series($2::date, $3::date, INTERVAL '1 day') d
        CROSS JOIN period_windows pw
      ),
      session_overlaps AS (
        SELECT
          u.enrollment_no,
          u.department,
          GREATEST(
            0,
            EXTRACT(EPOCH FROM (
              LEAST(COALESCE(ls.check_out_time, CURRENT_TIMESTAMP), pd.close_at)
              - GREATEST(ls.check_in_time, pd.open_at)
            )) / 60
          ) AS session_minutes
        FROM period_days pd
        JOIN lab_sessions ls
          ON ls.lab_id = $1
         AND ls.status IN ('active', 'completed')
         AND ls.check_in_time < pd.close_at
         AND COALESCE(ls.check_out_time, CURRENT_TIMESTAMP) > pd.open_at
        JOIN users u ON ls.user_id = u.id
         WHERE u.enrollment_no ~ '^[0-9]{4}[a-zA-Z]+[0-9]*$'
      )
      SELECT
        UPPER(SUBSTRING(enrollment_no FROM 1 FOR 4) || REGEXP_REPLACE(SUBSTRING(enrollment_no FROM 5), '[0-9]+$', '')) AS batch,
        ROUND(COALESCE(SUM(session_minutes), 0), 0)::int AS session_minutes
      FROM session_overlaps
      GROUP BY batch
      ORDER BY session_minutes DESC
    `, [labId, startDate, endDate, ...windowParams]);
    return result.rows;
  },

  async getHistoricalOverfillStats(startDate, endDate, period = "working") {
    const windowParams = getStatsWindowParams(period);
    const result = await db.query(`
      WITH period_windows AS (
        SELECT start_time, end_time
        FROM (VALUES ($3::time, $4::time), ($5::time, $6::time)) AS w(start_time, end_time)
        WHERE start_time < end_time
      ),
      RecentSessions AS (
        SELECT s1.id AS session_id, s1.lab_id, s1.check_in_time
        FROM lab_sessions s1
        WHERE s1.check_in_time >= $1::date AND s1.check_in_time < ($2::date + INTERVAL '1 day')
          AND EXISTS (
            SELECT 1
            FROM period_windows pw
            WHERE s1.check_in_time::time >= pw.start_time
              AND s1.check_in_time::time < pw.end_time
          )
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
      GROUP BY l.id, l.name, l.capacity
      ORDER BY overfill_incidents DESC;
    `, [startDate, endDate, ...windowParams]);
    return result.rows;
  },

  // Get visit counts per lab for a user (for most-visited ordering)
  async getVisitCountsByUser(userId) {
    const result = await db.query(`
      SELECT lab_id, COUNT(*)::int AS visit_count
      FROM (
        SELECT lab_id
        FROM lab_sessions
        WHERE user_id = $1
        ORDER BY check_in_time DESC
        LIMIT 100
      ) recent_visits
      GROUP BY lab_id
      ORDER BY visit_count DESC
    `, [userId]);
    return result.rows;
  },
};

module.exports = LabSession;
