const db = require("../config/db");

const Lab = {
  // Get all labs
  async findAll(activeOnly = true) {
    let query = "SELECT * FROM labs";
    if (activeOnly) query += " WHERE is_active = TRUE";
    query += " ORDER BY name ASC";
    const result = await db.query(query);
    return result.rows;
  },

  // Get lab by ID
  async findById(id) {
    const result = await db.query("SELECT * FROM labs WHERE id = $1", [id]);
    return result.rows[0];
  },

  // Create lab
  async create({ name, location, capacity, open_time, close_time }) {
    const result = await db.query(
      `INSERT INTO labs (name, location, capacity, open_time, close_time)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, location, capacity || 30, open_time || "08:00", close_time || "18:00"]
    );
    return result.rows[0];
  },

  // Update lab
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

  // Delete lab
  async delete(id) {
    await db.query("DELETE FROM labs WHERE id = $1", [id]);
  },

  // Get lab with current occupancy
  async getOccupancy(labId) {
    const result = await db.query(
      `SELECT COUNT(*) as current_count FROM lab_sessions
       WHERE lab_id = $1 AND status = 'active'`,
      [labId]
    );
    return parseInt(result.rows[0].current_count);
  },

  // Get all labs with occupancy info
  async findAllWithOccupancy() {
    const result = await db.query(`
      SELECT l.*,
        COALESCE(s.active_count, 0) as current_occupancy,
        l.capacity - COALESCE(s.active_count, 0) as available_seats
      FROM labs l
      LEFT JOIN (
        SELECT lab_id, COUNT(*) as active_count
        FROM lab_sessions
        WHERE status = 'active'
        GROUP BY lab_id
      ) s ON l.id = s.lab_id
      WHERE l.is_active = TRUE
      ORDER BY l.name ASC
    `);
    return result.rows;
  },

  // Get seats for a lab
  async getSeats(labId) {
    const result = await db.query(
      `SELECT s.*,
        CASE WHEN ls.id IS NOT NULL THEN TRUE ELSE FALSE END as is_occupied,
        ls.user_id as occupied_by
      FROM seats s
      LEFT JOIN lab_sessions ls ON s.id = ls.seat_id AND ls.status = 'active'
      WHERE s.lab_id = $1 AND s.is_active = TRUE
      ORDER BY s.seat_number ASC`,
      [labId]
    );
    return result.rows;
  },

  // Create seats for a lab (bulk)
  async createSeats(labId, count) {
    const values = [];
    const params = [];
    for (let i = 1; i <= count; i++) {
      values.push(`($${params.length + 1}, $${params.length + 2})`);
      params.push(labId, `S${String(i).padStart(2, "0")}`);
    }
    const result = await db.query(
      `INSERT INTO seats (lab_id, seat_number) VALUES ${values.join(", ")} RETURNING *`,
      params
    );
    return result.rows;
  },
};

module.exports = Lab;
