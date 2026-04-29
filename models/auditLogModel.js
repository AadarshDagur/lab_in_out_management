const db = require("../config/db");

const SERIOUS_ACTIONS = [
  "LOGIN",
  "CREATE_USER",
  "CHANGE_ROLE",
  "REACTIVATE_USER",
  "BULK_UPLOAD",
  "DELETE_USER",
  "MARK_VIOLATION",
  "REQUEST_VIOLATION_REMOVAL",
  "REMOVE_VIOLATION",
  "APPROVE_REMOVAL_REQUEST",
  "REJECT_REMOVAL_REQUEST",
  "EXPORT_STATISTICS",
];

const SERIOUS_WHERE = `
  action = ANY($1)
  AND (
    action <> 'LOGIN'
    OR details ILIKE '%admin%'
    OR details ILIKE '%assistant%'
  )
`;

const AuditLog = {
  /**
   * Insert a permanent audit log entry. No update/delete methods exist by design.
   */
  async log({ userId, userName, action, targetType, targetId, details, ipAddress }) {
    try {
      if (!SERIOUS_ACTIONS.includes(action)) return;

      await db.query(
        `INSERT INTO admin_audit_logs (user_id, user_name, action, target_type, target_id, details, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId || null, userName || null, action, targetType || null, targetId || null, details || null, ipAddress || null]
      );
    } catch (err) {
      // Never let audit logging crash the app
      console.error("Audit log write failed:", err.message);
    }
  },

  async findAll(limit = 100, offset = 0) {
    const result = await db.query(
      `SELECT * FROM admin_audit_logs
       WHERE ${SERIOUS_WHERE}
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [SERIOUS_ACTIONS, limit, offset]
    );
    return result.rows;
  },

  buildFilterWhere(filters = {}, startIndex = 2) {
    const clauses = [
      `action = ANY($1)`,
      `(action <> 'LOGIN' OR details ILIKE '%admin%' OR details ILIKE '%assistant%')`,
    ];
    const params = [SERIOUS_ACTIONS];
    let index = startIndex;

    if (filters.from) {
      clauses.push(`created_at >= $${index}::date`);
      params.push(filters.from);
      index += 1;
    }
    if (filters.to) {
      clauses.push(`created_at < ($${index}::date + INTERVAL '1 day')`);
      params.push(filters.to);
      index += 1;
    }
    if (filters.action) {
      clauses.push(`action = $${index}`);
      params.push(filters.action);
      index += 1;
    }
    if (filters.user) {
      clauses.push(`user_name ILIKE $${index}`);
      params.push(`%${filters.user}%`);
      index += 1;
    }
    if (filters.q) {
      clauses.push(`(details ILIKE $${index} OR target_type ILIKE $${index} OR COALESCE(target_id::text, '') ILIKE $${index})`);
      params.push(`%${filters.q}%`);
      index += 1;
    }

    return { where: clauses.join(" AND "), params, nextIndex: index };
  },

  async findFiltered(filters = {}, limit = 100, offset = 0) {
    const built = this.buildFilterWhere(filters);
    const result = await db.query(
      `SELECT * FROM admin_audit_logs
       WHERE ${built.where}
       ORDER BY created_at DESC
       LIMIT $${built.nextIndex} OFFSET $${built.nextIndex + 1}`,
      [...built.params, limit, offset]
    );
    return result.rows;
  },

  async countFiltered(filters = {}) {
    const built = this.buildFilterWhere(filters);
    const result = await db.query(
      `SELECT COUNT(*)::int AS total FROM admin_audit_logs WHERE ${built.where}`,
      built.params
    );
    return result.rows[0].total;
  },

  getActions() {
    return SERIOUS_ACTIONS;
  },

  async findByDateRange(from, to, limit = 200, offset = 0) {
    const result = await db.query(
      `SELECT * FROM admin_audit_logs
       WHERE created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day')
       AND action = ANY($5)
       AND (
         action <> 'LOGIN'
         OR details ILIKE '%admin%'
         OR details ILIKE '%assistant%'
       )
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [from, to, limit, offset, SERIOUS_ACTIONS]
    );
    return result.rows;
  },

  async count() {
    const result = await db.query(
      `SELECT COUNT(*)::int AS total FROM admin_audit_logs WHERE ${SERIOUS_WHERE}`,
      [SERIOUS_ACTIONS]
    );
    return result.rows[0].total;
  },

  async countByDateRange(from, to) {
    const result = await db.query(
      `SELECT COUNT(*)::int AS total FROM admin_audit_logs
       WHERE created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day')
       AND action = ANY($3)
       AND (
         action <> 'LOGIN'
         OR details ILIKE '%admin%'
         OR details ILIKE '%assistant%'
       )`,
      [from, to, SERIOUS_ACTIONS]
    );
    return result.rows[0].total;
  },
};

module.exports = AuditLog;
