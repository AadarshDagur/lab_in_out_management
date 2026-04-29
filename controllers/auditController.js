const AuditLog = require("../models/auditLogModel");
const exportService = require("../services/exportService");

const auditController = {
  // GET /admin/logs
  async index(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = 50;
      const offset = (page - 1) * limit;
      const selectedAction =
        typeof req.query.action_choice !== "undefined"
          ? req.query.action_choice
          : req.query.action;
      const filters = {
        from: req.query.from || "",
        to: req.query.to || "",
        action: selectedAction || "",
        user: req.query.user || "",
        q: req.query.q || "",
      };

      const logs = await AuditLog.findFiltered(filters, limit, offset);
      const totalLogs = await AuditLog.countFiltered(filters);

      const totalPages = Math.ceil(totalLogs / limit);
      const filterQuery = new URLSearchParams(filters).toString();

      res.render("admin/logs", {
        title: "Admin Audit Logs",
        logs,
        currentPage: page,
        totalPages,
        totalLogs,
        filters,
        filterQuery,
        actions: AuditLog.getActions(),
      });
    } catch (err) {
      console.error("Audit log error:", err);
      req.flash("error", "Failed to load audit logs.");
      res.redirect("/dashboard");
    }
  },

  // GET /admin/logs/export
  async exportLogs(req, res) {
    try {
      const format = req.query.format || "csv";
      const filters = {
        from: req.query.from || "",
        to: req.query.to || "",
        action: req.query.action || "",
        user: req.query.user || "",
        q: req.query.q || "",
      };

      const logs = await AuditLog.findFiltered(filters, 10000, 0);

      const headers = ["Date", "Time", "User", "Action", "Target Type", "Target ID", "Details"];
      const rows = logs.map((log) => [
        new Date(log.created_at).toLocaleDateString(),
        new Date(log.created_at).toLocaleTimeString(),
        log.user_name || "System",
        log.action,
        log.target_type || "-",
        log.target_id || "-",
        log.details || "-",
      ]);

      const filename = `audit_logs_${new Date().toISOString().split("T")[0]}`;

      if (format === "excel") {
        return await exportService.exportExcel(res, filename, "Audit Logs", headers, rows);
      } else if (format === "pdf") {
        return await exportService.exportPDF(res, filename, "System Audit Logs", headers, rows);
      } else {
        return exportService.exportCSV(res, filename, headers, rows);
      }
    } catch (err) {
      console.error("Export audit logs error:", err);
      req.flash("error", "Failed to export audit logs.");
      res.redirect("/admin/logs");
    }
  },
};

module.exports = auditController;
