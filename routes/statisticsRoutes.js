const express = require("express");
const router = express.Router();
const statisticsController = require("../controllers/statisticsController");
const { isAuthenticated, authorizeRoles } = require("../middleware/auth");

// All routes require admin or assistant
router.use(isAuthenticated, authorizeRoles("admin", "assistant"));

// GET /statistics — main page
router.get("/", statisticsController.index);

// GET /statistics/export - export to CSV
router.get("/export", statisticsController.exportStatistics);

// API endpoints for AJAX chart updates
router.get("/api/lab-utilization", statisticsController.apiLabUtilization);
router.get("/api/batch-utilization", statisticsController.apiBatchUtilization);

module.exports = router;
