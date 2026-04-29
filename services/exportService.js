const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit-table");

const exportService = {
  /**
   * Export data as CSV
   * @param {Response} res - Express response
   * @param {string} filename - filename without extension
   * @param {string[]} headers - column headers
   * @param {Array<Array>} rows - data rows
   */
  exportCSV(res, filename, headers, rows) {
    const escapeCsv = (value) => {
      const text = value === null || value === undefined ? "" : String(value);
      return `"${text.replace(/"/g, '""')}"`;
    };
    const allRows = [headers, ...rows];
    const csv = allRows.map(row => row.map(escapeCsv).join(",")).join("\r\n") + "\r\n";

    res.header("Content-Type", "text/csv");
    res.attachment(`${filename}.csv`);
    return res.send(csv);
  },

  /**
   * Export data as Excel
   */
  async exportExcel(res, filename, sheetName, headers, rows) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sheetName);

    worksheet.columns = headers.map((h, i) => ({
      header: h,
      key: `col_${i}`,
      width: Math.max(15, h.length + 5),
    }));

    worksheet.getRow(1).font = { bold: true };

    rows.forEach(row => {
      const obj = {};
      row.forEach((val, i) => {
        obj[`col_${i}`] = val;
      });
      worksheet.addRow(obj);
    });

    res.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.attachment(`${filename}.xlsx`);
    await workbook.xlsx.write(res);
    return res.end();
  },

  /**
   * Export data as PDF
   */
  async exportPDF(res, filename, title, headers, rows) {
    const doc = new PDFDocument({ margin: 30, size: "A4", layout: "landscape" });

    res.header("Content-Type", "application/pdf");
    res.attachment(`${filename}.pdf`);
    doc.pipe(res);

    doc.fontSize(18).text(title, { align: "center" });
    doc.moveDown();

    const table = {
      title: "",
      headers: headers,
      rows: rows.map(r => r.map(c => String(c != null ? c : ""))),
    };

    await doc.table(table, {
      width: 780,
      prepareHeader: () => doc.font("Helvetica-Bold").fontSize(10),
      prepareRow: () => doc.font("Helvetica").fontSize(9),
    });

    doc.end();
  },
};

module.exports = exportService;
