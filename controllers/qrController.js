const QRCode = require("qrcode");
const crypto = require("crypto");
const db = require("../config/db");
const Lab = require("../models/labModel");
const LabSession = require("../models/sessionModel");

const qrController = {
  // Generate and store a QR token for a lab (with purpose)
  async generateToken(labId, purpose) {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 1000); // 60 seconds - short-lived for security

    // Deactivate any existing tokens for this lab
    await db.query(
      "UPDATE qr_tokens SET is_active = FALSE WHERE lab_id = $1",
      [labId]
    );

    // Insert new token with purpose
    await db.query(
      `INSERT INTO qr_tokens (lab_id, token, expires_at, is_active, purpose)
       VALUES ($1, $2, $3, TRUE, $4)`,
      [labId, token, expiresAt, purpose || null]
    );

    return token;
  },

  // Validate a QR token (returns purpose too)
  async validateToken(token) {
    const result = await db.query(
      `SELECT qt.*, l.name as lab_name FROM qr_tokens qt
       JOIN labs l ON qt.lab_id = l.id
       WHERE qt.token = $1 AND qt.is_active = TRUE AND qt.expires_at > NOW()`,
      [token]
    );
    return result.rows[0];
  },

  // GET /qr/setup/:labId - Setup page where admin fills purpose before showing QR
  async setupQR(req, res) {
    try {
      const lab = await Lab.findById(req.params.labId);
      if (!lab) {
        req.flash("error", "Lab not found");
        return res.redirect("/dashboard");
      }
      res.render("qr/setup", {
        title: `QR Setup - ${lab.name}`,
        lab,
      });
    } catch (err) {
      console.error("QR setup error:", err);
      req.flash("error", "Failed to load QR setup");
      res.redirect("/dashboard");
    }
  },

  // POST /qr/generate/:labId - Admin generates QR for a lab (with purpose)
  async showQR(req, res) {
    try {
      const lab = await Lab.findById(req.params.labId);
      if (!lab) {
        req.flash("error", "Lab not found");
        return res.redirect("/labs/manage");
      }

      const purpose = req.body.purpose || "General Use";

      // Generate a fresh token with purpose
      const token = await qrController.generateToken(lab.id, purpose);

      // Build the check-in URL
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const checkInUrl = `${baseUrl}/qr/checkin/${token}`;

      // Generate QR code as data URL
      const qrDataUrl = await QRCode.toDataURL(checkInUrl, {
        width: 400,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });

      const occupancy = await Lab.getOccupancy(lab.id);

      res.render("qr/display", {
        title: `QR Check-In - ${lab.name}`,
        lab,
        qrDataUrl,
        checkInUrl,
        occupancy,
        token,
        purpose,
      });
    } catch (err) {
      console.error("QR generation error:", err);
      req.flash("error", "Failed to generate QR code");
      res.redirect("/labs/manage");
    }
  },

  // GET /qr/checkin/:token - Student/assistant scans QR and checks in
  async qrCheckIn(req, res) {
    try {
      const { token } = req.params;

      // If not logged in, redirect to login with return URL
      if (!req.session.user) {
        req.flash("error", "Please log in first, then scan the QR code again");
        return res.redirect(`/auth/login?redirect=/qr/checkin/${token}`);
      }

      const userId = req.session.user.id;

      // Validate QR token
      const qrToken = await qrController.validateToken(token);
      if (!qrToken) {
        req.flash("error", "Invalid or expired QR code. Please ask admin to generate a new one.");
        return res.redirect("/dashboard");
      }

      const labId = qrToken.lab_id;

      // Check if user already has an active session
      const activeSession = await LabSession.getActiveSession(userId);
      if (activeSession) {
        if (activeSession.lab_id === labId) {
          req.flash("error", `You are already checked in at ${activeSession.lab_name}.`);
        } else {
          req.flash("error", `You are already checked in at ${activeSession.lab_name}. Please check out first.`);
        }
        return res.redirect("/dashboard");
      }

      // Check lab capacity
      const lab = await Lab.findById(labId);
      const occupancy = await Lab.getOccupancy(labId);
      if (occupancy >= lab.capacity) {
        req.flash("error", `${lab.name} is full. No seats available.`);
        return res.redirect("/dashboard");
      }

      // Auto-assign a seat
      let assignedSeatId = null;
      const seats = await Lab.getSeats(labId);
      const availableSeat = seats.find((s) => !s.is_occupied);
      if (availableSeat) {
        assignedSeatId = availableSeat.id;
      }

      // Check in - use the purpose stored in QR token
      const sessionPurpose = qrToken.purpose || "QR Check-In";
      await LabSession.checkIn({
        user_id: userId,
        lab_id: labId,
        seat_id: assignedSeatId,
        purpose: sessionPurpose,
        checked_in_by: null,
      });

      const seatLabel = availableSeat ? availableSeat.seat_number : "N/A";
      req.flash("success", `Checked in to ${lab.name} successfully! Seat: ${seatLabel}`);
      res.redirect("/dashboard");
    } catch (err) {
      console.error("QR check-in error:", err);
      req.flash("error", "Failed to check in via QR. Please try again.");
      res.redirect("/dashboard");
    }
  },

  // GET /qr/scan - Scanner page (phone camera)
  scanPage(req, res) {
    res.render("qr/scan", { title: "Scan QR Code" });
  },

  // POST /qr/refresh/:labId - Regenerate QR token (AJAX)
  async refreshQR(req, res) {
    try {
      const lab = await Lab.findById(req.params.labId);
      if (!lab) {
        return res.status(404).json({ error: "Lab not found" });
      }

      const purpose = req.body.purpose || null;
      const token = await qrController.generateToken(lab.id, purpose);
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const checkInUrl = `${baseUrl}/qr/checkin/${token}`;

      const qrDataUrl = await QRCode.toDataURL(checkInUrl, {
        width: 400,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });

      res.json({ qrDataUrl, checkInUrl, token });
    } catch (err) {
      console.error("QR refresh error:", err);
      res.status(500).json({ error: "Failed to refresh QR code" });
    }
  },
};

module.exports = qrController;
