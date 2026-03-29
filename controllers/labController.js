const Lab = require("../models/labModel");
const LabSession = require("../models/sessionModel");
const User = require("../models/userModel");
const { validationResult } = require("express-validator");

const labController = {
  async applyLabStatusChange(lab, nextIsActive, changedByUserId) {
    const shouldDeactivate = lab.is_active && nextIsActive === false;

    if (shouldDeactivate) {
      await LabSession.checkOutAllForLab(lab.id, changedByUserId || null);
    }

    return Lab.update(lab.id, {
      is_active: nextIsActive,
    });
  },

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

  async show(req, res) {
    try {
      const lab = await Lab.findById(req.params.id);
      if (!lab) {
        req.flash("error", "Lab not found");
        return res.redirect("/labs");
      }

      const seats = await Lab.getSeats(lab.id);
      const activeSessions = await LabSession.getActiveSessions(lab.id);
      const recentHistory = await LabSession.getLabHistory(lab.id, 10);
      const occupancy = await Lab.getOccupancy(lab.id);
      const activeSession = req.session.user
        ? await LabSession.getActiveSession(req.session.user.id)
        : null;
      let students = [];
      if (
        req.session.user &&
        (req.session.user.role === "assistant" || req.session.user.role === "admin")
      ) {
        // Get all students
        const allStudents = await User.findStudentDirectory();
        // Get all active sessions (across all labs)
        const allActiveSessions = await LabSession.getAllActiveSessions();
        // Build a set of user_ids who are currently checked in (ensure type match)
        const checkedInUserIds = new Set(allActiveSessions.map(s => String(s.user_id)));
        // Only include students who are NOT checked in anywhere (ensure type match)
        students = allStudents.filter(s => !checkedInUserIds.has(String(s.id)));
      }

      const seatAssignments = activeSessions.reduce((acc, session) => {
        if (session.seat_id) {
          acc[session.seat_id] = session;
        }
        return acc;
      }, {});

      res.render("labs/show", {
        title: lab.name,
        lab,
        seats,
        seatAssignments,
        activeSessions,
        recentHistory,
        occupancy,
        activeSession,
        students,
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
      const lab = await Lab.create({
        name,
        location,
        capacity: parseInt(capacity),
        open_time,
        close_time,
      });

      if (capacity && parseInt(capacity) > 0) {
        await Lab.createSeats(lab.id, parseInt(capacity));
      }

      req.flash("success", `Lab "${lab.name}" created successfully`);
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
      const existingLab = await Lab.findById(req.params.id);

      if (!existingLab) {
        req.flash("error", "Lab not found");
        return res.redirect("/labs/manage");
      }

      const nextIsActive =
        typeof is_active === "undefined" ? existingLab.is_active : is_active === "true";

      if (existingLab.is_active && nextIsActive === false) {
        await LabSession.checkOutAllForLab(existingLab.id, req.session.user.id);
      }

      await Lab.update(req.params.id, {
        name,
        location,
        capacity: capacity ? parseInt(capacity) : undefined,
        open_time,
        close_time,
        is_active: nextIsActive,
      });
      req.flash("success", "Lab updated successfully");
      res.redirect("/labs/manage");
    } catch (err) {
      console.error("Error updating lab:", err);
      req.flash("error", "Failed to update lab");
      res.redirect("/labs/manage");
    }
  },

  async updateStatus(req, res) {
    try {
      const lab = await Lab.findById(req.params.id);
      if (!lab) {
        req.flash("error", "Lab not found");
        return res.redirect("/labs");
      }

      const requestedStatus = req.body.is_active === "true";
      if (lab.is_active === requestedStatus) {
        req.flash(
          "success",
          requestedStatus ? "Lab is already active" : "Lab is already inactive"
        );
        return res.redirect(req.session.user.role === "admin" ? "/labs/manage" : `/labs/${lab.id}`);
      }

      const updatedLab = await labController.applyLabStatusChange(
        lab,
        requestedStatus,
        req.session.user.id
      );

      if (requestedStatus) {
        req.flash("success", `${updatedLab.name} is active again`);
      } else {
        req.flash(
          "success",
          `${updatedLab.name} was marked inactive. Active students were checked out without violations.`
        );
      }

      if (req.session.user.role === "admin" && req.body.redirect_to === "manage") {
        return res.redirect("/labs/manage");
      }

      return res.redirect(`/labs/${lab.id}`);
    } catch (err) {
      console.error("Error updating lab status:", err);
      req.flash("error", "Failed to update lab status");
      return res.redirect("/labs");
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
