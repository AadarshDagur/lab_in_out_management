const LabSession = require("../models/sessionModel");
const Lab = require("../models/labModel");

const sessionController = {
  // POST /sessions/checkin - Check in to a lab (admin/assistant only)
  async checkIn(req, res) {
    try {
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const { lab_id, seat_id, purpose } = req.body;

      // Students MUST use QR code to check in (prevents remote fake check-in)
      if (userRole === 'student') {
        req.flash('error', 'Students must check in by scanning the QR code displayed in the lab. This ensures physical presence.');
        return res.redirect('/labs');
      }

      // Check if user already has an active session
      const activeSession = await LabSession.getActiveSession(userId);
      if (activeSession) {
        req.flash("error", `You are already checked in at ${activeSession.lab_name}. Please check out first.`);
        return res.redirect("/labs");
      }

      // Check lab capacity
      const lab = await Lab.findById(lab_id);
      if (!lab) {
        req.flash("error", "Lab not found");
        return res.redirect("/labs");
      }

      const occupancy = await Lab.getOccupancy(lab_id);
      if (occupancy >= lab.capacity) {
        req.flash("error", `${lab.name} is full. No seats available.`);
        return res.redirect("/labs");
      }

      // Auto-assign seat if not selected
      let assignedSeatId = seat_id || null;
      if (!assignedSeatId) {
        const seats = await Lab.getSeats(lab_id);
        const availableSeat = seats.find(s => !s.is_occupied);
        if (availableSeat) {
          assignedSeatId = availableSeat.id;
        }
      }

      // Create session
      await LabSession.checkIn({
        user_id: userId,
        lab_id,
        seat_id: assignedSeatId,
        purpose,
        checked_in_by: req.session.user.role !== "student" ? userId : null,
      });

      req.flash("success", `Checked in to ${lab.name} successfully!`);
      res.redirect("/dashboard");
    } catch (err) {
      console.error("Check-in error:", err);
      req.flash("error", "Failed to check in. Please try again.");
      res.redirect("/labs");
    }
  },

  // POST /sessions/checkout/:id - Check out from a lab
  async checkOut(req, res) {
    try {
      const sessionId = req.params.id;
      const checkedOutBy = req.session.user.role !== "student" ? req.session.user.id : null;

      const session = await LabSession.checkOut(sessionId, checkedOutBy);
      if (!session) {
        req.flash("error", "No active session found");
        return res.redirect("/dashboard");
      }

      const duration = Math.round(session.duration_minutes);
      req.flash("success", `Checked out successfully! Duration: ${duration} minutes`);
      res.redirect("/dashboard");
    } catch (err) {
      console.error("Check-out error:", err);
      req.flash("error", "Failed to check out. Please try again.");
      res.redirect("/dashboard");
    }
  },

  // POST /sessions/checkout-user/:userId - Assistant checks out a student
  async checkOutUser(req, res) {
    try {
      const userId = req.params.userId;
      const activeSession = await LabSession.getActiveSession(userId);

      if (!activeSession) {
        req.flash("error", "No active session found for this student");
        return res.redirect("back");
      }

      await LabSession.checkOut(activeSession.id, req.session.user.id);
      req.flash("success", "Student checked out successfully");
      res.redirect("back");
    } catch (err) {
      console.error("Check-out error:", err);
      req.flash("error", "Failed to check out student");
      res.redirect("back");
    }
  },

  // GET /sessions/history - User's own history
  async history(req, res) {
    try {
      const sessions = await LabSession.getUserHistory(req.session.user.id);
      res.render("sessions/history", { title: "My Lab History", sessions });
    } catch (err) {
      console.error("Error fetching history:", err);
      req.flash("error", "Failed to fetch history");
      res.redirect("/dashboard");
    }
  },

  // GET /sessions/lab/:id - Lab session history (assistant/admin)
  async labHistory(req, res) {
    try {
      const lab = await Lab.findById(req.params.id);
      if (!lab) {
        req.flash("error", "Lab not found");
        return res.redirect("/labs");
      }

      const sessions = await LabSession.getLabHistory(lab.id);
      res.render("sessions/lab-history", { title: `${lab.name} - History`, lab, sessions });
    } catch (err) {
      console.error("Error fetching lab history:", err);
      req.flash("error", "Failed to fetch lab history");
      res.redirect("/labs");
    }
  },

  // GET /sessions/report - Daily report (admin)
  async report(req, res) {
    try {
      const date = req.query.date || new Date().toISOString().split("T")[0];
      const report = await LabSession.getDailyReport(date);
      const stats = await LabSession.getTodayStats();
      res.render("sessions/report", { title: "Daily Report", report, stats, date });
    } catch (err) {
      console.error("Error fetching report:", err);
      req.flash("error", "Failed to fetch report");
      res.redirect("/dashboard");
    }
  },
};

module.exports = sessionController;
