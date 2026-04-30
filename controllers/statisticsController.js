const Lab = require("../models/labModel");
const LabSession = require("../models/sessionModel");
const exportService = require("../services/exportService");
const AuditLog = require("../models/auditLogModel");

const STAT_PERIODS = {
  working: {
    label: "Working Hours",
    timeLabel: "9:00 AM - 1:00 PM and 2:00 PM - 6:00 PM",
  },
  non_working: {
    label: "Non-Working Hours",
    timeLabel: "6:00 PM - 9:00 PM",
  },
};

const statisticsController = {
  getDates(req) {
    const today = new Date().toISOString().split("T")[0];
    const fromDate = req.query.from || today;
    const toDate = req.query.to || today;
    return { fromDate, toDate };
  },

  getPeriod(req) {
    return STAT_PERIODS[req.query.period] ? req.query.period : "working";
  },

  async index(req, res) {
    try {
      const { fromDate, toDate } = statisticsController.getDates(req);
      const selectedPeriod = statisticsController.getPeriod(req);
      
      const labs = await Lab.findAllWithOccupancy();
      const labUtilization = await LabSession.getLabUtilization(fromDate, toDate, selectedPeriod);
      const allLabs = await Lab.findAll(false);
      const defaultLabId = allLabs.length > 0 ? allLabs[0].id : null;
      const batchUtilization = defaultLabId
        ? await LabSession.getBatchUtilization(defaultLabId, fromDate, toDate, selectedPeriod)
        : [];
      
      const overfillStats = await LabSession.getHistoricalOverfillStats(fromDate, toDate, selectedPeriod);

      res.render("statistics/index", {
        title: "Lab Utilization Statistics",
        labs,
        labUtilization,
        batchUtilization,
        overfillStats,
        fromDate,
        toDate,
        selectedPeriod,
        periodMeta: STAT_PERIODS[selectedPeriod],
        statPeriods: STAT_PERIODS,
        selectedLabId: defaultLabId,
        allLabs,
      });
    } catch (err) {
      console.error("Statistics page error:", err);
      req.flash("error", "Failed to load statistics");
      res.redirect("/dashboard");
    }
  },

  async apiLabUtilization(req, res) {
    try {
      const { fromDate, toDate } = statisticsController.getDates(req);
      const selectedPeriod = statisticsController.getPeriod(req);
      const data = await LabSession.getLabUtilization(fromDate, toDate, selectedPeriod);
      res.json(data);
    } catch (err) {
      console.error("Lab utilization API error:", err);
      res.status(500).json({ error: "Failed to fetch lab utilization" });
    }
  },

  async apiBatchUtilization(req, res) {
    try {
      const labId = parseInt(req.query.lab_id, 10);
      if (!labId) {
        return res.status(400).json({ error: "lab_id is required" });
      }
      const { fromDate, toDate } = statisticsController.getDates(req);
      const selectedPeriod = statisticsController.getPeriod(req);
      const data = await LabSession.getBatchUtilization(labId, fromDate, toDate, selectedPeriod);
      res.json(data);
    } catch (err) {
      console.error("Batch utilization API error:", err);
      res.status(500).json({ error: "Failed to fetch batch utilization" });
    }
  },

  async apiOverfill(req, res) {
    try {
      const { fromDate, toDate } = statisticsController.getDates(req);
      const selectedPeriod = statisticsController.getPeriod(req);
      const data = await LabSession.getHistoricalOverfillStats(fromDate, toDate, selectedPeriod);
      res.json(data);
    } catch (err) {
      console.error("Overfill stats API error:", err);
      res.status(500).json({ error: "Failed to fetch overfill statistics" });
    }
  },

  async exportStatistics(req, res) {
    try {
      const format = req.query.format || "csv";
      const { fromDate, toDate } = statisticsController.getDates(req);
      const periodLabel = `${fromDate}_to_${toDate}`;
      const selectedPeriod = statisticsController.getPeriod(req);
      const selectedPeriodMeta = STAT_PERIODS[selectedPeriod];
      
      // Get Lab Utilization
      const labUtilization = await LabSession.getLabUtilization(fromDate, toDate, selectedPeriod);
      
      // Get all labs for Batch Utilization
      const allLabs = await Lab.findAll(false);

      const headers = ["Section", "Period", "Lab Name", "Metric", "Group", "Value"];
      const rows = [];

      labUtilization.forEach(row => {
        rows.push([
          "Lab Utilization",
          `${periodLabel} (${selectedPeriodMeta.label})`,
          row.lab_name,
          "Capacity Used (%)",
          "-",
          row.utilization_percent || 0,
        ]);
        rows.push([
          "Lab Utilization",
          `${periodLabel} (${selectedPeriodMeta.label})`,
          row.lab_name,
          "Total Sessions",
          "-",
          row.total_sessions || 0,
        ]);
        rows.push([
          "Lab Utilization",
          `${periodLabel} (${selectedPeriodMeta.label})`,
          row.lab_name,
          "Occupied Minutes",
          "-",
          row.occupied_minutes || 0,
        ]);
        rows.push([
          "Lab Utilization",
          `${periodLabel} (${selectedPeriodMeta.label})`,
          row.lab_name,
          "Available Capacity Minutes",
          "-",
          row.capacity_minutes || 0,
        ]);
      });
      
      // Get Historical Overfilling incidents
      const overfillStats = await LabSession.getHistoricalOverfillStats(fromDate, toDate, selectedPeriod);
      overfillStats.forEach(row => {
        rows.push([
          "Historical Overfilling",
          `${periodLabel} (${selectedPeriodMeta.label})`,
          row.lab_name,
          "Capacity",
          "-",
          row.capacity,
        ]);
        rows.push([
          "Historical Overfilling",
          `${periodLabel} (${selectedPeriodMeta.label})`,
          row.lab_name,
          "Times Over Capacity",
          "-",
          row.overfill_incidents,
        ]);
      });

      for (const lab of allLabs) {
        const batchData = await LabSession.getBatchUtilization(lab.id, fromDate, toDate, selectedPeriod);
        if (batchData && batchData.length > 0) {
          batchData.forEach(row => {
            rows.push([
              "Batch Utilization",
              `${periodLabel} (${selectedPeriodMeta.label})`,
              lab.name,
              "Session Minutes",
              row.batch,
              row.session_minutes,
            ]);
          });
        } else {
          rows.push([
            "Batch Utilization",
            `${periodLabel} (${selectedPeriodMeta.label})`,
            lab.name,
            "Session Minutes",
            "No Data",
            0,
          ]);
        }
      }

      const filename = `statistics_${selectedPeriod}_${periodLabel}`;

      await AuditLog.log({
        userId: req.session.user.id,
        userName: req.session.user.name,
        action: "EXPORT_STATISTICS",
        targetType: "statistics",
        targetId: null,
        details: `${req.session.user.activeRole || req.session.user.role} exported ${selectedPeriodMeta.label.toLowerCase()} statistics for ${periodLabel}`,
        ipAddress: req.ip,
      });
      
      if (format === 'excel') {
        return await exportService.exportExcel(res, filename, "Statistics", headers, rows);
      } else if (format === 'pdf') {
        return await exportService.exportPDF(res, filename, `Lab Statistics Export (${periodLabel}, ${selectedPeriodMeta.label})`, headers, rows);
      } else {
        return exportService.exportCSV(res, filename, headers, rows);
      }

    } catch (err) {
      console.error("Export statistics error:", err);
      req.flash("error", "Failed to export statistics");
      res.redirect("/statistics");
    }
  }
};

module.exports = statisticsController;
