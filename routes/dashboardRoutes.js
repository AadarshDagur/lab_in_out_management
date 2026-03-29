const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
const { isAuthenticated, disallowRoles } = require("../middleware/auth");

// GET /dashboard
router.get("/", isAuthenticated, disallowRoles("admin"), dashboardController.index);

module.exports = router;
