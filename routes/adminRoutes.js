const express = require("express");
const router = express.Router();
const settingsController = require("../controllers/settingsController");
const auditController = require("../controllers/auditController");
const dashboardController = require("../controllers/dashboardController");
const ViolationRequest = require("../models/violationRequestModel");
const sessionController = require("../controllers/sessionController");
const { isAuthenticated, authorizeRoles } = require("../middleware/auth");

router.use(isAuthenticated, authorizeRoles("admin"));

// Settings
router.get("/settings", settingsController.getSettings);
router.post("/settings", settingsController.updateSettings);

// Audit Logs
router.get("/logs", auditController.index);
router.get("/logs/export", auditController.exportLogs);

// Admin Student Directory Export
router.get("/directory", dashboardController.adminDirectory);
router.get("/directory/export", dashboardController.exportStudentDirectory);

// Violation Removal Requests
router.get("/violation-requests", async (req, res) => {
  try {
    const requests = await ViolationRequest.findPending();
    res.render("admin/violation-requests", {
      title: "Pending Violation Removal Requests",
      requests
    });
  } catch (err) {
    console.error("Failed to load requests:", err);
    req.flash("error", "Failed to load violation requests");
    res.redirect("/labs/manage");
  }
});

router.post("/violation-requests/:id/approve", sessionController.approveRemoval);
router.post("/violation-requests/:id/reject", sessionController.rejectRemoval);

module.exports = router;
