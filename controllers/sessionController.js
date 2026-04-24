const LabSession = require("../models/sessionModel");
const Lab = require("../models/labModel");
const User = require("../models/userModel");
const Entry = require("../models/entryModel");
const Settings = require("../models/settingsModel");

const sessionController = {
  async checkIn(req, res) {
    try {
      const requester = req.session.user;
      const { lab_id, user_id } = req.body;
      const targetUserId =
        requester.role === "student" ? requester.id : parseInt(user_id, 10);

      if (!targetUserId) {
        req.flash("error", "Select a student before checking in");
        return res.redirect(`/labs/${lab_id}`);
      }

      const activeSession = await LabSession.getActiveSession(targetUserId);
      if (activeSession) {
        req.flash(
          "error",
          `${activeSession.user_name || "This user"} is already checked in at ${activeSession.lab_name}. Please check out first.`
        );
        return res.redirect(`/labs/${lab_id}`);
      }

      const lab = await Lab.findById(lab_id);
      if (!lab) {
        req.flash("error", "Lab not found");
        return res.redirect("/labs");
      }

      if (!lab.is_active) {
        req.flash("error", `${lab.name} is inactive right now`);
        return res.redirect(`/labs/${lab.id}`);
      }

      // No capacity limit — allow over-capacity check-ins

      await LabSession.checkIn({
        user_id: targetUserId,
        lab_id,
        checked_in_by: requester.role === "student" ? null : requester.id,
      });

      const user = await User.findById(targetUserId);
      req.flash(
        "success",
        `${requester.role === "student" ? "Checked in" : `${user.name} checked in`} to ${lab.name}`
      );
      return res.redirect(requester.role === "student" ? "/dashboard" : `/labs/${lab.id}`);
    } catch (error) {
      console.error("Manual check-in error:", error);
      req.flash("error", "Failed to check in");
      return res.redirect(req.get("Referrer") || "/");
    }
  },

  async checkOut(req, res) {
    try {
      const sessionId = req.params.id;
      const requester = req.session.user;
      const targetSession = await LabSession.findById(sessionId);

      if (!targetSession) {
        req.flash("error", "Session not found");
        return res.redirect("/dashboard");
      }

      if (requester.role === "student" && targetSession.user_id !== requester.id) {
        req.flash("error", "You can only check out your own session");
        return res.redirect("/dashboard");
      }

      const checkedOutBy = requester.role === "student" ? null : requester.id;

      const session = await LabSession.checkOut(sessionId, checkedOutBy);
      if (!session) {
        req.flash("error", "No active session found");
        return res.redirect("/dashboard");
      }

      req.flash(
        "success",
        `Checked out successfully after ${Math.round(session.duration_minutes)} minutes`
      );
      return res.redirect("/dashboard");
    } catch (error) {
      console.error("Check-out error:", error);
      req.flash("error", "Failed to check out");
      return res.redirect("/dashboard");
    }
  },

  async checkOutUser(req, res) {
    try {
      const activeSession = await LabSession.getActiveSession(req.params.userId);
      if (!activeSession) {
        req.flash("error", "No active session found for this student");
        return res.redirect(req.get("Referrer") || "/");
      }

      await LabSession.checkOut(activeSession.id, req.session.user.id);
      req.flash("success", "Student checked out successfully");
      return res.redirect(req.get("Referrer") || "/");
    } catch (error) {
      console.error("Assistant check-out error:", error);
      req.flash("error", "Failed to check out student");
      return res.redirect(req.get("Referrer") || "/");
    }
  },

  async history(req, res) {
    try {
      const sessions = await LabSession.getUserHistory(req.session.user.id);
      res.render("sessions/history", { title: "My History", sessions });
    } catch (error) {
      console.error("History error:", error);
      req.flash("error", "Failed to fetch history");
      res.redirect("/dashboard");
    }
  },

  async myViolations(req, res) {
    try {
      const violations = await Entry.getUserViolations(req.session.user.id);
      const student = await User.findById(req.session.user.id);
      res.render("sessions/violations", { title: "My Violations", violations, student });
    } catch (error) {
      console.error("Violations error:", error);
      req.flash("error", "Failed to fetch violations");
      res.redirect("/dashboard");
    }
  },

  async labHistory(req, res) {
    try {
      const lab = await Lab.findById(req.params.id);
      if (!lab) {
        req.flash("error", "Lab not found");
        return res.redirect("/labs");
      }

      const sessions = await LabSession.getLabHistory(lab.id);
      res.render("sessions/lab-history", {
        title: `${lab.name} History`,
        lab,
        sessions,
      });
    } catch (error) {
      console.error("Lab history error:", error);
      req.flash("error", "Failed to fetch lab history");
      res.redirect("/labs");
    }
  },

  async markViolation(req, res) {
    try {
      const { identifier, user_id, lab_id, note, case_type } = req.body;

      if ((!identifier && !user_id) || !lab_id) {
        req.flash("error", "Student and lab are required");
        return res.redirect(req.get("Referrer") || "/");
      }

      let student = null;
      if (user_id) {
        student = await User.findById(parseInt(user_id, 10));
      } else if (identifier) {
        student = await User.findStudentForViolation(identifier.trim());
      }

      if (student && student.role && student.role !== "student") {
        student = null;
      }

      if (!student) {
        req.flash("error", "Student not found");
        return res.redirect(req.get("Referrer") || "/");
      }

      const lab = await Lab.findById(lab_id);
      if (!lab) {
        req.flash("error", "Lab not found");
        return res.redirect(req.get("Referrer") || "/");
      }

      const caseType = ["missing_entry", "false_entry"].includes(case_type)
        ? case_type
        : "missing_entry";

      const activeSession = await LabSession.getActiveSession(student.id);

      if (caseType === "missing_entry") {
        if (activeSession && Number(activeSession.lab_id) === Number(lab.id)) {
          req.flash("error", `${student.name} is already checked in for ${lab.name}`);
          return res.redirect(req.get("Referrer") || "/");
        }

        if (activeSession && Number(activeSession.lab_id) !== Number(lab.id)) {
          req.flash(
            "error",
            `${student.name} is already checked in at ${activeSession.lab_name}. Check out that session first.`
          );
          return res.redirect(req.get("Referrer") || "/");
        }
      }

      if (caseType === "false_entry") {
        if (!activeSession) {
          req.flash("error", `${student.name} does not have an active entry to check out`);
          return res.redirect(req.get("Referrer") || "/");
        }

        if (Number(activeSession.lab_id) !== Number(lab.id)) {
          req.flash(
            "error",
            `${student.name} is active in ${activeSession.lab_name}, not ${lab.name}`
          );
          return res.redirect(req.get("Referrer") || "/");
        }
      }

      const reasonLabel =
        caseType === "false_entry" ? "False entry" : "Missing entry";
      const formattedNote = note
        ? `${reasonLabel}: ${note.trim()}`
        : reasonLabel;

      const updatedStudent = await Entry.markViolation({
        userId: student.id,
        labId: lab.id,
        markedBy: req.session.user.id,
        note: formattedNote,
      });

      if (caseType === "missing_entry") {
        await LabSession.checkIn({
          user_id: student.id,
          lab_id: lab.id,
          checked_in_by: req.session.user.id,
        });
      }

      if (caseType === "false_entry") {
        await LabSession.checkOut(activeSession.id, req.session.user.id);
      }

      const limit = await Settings.getViolationLimit();
      let suspensionMsg = "";
      
      if (updatedStudent.violation_count >= limit) {
        await User.suspendUser(updatedStudent.id, 15);
        if (caseType === "missing_entry" && activeSession) {
           await LabSession.checkOut(activeSession.id, req.session.user.id);
        }
        suspensionMsg = ` Student has hit the violation limit and is now suspended for 15 days.`;
      }

      req.flash(
        "success",
        caseType === "missing_entry"
          ? `${updatedStudent.name} marked with a violation and checked in. Total count: ${updatedStudent.violation_count}.${suspensionMsg}`
          : `${updatedStudent.name} marked with a violation and checked out. Total count: ${updatedStudent.violation_count}.${suspensionMsg}`
      );
      return res.redirect(req.get("Referrer") || "/");
    } catch (error) {
      console.error("Violation marking error:", error);
      req.flash("error", "Unable to mark violation");
      return res.redirect(req.get("Referrer") || "/");
    }
  },

  async removeViolation(req, res) {
    try {
      const violationId = req.params.id;
      const updatedStudent = await Entry.removeViolation(parseInt(violationId, 10));

      if (!updatedStudent) {
        req.flash("error", "Violation not found");
        return res.redirect(req.get("Referrer") || "/");
      }

      // Check if we should unsuspend the student
      const student = await User.findById(updatedStudent.id);
      const limit = await Settings.getViolationLimit();
      let restoredMsg = "";

      if (student && student.violation_count < limit && (!student.is_active || student.suspended_until)) {
        await User.liftSuspension(student.id);
        restoredMsg = " Their suspension has been lifted.";
      }

      req.flash(
        "success",
        `Violation removed for ${updatedStudent.name}. New count: ${updatedStudent.violation_count}.${restoredMsg}`
      );
      return res.redirect(req.get("Referrer") || "/");
    } catch (error) {
      console.error("Remove violation error:", error);
      req.flash("error", "Failed to remove violation");
      return res.redirect(req.get("Referrer") || "/");
    }
  },

  async studentDetail(req, res) {
    try {
      const student = await User.findById(req.params.id);
      if (!student || student.role !== "student") {
        req.flash("error", "Student not found");
        return res.redirect("/dashboard?section=directory");
      }

      const sessions = await LabSession.getUserHistory(student.id, 50);
      const violations = await Entry.getUserViolations(student.id);

      res.render("sessions/student-detail", {
        title: `${student.name} — Student Detail`,
        student,
        sessions,
        violations,
      });
    } catch (error) {
      console.error("Student detail error:", error);
      req.flash("error", "Failed to load student details");
      return res.redirect("/dashboard?section=directory");
    }
  },
};

module.exports = sessionController;
