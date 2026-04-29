const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
const { isAuthenticated, authorizeRoles } = require("../middleware/auth");

router.use(isAuthenticated);

router.get("/", dashboardController.index);

// Dashboard exports
router.get("/export/live-sessions", authorizeRoles("assistant", "admin"), dashboardController.exportLiveSessions);
router.get("/export/directory", authorizeRoles("assistant", "admin"), dashboardController.exportStudentDirectory);
router.get("/export/my-violations", authorizeRoles("assistant"), dashboardController.exportMyViolations);

module.exports = router;
