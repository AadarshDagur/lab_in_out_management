const db = require("../config/db");

const Lab = {
  async findAll(activeOnly = true) {
    let query = "SELECT * FROM labs";
    if (activeOnly) query += " WHERE is_active = TRUE";
    query += " ORDER BY name ASC";
    const result = await db.query(query);
    return result.rows;
  },

  async findById(id) {
    const result = await db.query("SELECT * FROM labs WHERE id = $1", [id]);
    return result.rows[0];
  },

  async create({ name, location, capacity, open_time, close_time }) {
    const result = await db.query(
      `INSERT INTO labs (name, location, capacity, open_time, close_time)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        name,
        location,
        capacity || 30,
        open_time || "08:00",
        close_time || "18:00",
      ]
    );
    return result.rows[0];
  },

  async update(id, { name, location, capacity, open_time, close_time, is_active, manual_inactive }) {
    const result = await db.query(
      `UPDATE labs SET name = COALESCE($1, name), location = COALESCE($2, location),
       capacity = COALESCE($3, capacity), open_time = COALESCE($4, open_time),
       close_time = COALESCE($5, close_time), is_active = COALESCE($6, is_active),
       manual_inactive = COALESCE($7, manual_inactive),
       updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 RETURNING *`,
      [name, location, capacity, open_time, close_time, is_active, manual_inactive, id]
    );
    return result.rows[0];
  },

  async delete(id) {
    await db.query("DELETE FROM labs WHERE id = $1", [id]);
  },

  async getOccupancy(labId) {
    const result = await db.query(
      `SELECT COUNT(*) AS current_count
       FROM lab_sessions
       WHERE lab_id = $1 AND status = 'active'`,
      [labId]
    );
    return parseInt(result.rows[0].current_count);
  },

  async findAllWithOccupancy() {
    const result = await db.query(`
      SELECT l.*,
        COALESCE(s.active_count, 0) AS current_occupancy
      FROM labs l
      LEFT JOIN (
        SELECT lab_id, COUNT(*) AS active_count
        FROM lab_sessions
        WHERE status = 'active'
        GROUP BY lab_id
      ) s ON l.id = s.lab_id
      WHERE l.is_active = TRUE
      ORDER BY l.name ASC
    `);
    return result.rows;
  },

  async autoCloseAfterHours() {
    try {
      const tz = process.env.TIMEZONE || 'Asia/Kolkata';
      const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      });
      const localTime = formatter.format(new Date());

      const result = await db.query(
        `WITH ClosedLabs AS (
           UPDATE labs
           SET is_active = FALSE
           WHERE is_active = TRUE
             AND NOT (
               CASE
                 WHEN open_time < close_time
                   THEN open_time <= $1::time AND $1::time < close_time
                 WHEN open_time > close_time
                   THEN open_time <= $1::time OR $1::time < close_time
                 ELSE TRUE
               END
             )
           RETURNING id, name
         ),
         ClosedSessions AS (
           UPDATE lab_sessions ls
           SET check_out_time = CURRENT_TIMESTAMP,
               status = 'auto_closed',
               duration_minutes = ROUND(CAST(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ls.check_in_time)) / 60 AS NUMERIC))
           FROM ClosedLabs cl
           WHERE ls.lab_id = cl.id AND ls.status = 'active'
           RETURNING ls.id
         )
         SELECT id, name FROM ClosedLabs;`,
        [localTime]
      );
      
      return result.rows;
    } catch (e) {
      console.error("Auto Close After Hours Error:", e);
      return [];
    }
  },

  async autoOpenDuringHours() {
    try {
      const tz = process.env.TIMEZONE || 'Asia/Kolkata';
      const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      });
      const localTime = formatter.format(new Date());

      const result = await db.query(
        `UPDATE labs
         SET is_active = TRUE
         WHERE is_active = FALSE
           AND COALESCE(manual_inactive, FALSE) = FALSE
           AND (
             CASE
               WHEN open_time < close_time
                 THEN open_time <= $1::time AND $1::time < close_time
               WHEN open_time > close_time
                 THEN open_time <= $1::time OR $1::time < close_time
               ELSE TRUE
             END
           )
         RETURNING id, name;`,
        [localTime]
      );
      
      return result.rows;
    } catch (e) {
      console.error("Auto Open During Hours Error:", e);
      return [];
    }
  },
};

module.exports = Lab;
