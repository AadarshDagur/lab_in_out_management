const Lab = require("../models/labModel");
const LabSession = require("../models/sessionModel");
const User = require("../models/userModel");
const { validationResult } = require("express-validator");

function normalizeDbBoolean(value) {
  return value === true || value === "true" || value === "t" || value === 1 || value === "1";
}

function normalizeLabBooleans(lab) {
  if (!lab) return lab;
  return {
    ...lab,
    is_active: normalizeDbBoolean(lab.is_active),
    manual_inactive: normalizeDbBoolean(lab.manual_inactive),
    manual_active: normalizeDbBoolean(lab.manual_active),
  };
}

const labController = {
  async applyLabStatusChange(lab, nextIsActive, changedByUserId) {
    const shouldDeactivate = lab.is_active && nextIsActive === false;

    if (shouldDeactivate) {
      await LabSession.checkOutAllForLab(lab.id, changedByUserId || null);
    }

    return Lab.update(lab.id, {
      is_active: nextIsActive,
      manual_inactive: !nextIsActive,
      manual_active: nextIsActive,
    });
  },

  async index(req, res) {
    try {
      const labs = (await Lab.findAllWithOccupancy(false)).map(normalizeLabBooleans);
      const activeSession = req.session.user
        ? await LabSession.getActiveSession(req.session.user.id)
        : null;
      res.render("labs/index", { title: "Labs", labs, activeSession });
    } catch (err) {
      console.error("Error fetching labs:", err);
      req.flash("error", "Failed to fetch labs");
      res.redirect("/dashboard");
    }
  },

  async show(req, res) {
    try {
      const lab = normalizeLabBooleans(await Lab.findById(req.params.id));
      if (!lab) {
        req.flash("error", "Lab not found");
        return res.redirect("/labs");
      }

      const activeSessions = await LabSession.getActiveSessions(lab.id);
      const recentHistory = await LabSession.getLabHistory(lab.id, 10);
      const occupancy = await Lab.getOccupancy(lab.id);
      const activeSession = req.session.user
        ? await LabSession.getActiveSession(req.session.user.id)
        : null;
      let students = [];
      const activeRole = req.session.user
        ? (req.session.user.activeRole || req.session.user.role)
        : null;
      if (
        req.session.user &&
        (activeRole === "assistant" || activeRole === "admin")
      ) {
        const allStudents = await User.findStudentDirectory();
        const allActiveSessions = await LabSession.getAllActiveSessions();
        const checkedInUserIds = new Set(allActiveSessions.map(s => String(s.user_id)));
        students = allStudents.filter(s => !checkedInUserIds.has(String(s.id)));
      }

      res.render("labs/show", {
        title: lab.name,
        lab,
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
      const labs = (await Lab.findAll(false)).map(normalizeLabBooleans); // include inactive
      res.render("labs/manage", { title: "Manage Labs", labs });
    } catch (err) {
      console.error("Error fetching labs:", err);
      req.session = null;
      return res.redirect("/auth/login?error=labs_failed");
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

      const { name, location, capacity } = req.body;
      await Lab.create({
        name,
        location,
        capacity: parseInt(capacity),
      });

      if (req.app.get("broadcastLiveUpdate")) {
        await req.app.get("broadcastLiveUpdate")();
      }
      if (req.app.get("broadcastAppUpdate")) {
        req.app.get("broadcastAppUpdate")("lab");
      }

      // No seat creation — seats concept removed

      req.flash("success", `Lab "${name}" created successfully`);
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
      const { name, location, capacity, is_active } = req.body;
      const existingLab = normalizeLabBooleans(await Lab.findById(req.params.id));

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
        is_active: nextIsActive,
        manual_inactive: !nextIsActive,
        manual_active: nextIsActive,
      });

      if (req.app.get("broadcastLiveUpdate")) {
        await req.app.get("broadcastLiveUpdate")();
      }
      if (req.app.get("broadcastAppUpdate")) {
        req.app.get("broadcastAppUpdate")("lab", { labId: existingLab.id });
      }
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
      const lab = normalizeLabBooleans(await Lab.findById(req.params.id));
      if (!lab) {
        req.flash("error", "Lab not found");
        return res.redirect("/labs");
      }

      const requestedStatus = req.body.is_active === "true";
      const wantsJson = req.xhr || (req.get("accept") || "").includes("application/json");
      if (typeof req.body.is_active === "undefined") {
        if (wantsJson) {
          return res.status(400).json({ error: "Lab status value is required" });
        }
        req.flash("error", "Lab status value is required");
        return res.redirect(req.get("Referrer") || "/labs");
      }
      if (lab.is_active === requestedStatus) {
        if (wantsJson) {
          return res.json({ lab, message: requestedStatus ? "Lab is already active" : "Lab is already inactive" });
        }
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
      if (req.app.get("broadcastLiveUpdate")) {
        await req.app.get("broadcastLiveUpdate")();
      }
      if (req.app.get("broadcastAppUpdate")) {
        req.app.get("broadcastAppUpdate")("lab-status", { labId: lab.id, isActive: requestedStatus });
      }

      if (requestedStatus) {
        if (wantsJson) {
          return res.json({ lab: normalizeLabBooleans(updatedLab), message: `${updatedLab.name} is active again` });
        }
        req.flash("success", `${updatedLab.name} is active again`);
      } else {
        if (wantsJson) {
          return res.json({
            lab: normalizeLabBooleans(updatedLab),
            message: `${updatedLab.name} was marked inactive. Active students were checked out without violations.`,
          });
        }
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
      if (req.app.get("broadcastLiveUpdate")) {
        await req.app.get("broadcastLiveUpdate")();
      }
      if (req.app.get("broadcastAppUpdate")) {
        req.app.get("broadcastAppUpdate")("lab");
      }
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
