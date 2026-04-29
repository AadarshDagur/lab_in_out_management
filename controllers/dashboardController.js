const LabSession = require("../models/sessionModel");
const Lab = require("../models/labModel");
const User = require("../models/userModel");
const Entry = require("../models/entryModel");
const exportService = require("../services/exportService");

const dashboardController = {
  pickSection(requested, allowed, fallback) {
    return allowed.includes(requested) ? requested : fallback;
  },

  async index(req, res) {
    try {
      const user = req.session.user;
      const activeRole = user.activeRole || user.role;

      if (activeRole === "admin") {
        return res.redirect("/labs/manage");
      } else if (activeRole === "assistant") {
        return dashboardController.assistantDashboard(req, res);
      } else {
        return dashboardController.studentDashboard(req, res);
      }
    } catch (err) {
      console.error("Dashboard error:", err);
      req.session = null;
      return res.redirect("/auth/login?error=dashboard_failed");
    }
  },

  async studentDashboard(req, res) {
    const activeSection = dashboardController.pickSection(
      req.query.section,
      ["labs", "history"],
      "labs"
    );

    const activeSession = await LabSession.getActiveSession(req.session.user.id);
    const recentHistory = await LabSession.getUserHistory(req.session.user.id, 8);
    let labs = await Lab.findAllWithOccupancy();
    const student = await User.findById(req.session.user.id);

    // Sort labs by most visited
    const visitCounts = await LabSession.getVisitCountsByUser(req.session.user.id);
    const visitMap = {};
    visitCounts.forEach(v => visitMap[v.lab_id] = v.visit_count);
    
    labs.sort((a, b) => {
      const countA = visitMap[a.id] || 0;
      const countB = visitMap[b.id] || 0;
      return countB - countA; // Descending order
    });

    res.render("dashboard/student", {
      title: "Student Dashboard",
      activeSession,
      recentHistory,
      labs,
      student,
      activeSection,
    });
  },

  async assistantDashboard(req, res) {
    const allowedSections = ["live", "violations", "directory"];
    if (req.session.user.can_view_statistics) allowedSections.push("statistics");

    const activeSection = dashboardController.pickSection(
      req.query.section,
      allowedSections,
      "live"
    );

    const labs = await Lab.findAllWithOccupancy();
    const activeSessions = await LabSession.getAllActiveSessions();
    const stats = await LabSession.getTodayStats();
    const students = await User.findStudentDirectory();
    const recentViolations = await Entry.getViolationsByAssistant(req.session.user.id);
    
    let globalStats = null;
    let labStats = [];
    if (activeSection === "statistics" && req.session.user.can_view_statistics) {
      // Use last 30 days for dashboard overview
      const toDate = new Date().toISOString().split("T")[0];
      const fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      globalStats = await LabSession.getGlobalStatistics(fromDate, toDate);
      labStats = await LabSession.getLabStatistics(fromDate, toDate);
    } else if (activeSection === "statistics" && !req.session.user.can_view_statistics) {
       // Revert to live if they somehow requested statistics without permission
       return res.redirect("/dashboard?section=live");
    }

    res.render("dashboard/assistant", {
      title: "Assistant Dashboard",
      labs,
      activeSessions,
      stats,
      students,
      recentViolations,
      activeSection,
      globalStats,
      labStats,
    });
  },

  async adminDirectory(req, res) {
    const students = await User.findStudentDirectory();
    res.render("admin/directory", {
      title: "Student Directory",
      students,
      activeSection: "directory",
    });
  },

  // Export functions
  async exportLiveSessions(req, res) {
    try {
      const format = req.query.format || "csv";
      const activeSessions = await LabSession.getAllActiveSessions();
      const exportedAt = new Date();
      
      const headers = ["Export Date", "Export Time", "Student", "Enrollment No", "Lab", "Check-in Time", "Duration (min)"];
      const rows = activeSessions.length > 0
        ? activeSessions.map(s => [
          exportedAt.toLocaleDateString(),
          exportedAt.toLocaleTimeString(),
          s.user_name,
          s.enrollment_no || "-",
          s.lab_name,
          new Date(s.check_in_time).toLocaleString(),
          Math.max(1, Math.round((exportedAt.getTime() - new Date(s.check_in_time).getTime()) / 60000))
        ])
        : [[exportedAt.toLocaleDateString(), exportedAt.toLocaleTimeString(), "No active sessions", "-", "-", "-", "-"]];

      const filename = `live_sessions_${exportedAt.toISOString().replace(/[:.]/g, "-")}`;
      
      if (format === 'excel') return await exportService.exportExcel(res, filename, "Live Sessions", headers, rows);
      if (format === 'pdf') return await exportService.exportPDF(res, filename, "Live Lab Sessions", headers, rows);
      return exportService.exportCSV(res, filename, headers, rows);
    } catch (err) {
      console.error("Export live sessions error:", err);
      req.flash("error", "Failed to export live sessions");
      res.redirect("/dashboard?section=live");
    }
  },

  async exportStudentDirectory(req, res) {
    try {
      const format = req.query.format || "csv";
      const students = await User.findStudentDirectory();
      
      const headers = ["Name", "Enrollment No", "Email", "Department", "Violations", "Status"];
      const rows = students.map(s => [
        s.name,
        s.enrollment_no || "-",
        s.email,
        s.department || "-",
        s.violation_count || 0,
        s.is_active ? "Active" : (s.suspended_until ? "Suspended" : "Inactive")
      ]);

      const filename = `student_directory_${new Date().toISOString().split("T")[0]}`;
      
      if (format === 'excel') return await exportService.exportExcel(res, filename, "Student Directory", headers, rows);
      if (format === 'pdf') return await exportService.exportPDF(res, filename, "Student Directory", headers, rows);
      return exportService.exportCSV(res, filename, headers, rows);
    } catch (err) {
      console.error("Export directory error:", err);
      req.flash("error", "Failed to export directory");
      const activeRole = req.session.user.activeRole || req.session.user.role;
      res.redirect(activeRole === "admin" ? "/admin/directory" : "/dashboard?section=directory");
    }
  },

  async exportMyViolations(req, res) {
    try {
      const format = req.query.format || "csv";
      const violations = await Entry.getAllViolationsByAssistant(req.session.user.id);

      const headers = ["Date", "Time", "Student", "Enrollment No", "Lab", "Note", "Current Count", "Locked"];
      const rows = violations.length > 0
        ? violations.map((v) => [
          new Date(v.created_at).toLocaleDateString(),
          new Date(v.created_at).toLocaleTimeString(),
          v.user_name,
          v.enrollment_no || "-",
          v.lab_name || "-",
          v.note || "-",
          v.violation_count || 0,
          v.locked ? "Yes" : "No",
        ])
        : [["-", "-", "No violations marked", "-", "-", "-", "-", "-"]];

      const filename = `violations_marked_by_me_${new Date().toISOString().split("T")[0]}`;

      if (format === "excel") return await exportService.exportExcel(res, filename, "Violations", headers, rows);
      if (format === "pdf") return await exportService.exportPDF(res, filename, "Violations Marked By Me", headers, rows);
      return exportService.exportCSV(res, filename, headers, rows);
    } catch (err) {
      console.error("Export my violations error:", err);
      req.flash("error", "Failed to export violations");
      res.redirect("/dashboard?section=violations");
    }
  }
};

module.exports = dashboardController;
