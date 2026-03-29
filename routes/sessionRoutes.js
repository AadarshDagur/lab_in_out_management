const express = require("express");
const router = express.Router();
const sessionController = require("../controllers/sessionController");
const { isAuthenticated, authorizeRoles } = require("../middleware/auth");

// POST /sessions/checkin - students can self check in, assistants/admin can register students
router.post(
  "/checkin",
  isAuthenticated,
  authorizeRoles("assistant", "student"),
  sessionController.checkIn
);

router.post(
  "/mark-violation",
  isAuthenticated,
  authorizeRoles("assistant"),
  sessionController.markViolation
);

// POST /sessions/checkout/:id - check out from session
router.post(
  "/checkout/:id",
  isAuthenticated,
  authorizeRoles("student", "assistant"),
  sessionController.checkOut
);

// POST /sessions/checkout-user/:userId - assistant/admin checks out a student
router.post(
  "/checkout-user/:userId",
  isAuthenticated,
  authorizeRoles("assistant"),
  sessionController.checkOutUser
);

// GET /sessions/history - user's own history
router.get(
  "/history",
  isAuthenticated,
  authorizeRoles("student"),
  sessionController.history
);

// GET /sessions/violations - user's own violations
router.get(
  "/violations",
  isAuthenticated,
  authorizeRoles("student"),
  sessionController.myViolations
);

// GET /sessions/lab/:id - lab history (assistant/admin)
router.get(
  "/lab/:id",
  isAuthenticated,
  authorizeRoles("assistant"),
  sessionController.labHistory
);

module.exports = router;
