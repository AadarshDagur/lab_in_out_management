const express = require("express");
const router = express.Router();
const settingsController = require("../controllers/settingsController");
const { isAuthenticated, authorizeRoles } = require("../middleware/auth");

// All routes require admin
router.use(isAuthenticated, authorizeRoles("admin"));

// Settings page
router.get("/settings", settingsController.getSettings);
router.post("/settings", settingsController.updateSettings);

module.exports = router;
