const LabSession = require("../models/sessionModel");
const Lab = require("../models/labModel");
const User = require("../models/userModel");

const dashboardController = {
  // GET /dashboard - Role-based dashboard
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

  // Student dashboard
  async studentDashboard(req, res) {
    const activeSession = await LabSession.getActiveSession(req.session.user.id);
    const recentHistory = await LabSession.getUserHistory(req.session.user.id, 10);
    const labs = await Lab.findAllWithOccupancy();

    res.render("dashboard/student", {
      title: "Student Dashboard",
      activeSession,
      recentHistory,
      labs,
    });
  },

  // Assistant dashboard
  async assistantDashboard(req, res) {
    const labs = await Lab.findAllWithOccupancy();
    const activeSessions = await LabSession.getAllActiveSessions();
    const stats = await LabSession.getTodayStats();

    res.render("dashboard/assistant", {
      title: "Assistant Dashboard",
      labs,
      activeSessions,
      stats,
    });
  },

  // Admin dashboard
  async adminDashboard(req, res) {
    const labs = await Lab.findAllWithOccupancy();
    const activeSessions = await LabSession.getAllActiveSessions();
    const stats = await LabSession.getTodayStats();
    const students = await User.findAll("student");
    const assistants = await User.findAll("assistant");

    res.render("dashboard/admin", {
      title: "Admin Dashboard",
      labs,
      activeSessions,
      stats,
      studentCount: students.length,
      assistantCount: assistants.length,
    });
  },
};

module.exports = dashboardController;
