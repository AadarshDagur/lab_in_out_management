const db = require("../config/db");

const DEFAULT_DEPARTMENTS = [
  "Computer Science",
  "Information Technology",
  "Electronics",
  "Electrical",
  "Mechanical",
  "Civil",
];

function normalizeDepartments(input) {
  const rawDepartments = Array.isArray(input)
    ? input
    : String(input || "").split(/\r?\n|,/);
  const seen = new Set();
  const departments = [];

  rawDepartments.forEach((department) => {
    const normalized = String(department || "").trim().replace(/\s+/g, " ");
    const key = normalized.toLowerCase();
    if (normalized && !seen.has(key)) {
      seen.add(key);
      departments.push(normalized);
    }
  });

  return departments;
}

const Settings = {
  DEFAULT_DEPARTMENTS,
  normalizeDepartments,

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
  },

  async getDepartments() {
    try {
      const result = await db.query(
        `SELECT value FROM system_settings WHERE key = 'departments'`
      );
      if (result.rows.length > 0) {
        const departments = normalizeDepartments(JSON.parse(result.rows[0].value));
        if (departments.length > 0) {
          return departments;
        }
      }
      return DEFAULT_DEPARTMENTS;
    } catch (err) {
      console.error("Error fetching departments:", err);
      return DEFAULT_DEPARTMENTS;
    }
  },

  async updateDepartments(input) {
    const departments = normalizeDepartments(input);
    if (departments.length === 0) {
      throw new Error("At least one department is required");
    }

    const valueStr = JSON.stringify(departments);
    await db.query(
      `INSERT INTO system_settings (key, value)
       VALUES ('departments', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [valueStr]
    );
    return departments;
  }
};

module.exports = Settings;
