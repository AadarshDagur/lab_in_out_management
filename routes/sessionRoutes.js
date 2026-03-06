const express = require("express");
const router = express.Router();
const sessionController = require("../controllers/sessionController");
const { isAuthenticated, authorizeRoles } = require("../middleware/auth");

// POST /sessions/checkin - only admin/assistant can manual check in (students use QR)
router.post(
  "/checkin",
  isAuthenticated,
  authorizeRoles("admin", "assistant"),
  sessionController.checkIn
);

// POST /sessions/checkout/:id - check out from session
router.post("/checkout/:id", isAuthenticated, sessionController.checkOut);

// POST /sessions/checkout-user/:userId - assistant/admin checks out a student
router.post(
  "/checkout-user/:userId",
  isAuthenticated,
  authorizeRoles("assistant", "admin"),
  sessionController.checkOutUser
);

// GET /sessions/history - user's own history
router.get("/history", isAuthenticated, sessionController.history);

// GET /sessions/lab/:id - lab history (assistant/admin)
router.get(
  "/lab/:id",
  isAuthenticated,
  authorizeRoles("assistant", "admin"),
  sessionController.labHistory
);

// GET /sessions/report - daily report (admin)
router.get(
  "/report",
  isAuthenticated,
  authorizeRoles("admin"),
  sessionController.report
);

module.exports = router;
