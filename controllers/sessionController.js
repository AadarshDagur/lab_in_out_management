const LabSession = require("../models/sessionModel");
const Lab = require("../models/labModel");
const User = require("../models/userModel");
const Entry = require("../models/entryModel");
const Settings = require("../models/settingsModel");
const ViolationRequest = require("../models/violationRequestModel");
const AuditLog = require("../models/auditLogModel");
const exportService = require("../services/exportService");
const { getEffectiveRole } = require("../middleware/auth");

function getDirectoryPath(req) {
  const activeRole = getEffectiveRole(req.session.user);
  return activeRole === "admin" ? "/admin/directory" : "/dashboard?section=directory";
}

const sessionController = {
  async checkIn(req, res) {
    try {
      const requester = req.session.user;
      const { lab_id, user_id } = req.body;
      const activeRole = getEffectiveRole(requester);
      const targetUserId =
        activeRole === "student" ? requester.id : parseInt(user_id, 10);

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

      await LabSession.checkIn({
        user_id: targetUserId,
        lab_id,
        checked_in_by: activeRole === "student" ? null : requester.id,
      });

      // Broadcast update
      if (req.app.get("broadcastLiveUpdate")) {
        req.app.get("broadcastLiveUpdate")();
      }

      const user = await User.findById(targetUserId);
      req.flash(
        "success",
        `${activeRole === "student" ? "Checked in" : `${user.name} checked in`} to ${lab.name}`
      );
      return res.redirect(activeRole === "student" ? "/dashboard" : `/labs/${lab.id}`);
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
      const activeRole = getEffectiveRole(requester);
      const targetSession = await LabSession.findById(sessionId);

      if (!targetSession) {
        req.flash("error", "Session not found");
        return res.redirect("/dashboard");
      }

      if (activeRole === "student" && targetSession.user_id !== requester.id) {
        req.flash("error", "You can only check out your own session");
        return res.redirect("/dashboard");
      }

      const checkedOutBy = activeRole === "student" ? null : requester.id;

      const session = await LabSession.checkOut(sessionId, checkedOutBy);
      if (!session) {
        req.flash("error", "No active session found");
        return res.redirect("/dashboard");
      }

      if (req.app.get("broadcastLiveUpdate")) {
        req.app.get("broadcastLiveUpdate")();
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
      
      if (req.app.get("broadcastLiveUpdate")) {
        req.app.get("broadcastLiveUpdate")();
      }

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

  async exportHistory(req, res) {
    try {
      const format = req.query.format || "csv";
      const sessions = await LabSession.getUserHistory(req.session.user.id, 5000);

      const headers = ["Lab", "Check In", "Check Out", "Duration (min)", "Status"];
      const rows = sessions.map(s => [
        s.lab_name,
        new Date(s.check_in_time).toLocaleString(),
        s.check_out_time ? new Date(s.check_out_time).toLocaleString() : "-",
        s.duration_minutes ? Math.round(s.duration_minutes) : "-",
        s.status,
      ]);

      const filename = `my_lab_history_${new Date().toISOString().split("T")[0]}`;

      if (format === "excel") return await exportService.exportExcel(res, filename, "My Lab History", headers, rows);
      if (format === "pdf") return await exportService.exportPDF(res, filename, "My Lab History", headers, rows);
      return exportService.exportCSV(res, filename, headers, rows);
    } catch (error) {
      console.error("History export error:", error);
      req.flash("error", "Failed to export history");
      return res.redirect("/sessions/history");
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

  async exportLabHistory(req, res) {
    try {
      const lab = await Lab.findById(req.params.id);
      if (!lab) {
        req.flash("error", "Lab not found");
        return res.redirect("/labs");
      }

      const format = req.query.format || "csv";
      const sessions = await LabSession.getLabHistory(lab.id, 5000); // 5000 limit for export

      const headers = ["Student", "Enrollment No", "Check In", "Check Out", "Duration (min)", "Status"];
      const rows = sessions.map(s => [
        s.user_name,
        s.enrollment_no || "-",
        new Date(s.check_in_time).toLocaleString(),
        s.check_out_time ? new Date(s.check_out_time).toLocaleString() : "-",
        s.duration_minutes ? Math.round(s.duration_minutes) : "-",
        s.status
      ]);

      const filename = `lab_${lab.id}_history_${new Date().toISOString().split("T")[0]}`;
      
      if (format === 'excel') return await exportService.exportExcel(res, filename, "Lab History", headers, rows);
      if (format === 'pdf') return await exportService.exportPDF(res, filename, `${lab.name} History`, headers, rows);
      return exportService.exportCSV(res, filename, headers, rows);
    } catch (error) {
      console.error("Lab history export error:", error);
      req.flash("error", "Failed to export lab history");
      res.redirect(`/sessions/lab/${req.params.id}`);
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

      if (student && student.role === "admin") {
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

      if (req.app.get("broadcastLiveUpdate")) {
        req.app.get("broadcastLiveUpdate")();
      }

      await AuditLog.log({
        userId: req.session.user.id,
        userName: req.session.user.name,
        action: "MARK_VIOLATION",
        targetType: "user",
        targetId: updatedStudent.id,
        details: `Assistant marked ${reasonLabel.toLowerCase()} violation for ${updatedStudent.name} in ${lab.name}`,
        ipAddress: req.ip,
      });

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
      const activeRole = getEffectiveRole(req.session.user);
      if (activeRole !== "admin") {
         req.flash("error", "Only admins can remove violations directly.");
         return res.redirect(req.get("Referrer") || "/");
      }

      const violationId = req.params.id;
      const result = await Entry.removeViolation(parseInt(violationId, 10));

      if (!result) {
        req.flash("error", "Violation not found");
        return res.redirect(req.get("Referrer") || "/");
      }

      if (result.locked) {
        req.flash("error", "This violation is locked (marked before reactivation) and cannot be removed.");
        return res.redirect(req.get("Referrer") || "/");
      }

      const updatedStudent = result; // since we returned the updated student

      // Check if we should unsuspend the student
      const student = await User.findById(updatedStudent.id);
      const limit = await Settings.getViolationLimit();
      let restoredMsg = "";

      if (student && student.violation_count < limit && (!student.is_active || student.suspended_until)) {
        await User.liftSuspension(student.id);
        restoredMsg = " Their suspension has been lifted.";
      }

      await AuditLog.log({
        userId: req.session.user.id,
        userName: req.session.user.name,
        action: "REMOVE_VIOLATION",
        targetType: "violation",
        targetId: violationId,
        details: `Removed violation for ${updatedStudent.name}`,
        ipAddress: req.ip,
      });

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

  async requestViolationRemoval(req, res) {
    try {
      const violationId = req.params.id;
      const { reason } = req.body;

      const violation = await Entry.findById(violationId);
      if (!violation) {
         req.flash("error", "Violation not found");
         return res.redirect(req.get("Referrer") || "/");
      }

      if (violation.locked) {
         req.flash("error", "This violation is locked and cannot be removed.");
         return res.redirect(req.get("Referrer") || "/");
      }

      const request = await ViolationRequest.create({
        violationId: violationId,
        requestedBy: req.session.user.id,
        reason: reason
      });

      if (request.alreadyRequested) {
        req.flash("error", "A pending removal request already exists for this violation.");
      } else {
        await AuditLog.log({
          userId: req.session.user.id,
          userName: req.session.user.name,
          action: "REQUEST_VIOLATION_REMOVAL",
          targetType: "violation",
          targetId: violationId,
          details: `Assistant requested removal of violation for ${violation.user_name}`,
          ipAddress: req.ip,
        });
        req.flash("success", "Violation removal request submitted to admin for approval.");
      }
      return res.redirect(req.get("Referrer") || "/");
    } catch (error) {
      console.error("Request violation removal error:", error);
      req.flash("error", "Failed to submit removal request");
      return res.redirect(req.get("Referrer") || "/");
    }
  },

  async approveRemoval(req, res) {
    try {
      const requestId = req.params.id;
      const request = await ViolationRequest.approve(requestId, req.session.user.id);
      
      if (!request) {
        req.flash("error", "Request not found or not pending");
        return res.redirect("/admin/violation-requests");
      }

      // Now actually remove the violation
      const result = await Entry.removeViolation(request.violation_id);
      
      if (result && !result.locked) {
        // Check suspension lift logic
        const student = await User.findById(result.id);
        const limit = await Settings.getViolationLimit();
        if (student && student.violation_count < limit && (!student.is_active || student.suspended_until)) {
          await User.liftSuspension(student.id);
        }

        await AuditLog.log({
          userId: req.session.user.id,
          userName: req.session.user.name,
          action: "APPROVE_REMOVAL_REQUEST",
          targetType: "request",
          targetId: requestId,
          details: `Approved removal request by ${request.requested_by_name} for ${student.name}`,
          ipAddress: req.ip,
        });

        req.flash("success", "Request approved and violation removed.");
      } else {
        req.flash("error", "Approved request but violation could not be removed (already removed or locked).");
      }
      
      return res.redirect("/admin/violation-requests");
    } catch (error) {
      console.error("Approve request error:", error);
      req.flash("error", "Failed to approve request");
      return res.redirect("/admin/violation-requests");
    }
  },

  async rejectRemoval(req, res) {
    try {
      const requestId = req.params.id;
      await ViolationRequest.reject(requestId, req.session.user.id);

      await AuditLog.log({
        userId: req.session.user.id,
        userName: req.session.user.name,
        action: "REJECT_REMOVAL_REQUEST",
        targetType: "request",
        targetId: requestId,
        details: `Rejected removal request`,
        ipAddress: req.ip,
      });

      req.flash("success", "Violation removal request rejected.");
      return res.redirect("/admin/violation-requests");
    } catch (error) {
      console.error("Reject request error:", error);
      req.flash("error", "Failed to reject request");
      return res.redirect("/admin/violation-requests");
    }
  },

  async studentDetail(req, res) {
    try {
      const student = await User.findById(req.params.id);
      if (!student) {
        req.flash("error", "Student not found");
        return res.redirect(getDirectoryPath(req));
      }

      const sessions = await LabSession.getUserHistory(student.id, 50);
      const violations = await Entry.getUserViolations(student.id);

      res.render("sessions/student-detail", {
        title: `${student.name} - Student Detail`,
        student,
        sessions,
        violations,
      });
    } catch (error) {
      console.error("Student detail error:", error);
      req.flash("error", "Failed to load student details");
      return res.redirect(getDirectoryPath(req));
    }
  },

  async exportStudentDetail(req, res) {
    try {
      const student = await User.findById(req.params.id);
      if (!student) {
        req.flash("error", "Student not found");
        return res.redirect(getDirectoryPath(req));
      }

      const format = req.query.format || "csv";
      const sessions = await LabSession.getUserHistory(student.id, 1000);
      const violations = await Entry.getUserViolations(student.id);

      const headers = ["Type", "Check In / Date", "Check Out", "Lab", "Duration (min) / Note", "Status"];
      const rows = [];

      sessions.forEach(s => {
        rows.push([
          "Session",
          new Date(s.check_in_time).toLocaleString(),
          s.check_out_time ? new Date(s.check_out_time).toLocaleString() : "-",
          s.lab_name,
          s.duration_minutes ? Math.round(s.duration_minutes) : "-",
          s.status
        ]);
      });

      violations.forEach(v => {
        rows.push([
          "Violation",
          new Date(v.created_at).toLocaleString(),
          "-",
          v.lab_name,
          v.note || "-",
          v.locked ? "Locked" : "Can request removal"
        ]);
      });

      const filename = `student_${student.enrollment_no || student.id}_record_${new Date().toISOString().split("T")[0]}`;
      
      if (format === 'excel') return await exportService.exportExcel(res, filename, "Student Record", headers, rows);
      if (format === 'pdf') return await exportService.exportPDF(res, filename, `${student.name} Record`, headers, rows);
      return exportService.exportCSV(res, filename, headers, rows);
    } catch (error) {
      console.error("Export student detail error:", error);
      req.flash("error", "Failed to export student details");
      return res.redirect(`/sessions/student/${req.params.id}`);
    }
  }
};

module.exports = sessionController;
