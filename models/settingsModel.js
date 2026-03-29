const db = require("../config/db");

const Settings = {
  async getViolationLimit() {
    try {
      const result = await db.query(
        `SELECT value FROM system_settings WHERE key = 'violation_limit'`
      );
      if (result.rows.length > 0) {
        return parseInt(result.rows[0].value, 10) || 3;
      }
      return 3; // Default fallback
    } catch (err) {
      console.error("Error fetching violation limit:", err);
      return 3;
    }
  },

  async updateViolationLimit(limit) {
    const valueStr = String(parseInt(limit, 10));
    await db.query(
      `INSERT INTO system_settings (key, value) 
       VALUES ('violation_limit', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [valueStr]
    );
    return valueStr;
  }
};

module.exports = Settings;
