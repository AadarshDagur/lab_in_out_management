const LabSession = require("../models/sessionModel");
const Lab = require("../models/labModel");
const User = require("../models/userModel");
const Entry = require("../models/entryModel");

const dashboardController = {
  pickSection(requested, allowed, fallback) {
    return allowed.includes(requested) ? requested : fallback;
  },

  async index(req, res) {
    try {
      const user = req.session.user;

      if (user.role === "admin") {
        return dashboardController.adminDashboard(req, res);
      } else if (user.role === "assistant") {
        return dashboardController.assistantDashboard(req, res);
      } else {
        return dashboardController.studentDashboard(req, res);
      }
    } catch (err) {
      console.error("Dashboard error:", err);
      req.flash("error", "Failed to load dashboard");
      res.redirect("/");
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
    const labs = await Lab.findAllWithOccupancy();
    const student = await User.findById(req.session.user.id);

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
    const activeSection = dashboardController.pickSection(
      req.query.section,
      ["live", "violations", "directory"],
      "live"
    );

    const labs = await Lab.findAllWithOccupancy();
    const activeSessions = await LabSession.getAllActiveSessions();
    const stats = await LabSession.getTodayStats();
    const students = await User.findStudentDirectory();
    const recentViolations = await Entry.getRecentViolations();

    res.render("dashboard/assistant", {
      title: "Assistant Dashboard",
      labs,
      activeSessions,
      stats,
      students,
      recentViolations,
      activeSection,
    });
  },

  async adminDashboard(req, res) {
    const stats = await LabSession.getTodayStats();
    const students = await User.findAll("student");
    const assistants = await User.findAll("assistant");
    const labs = await Lab.findAll(false);

    res.render("dashboard/admin", {
      title: "Admin Dashboard",
      stats,
      studentCount: students.length,
      assistantCount: assistants.length,
      labCount: labs.length,
    });
  },
};

module.exports = dashboardController;
