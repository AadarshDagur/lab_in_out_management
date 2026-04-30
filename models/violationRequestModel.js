const db = require("../config/db");

const ViolationRequest = {
  async create({ violationId, requestedBy, reason }) {
    // Check if a pending request already exists for this violation
    const existing = await db.query(
      `SELECT id FROM violation_removal_requests WHERE violation_id = $1 AND status = 'pending'`,
      [violationId]
    );
    if (existing.rows.length > 0) {
      return { alreadyRequested: true };
    }

    const result = await db.query(
      `INSERT INTO violation_removal_requests (violation_id, requested_by, reason)
       VALUES ($1, $2, $3) RETURNING *`,
      [violationId, requestedBy, reason || null]
    );
    if (global.__broadcastAppUpdate) {
      global.__broadcastAppUpdate("violation-request", { status: "pending", requestId: result.rows[0].id });
    }
    return result.rows[0];
  },

  async findPending() {
    const result = await db.query(
      `SELECT vrr.*, 
              vl.user_id AS student_id, vl.note AS violation_note, vl.created_at AS violation_date,
              u.name AS student_name, u.enrollment_no,
              r.name AS requested_by_name,
              l.name AS lab_name
       FROM violation_removal_requests vrr
       JOIN violation_logs vl ON vrr.violation_id = vl.id
       JOIN users u ON vl.user_id = u.id
       JOIN users r ON vrr.requested_by = r.id
       JOIN labs l ON vl.lab_id = l.id
       WHERE vrr.status = 'pending'
       ORDER BY vrr.created_at DESC`
    );
    return result.rows;
  },

  async findAll(limit = 50) {
    const result = await db.query(
      `SELECT vrr.*, 
              vl.user_id AS student_id, vl.note AS violation_note,
              u.name AS student_name, u.enrollment_no,
              r.name AS requested_by_name,
              rev.name AS reviewed_by_name,
              l.name AS lab_name
       FROM violation_removal_requests vrr
       JOIN violation_logs vl ON vrr.violation_id = vl.id
       JOIN users u ON vl.user_id = u.id
       JOIN users r ON vrr.requested_by = r.id
       LEFT JOIN users rev ON vrr.reviewed_by = rev.id
       JOIN labs l ON vl.lab_id = l.id
       ORDER BY vrr.created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  },

  async findById(id) {
    const result = await db.query(
      `SELECT vrr.*, 
              vl.user_id AS student_id, vl.note AS violation_note,
              u.name AS student_name, u.enrollment_no,
              r.name AS requested_by_name,
              l.name AS lab_name
       FROM violation_removal_requests vrr
       JOIN violation_logs vl ON vrr.violation_id = vl.id
       JOIN users u ON vl.user_id = u.id
       JOIN users r ON vrr.requested_by = r.id
       JOIN labs l ON vl.lab_id = l.id
       WHERE vrr.id = $1`,
      [id]
    );
    return result.rows[0];
  },

  async countPending() {
    const result = await db.query(
      `SELECT COUNT(*)::int AS count FROM violation_removal_requests WHERE status = 'pending'`
    );
    return result.rows[0].count;
  },

  async approve(requestId, reviewedBy) {
    const request = await this.findById(requestId);
    if (!request || request.status !== "pending") return null;

    await db.query(
      `UPDATE violation_removal_requests SET status = 'approved', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [reviewedBy, requestId]
    );
    if (global.__broadcastAppUpdate) {
      global.__broadcastAppUpdate("violation-request", { status: "approved", requestId: Number(requestId) });
    }

    return request;
  },

  async reject(requestId, reviewedBy) {
    const result = await db.query(
      `UPDATE violation_removal_requests SET status = 'rejected', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [reviewedBy, requestId]
    );
    if (global.__broadcastAppUpdate) {
      global.__broadcastAppUpdate("violation-request", { status: "rejected", requestId: Number(requestId) });
    }
    return result.rows[0];
  },

  async findByAssistant(assistantId, limit = 20) {
    const result = await db.query(
      `SELECT vrr.*, 
              vl.note AS violation_note,
              u.name AS student_name, u.enrollment_no,
              l.name AS lab_name,
              rev.name AS reviewed_by_name
       FROM violation_removal_requests vrr
       JOIN violation_logs vl ON vrr.violation_id = vl.id
       JOIN users u ON vl.user_id = u.id
       JOIN labs l ON vl.lab_id = l.id
       LEFT JOIN users rev ON vrr.reviewed_by = rev.id
       WHERE vrr.requested_by = $1
       ORDER BY vrr.created_at DESC
       LIMIT $2`,
      [assistantId, limit]
    );
    return result.rows;
  },
};

module.exports = ViolationRequest;
