const express = require("express");
const router = express.Router();
const statisticsController = require("../controllers/statisticsController");
const { isAuthenticated, authorizeRoles, requireStatisticsAccess } = require("../middleware/auth");

router.use(isAuthenticated, authorizeRoles("assistant", "admin"), requireStatisticsAccess);

router.get("/", statisticsController.index);
router.get("/export", statisticsController.exportStatistics);
router.get("/api/utilization", statisticsController.apiLabUtilization);
router.get("/api/batch", statisticsController.apiBatchUtilization);

module.exports = router;
