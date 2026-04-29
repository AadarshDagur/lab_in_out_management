const express = require("express");
const router = express.Router();
const sessionController = require("../controllers/sessionController");
const { isAuthenticated, authorizeRoles, disallowRoles, requireStatisticsAccess } = require("../middleware/auth");

router.use(isAuthenticated);

// Student check-in/out
router.post("/checkin", disallowRoles("admin"), sessionController.checkIn);
router.post("/checkout/:id", authorizeRoles("student"), sessionController.checkOut);

// Assistant check-out a specific user
router.post("/checkout/user/:userId", authorizeRoles("assistant"), sessionController.checkOutUser);

// Assistant mark missing/false entry (violation)
router.post("/mark-violation", authorizeRoles("assistant"), sessionController.markViolation);

// Admin remove violation
router.post("/remove-violation/:id", authorizeRoles("admin"), sessionController.removeViolation);

// Assistant request violation removal
router.post("/request-violation-removal/:id", authorizeRoles("assistant"), sessionController.requestViolationRemoval);

// Student views
router.get("/history", authorizeRoles("student"), sessionController.history);
router.get("/history/export", authorizeRoles("student"), sessionController.exportHistory);
router.get("/violations", authorizeRoles("student"), sessionController.myViolations);

// Admin/Assistant views
router.get("/lab/:id", authorizeRoles("assistant", "admin"), requireStatisticsAccess, sessionController.labHistory);
router.get("/lab/:id/export", authorizeRoles("assistant", "admin"), requireStatisticsAccess, sessionController.exportLabHistory);

// Student detail view (admin or assistant)
router.get("/student/:id", authorizeRoles("assistant", "admin"), requireStatisticsAccess, sessionController.studentDetail);
router.get("/student/:id/export", authorizeRoles("assistant", "admin"), requireStatisticsAccess, sessionController.exportStudentDetail);

module.exports = router;
