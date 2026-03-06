const express = require("express");
const router = express.Router();
const qrController = require("../controllers/qrController");
const { isAuthenticated, authorizeRoles } = require("../middleware/auth");

// GET /qr/scan - Scanner page (any logged-in user)
router.get("/scan", isAuthenticated, qrController.scanPage);

// GET /qr/setup/:labId - Setup page to fill purpose before QR (admin/assistant)
router.get(
  "/setup/:labId",
  isAuthenticated,
  authorizeRoles("admin", "assistant"),
  qrController.setupQR
);

// POST /qr/generate/:labId - Generate QR for a lab with purpose (admin/assistant)
router.post(
  "/generate/:labId",
  isAuthenticated,
  authorizeRoles("admin", "assistant"),
  qrController.showQR
);

// GET /qr/checkin/:token - Check in via QR (any logged-in user)
router.get("/checkin/:token", qrController.qrCheckIn);

// POST /qr/refresh/:labId - Refresh QR token (admin/assistant, AJAX)
router.post(
  "/refresh/:labId",
  isAuthenticated,
  authorizeRoles("admin", "assistant"),
  qrController.refreshQR
);

module.exports = router;
