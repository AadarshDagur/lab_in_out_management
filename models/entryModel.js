const db = require("../config/db");

const Entry = {
  async markViolation({ userId, labId, markedBy, note }) {
    await db.query(
      `INSERT INTO violation_logs (user_id, lab_id, marked_by, note)
       VALUES ($1, $2, $3, $4)`,
      [userId, labId, markedBy || null, note || null]
    );

    const result = await db.query(
      `UPDATE users
       SET violation_count = violation_count + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, name, violation_count`,
      [userId]
    );

    return result.rows[0];
  },

  async removeViolation(violationId) {
    const violation = await db.query(
      `SELECT * FROM violation_logs WHERE id = $1`,
      [violationId]
    );

    if (!violation.rows[0]) return null;

    const userId = violation.rows[0].user_id;

    await db.query(`DELETE FROM violation_logs WHERE id = $1`, [violationId]);

    const result = await db.query(
      `UPDATE users
       SET violation_count = GREATEST(violation_count - 1, 0),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, name, violation_count`,
      [userId]
    );

    return result.rows[0];
  },

  async getRecentViolations(limit = 20) {
    const result = await db.query(
      `SELECT dl.id, dl.note, dl.created_at, dl.user_id,
              u.name AS user_name, u.enrollment_no, u.violation_count,
              l.name AS lab_name,
              m.name AS marked_by_name
       FROM violation_logs dl
       JOIN users u ON dl.user_id = u.id
       JOIN labs l ON dl.lab_id = l.id
       LEFT JOIN users m ON dl.marked_by = m.id
       ORDER BY dl.created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  },

  async getViolationsByAssistant(assistantId, limit = 20) {
    const result = await db.query(
      `SELECT dl.id, dl.note, dl.created_at, dl.user_id,
              u.name AS user_name, u.enrollment_no, u.violation_count,
              l.name AS lab_name,
              m.name AS marked_by_name
       FROM violation_logs dl
       JOIN users u ON dl.user_id = u.id
       JOIN labs l ON dl.lab_id = l.id
       LEFT JOIN users m ON dl.marked_by = m.id
       WHERE dl.marked_by = $1
       ORDER BY dl.created_at DESC
       LIMIT $2`,
      [assistantId, limit]
    );
    return result.rows;
  },

  async getUserViolations(userId) {
    const result = await db.query(
      `SELECT dl.id, dl.note, dl.created_at,
              l.name AS lab_name,
              m.name AS marked_by_name
       FROM violation_logs dl
       JOIN labs l ON dl.lab_id = l.id
       LEFT JOIN users m ON dl.marked_by = m.id
       WHERE dl.user_id = $1
       ORDER BY dl.created_at DESC`,
      [userId]
    );
    return result.rows;
  },
};

module.exports = Entry;
