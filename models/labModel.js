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

  async update(id, { name, location, capacity, open_time, close_time, is_active }) {
    const result = await db.query(
      `UPDATE labs SET name = COALESCE($1, name), location = COALESCE($2, location),
       capacity = COALESCE($3, capacity), open_time = COALESCE($4, open_time),
       close_time = COALESCE($5, close_time), is_active = COALESCE($6, is_active),
       updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 RETURNING *`,
      [name, location, capacity, open_time, close_time, is_active, id]
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
};

module.exports = Lab;
