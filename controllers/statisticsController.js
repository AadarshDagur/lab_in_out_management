const Lab = require("../models/labModel");
const LabSession = require("../models/sessionModel");

const statisticsController = {
  async index(req, res) {
    try {
      const labs = await Lab.findAllWithOccupancy();
      const period = req.query.period || "today";
      const labUtilization = await LabSession.getLabUtilization(period);
      const allLabs = await Lab.findAll(true);
      const defaultLabId = allLabs.length > 0 ? allLabs[0].id : null;
      const batchUtilization = defaultLabId
        ? await LabSession.getBatchUtilization(defaultLabId)
        : [];
      
      const overfillStats = await LabSession.getHistoricalOverfillStats(period);

      res.render("statistics/index", {
        title: "Lab Utilization Statistics",
        labs,
        labUtilization,
        batchUtilization,
        overfillStats,
        period,
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
      const period = req.query.period || "today";
      const data = await LabSession.getLabUtilization(period);
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
      const data = await LabSession.getBatchUtilization(labId);
      res.json(data);
    } catch (err) {
      console.error("Batch utilization API error:", err);
      res.status(500).json({ error: "Failed to fetch batch utilization" });
    }
  },

  async exportStatistics(req, res) {
    try {
      const period = req.query.period || "today";
      const format = req.query.format || "csv";
      
      // Get Lab Utilization
      const labUtilization = await LabSession.getLabUtilization(period);
      
      // Get all labs for Batch Utilization
      const allLabs = await Lab.findAll(true);

      const rows = [["Section", "Period", "Lab Name", "Metric", "Group", "Value"]];

      labUtilization.forEach(row => {
        rows.push([
          "Lab Utilization",
          period,
          row.lab_name,
          "Total Sessions",
          "-",
          row.session_count,
        ]);
      });
      
      // Get Historical Overfilling incidents
      const overfillStats = await LabSession.getHistoricalOverfillStats(period);
      overfillStats.forEach(row => {
        rows.push([
          "Historical Overfilling",
          period,
          row.lab_name,
          "Capacity",
          "-",
          row.capacity,
        ]);
        rows.push([
          "Historical Overfilling",
          period,
          row.lab_name,
          "Times Over Capacity",
          "-",
          row.overfill_incidents,
        ]);
      });

      for (const lab of allLabs) {
        const batchData = await LabSession.getBatchUtilization(lab.id);
        if (batchData && batchData.length > 0) {
          batchData.forEach(row => {
            rows.push([
              "Batch Utilization",
              "last_30_days",
              lab.name,
              "Session Count",
              row.batch,
              row.session_count,
            ]);
          });
        } else {
          rows.push([
            "Batch Utilization",
            "last_30_days",
            lab.name,
            "Session Count",
            "No Data",
            0,
          ]);
        }
      }

      if (format === 'excel') {
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Statistics');
        
        worksheet.columns = [
          { header: 'Section', key: 'section', width: 25 },
          { header: 'Period', key: 'period', width: 15 },
          { header: 'Lab Name', key: 'lab', width: 20 },
          { header: 'Metric', key: 'metric', width: 35 },
          { header: 'Group', key: 'group', width: 15 },
          { header: 'Value', key: 'value', width: 15 }
        ];
        
        worksheet.getRow(1).font = { bold: true };
        
        rows.slice(1).forEach(row => {
           worksheet.addRow(row);
        });

        res.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.attachment(`statistics_${period}.xlsx`);
        await workbook.xlsx.write(res);
        return res.end();
      }

      if (format === 'pdf') {
        const PDFDocument = require('pdfkit-table');
        const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
        
        res.header("Content-Type", "application/pdf");
        res.attachment(`statistics_${period}.pdf`);
        doc.pipe(res);
        
        doc.fontSize(18).text(`Lab Statistics Export (${period.toUpperCase()})`, { align: 'center' });
        doc.moveDown();

        const table = {
            title: "",
            headers: ["Section", "Period", "Lab Name", "Metric", "Group", "Value"],
            rows: rows.slice(1).map(r => r.map(c => String(c)))
        };

        await doc.table(table, { 
            width: 780,
            prepareHeader: () => doc.font("Helvetica-Bold").fontSize(10),
            prepareRow: () => doc.font("Helvetica").fontSize(9)
        });
        
        doc.end();
        return;
      }

      // Default CSV
      const escapeCsv = (value) => {
        const text = value === null || value === undefined ? "" : String(value);
        return `"${text.replace(/"/g, '""')}"`;
      };
      const csv = rows.map(row => row.map(escapeCsv).join(",")).join("\r\n") + "\r\n";
      
      res.header("Content-Type", "text/csv");
      res.attachment(`statistics_${period}.csv`);
      return res.send(csv);

    } catch (err) {
      console.error("Export statistics error:", err);
      req.flash("error", "Failed to export statistics");
      res.redirect("/statistics");
    }
  }
};

module.exports = statisticsController;
