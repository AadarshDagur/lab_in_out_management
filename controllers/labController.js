const Lab = require("../models/labModel");
const LabSession = require("../models/sessionModel");
const { validationResult } = require("express-validator");

const labController = {
  // GET /labs - List all labs with occupancy
  async index(req, res) {
    try {
      const labs = await Lab.findAllWithOccupancy();
      res.render("labs/index", { title: "Labs", labs });
    } catch (err) {
      console.error("Error fetching labs:", err);
      req.flash("error", "Failed to fetch labs");
      res.redirect("/dashboard");
    }
  },

  // GET /labs/:id - Show single lab with seats and active sessions
  async show(req, res) {
    try {
      const lab = await Lab.findById(req.params.id);
      if (!lab) {
        req.flash("error", "Lab not found");
        return res.redirect("/labs");
      }

      const seats = await Lab.getSeats(lab.id);
      const activeSessions = await LabSession.getActiveSessions(lab.id);
      const occupancy = await Lab.getOccupancy(lab.id);

      // Check if current user has an active session
      let activeSession = null;
      if (req.session.user) {
        activeSession = await LabSession.getActiveSession(req.session.user.id);
      }

      res.render("labs/show", {
        title: lab.name,
        lab,
        seats,
        activeSessions,
        occupancy,
        activeSession,
      });
    } catch (err) {
      console.error("Error fetching lab:", err);
      req.flash("error", "Failed to fetch lab details");
      res.redirect("/labs");
    }
  },

  // GET /labs/manage - Admin: manage labs
  async manage(req, res) {
    try {
      const labs = await Lab.findAll(false); // include inactive
      res.render("labs/manage", { title: "Manage Labs", labs });
    } catch (err) {
      console.error("Error fetching labs:", err);
      req.flash("error", "Failed to fetch labs");
      res.redirect("/dashboard");
    }
  },

  // POST /labs - Create lab
  async create(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        req.flash("error", errors.array().map((e) => e.msg).join(", "));
        return res.redirect("/labs/manage");
      }

      const { name, location, capacity, open_time, close_time } = req.body;
      const lab = await Lab.create({ name, location, capacity: parseInt(capacity), open_time, close_time });

      // Auto-create seats
      if (capacity && parseInt(capacity) > 0) {
        await Lab.createSeats(lab.id, parseInt(capacity));
      }

      req.flash("success", `Lab "${lab.name}" created successfully with ${capacity} seats`);
      res.redirect("/labs/manage");
    } catch (err) {
      console.error("Error creating lab:", err);
      req.flash("error", "Failed to create lab");
      res.redirect("/labs/manage");
    }
  },

  // PUT /labs/:id - Update lab
  async update(req, res) {
    try {
      const { name, location, capacity, open_time, close_time, is_active } = req.body;
      await Lab.update(req.params.id, {
        name,
        location,
        capacity: capacity ? parseInt(capacity) : undefined,
        open_time,
        close_time,
        is_active: is_active === "true",
      });
      req.flash("success", "Lab updated successfully");
      res.redirect("/labs/manage");
    } catch (err) {
      console.error("Error updating lab:", err);
      req.flash("error", "Failed to update lab");
      res.redirect("/labs/manage");
    }
  },

  // DELETE /labs/:id - Delete lab
  async delete(req, res) {
    try {
      await Lab.delete(req.params.id);
      req.flash("success", "Lab deleted successfully");
      res.redirect("/labs/manage");
    } catch (err) {
      console.error("Error deleting lab:", err);
      req.flash("error", "Failed to delete lab");
      res.redirect("/labs/manage");
    }
  },
};

module.exports = labController;
