const multer = require("multer");

const csvFileFilter = (req, file, cb) => {
  if (
    file.mimetype === "text/csv" ||
    file.mimetype === "application/vnd.ms-excel" ||
    file.originalname.endsWith(".csv")
  ) {
    return cb(null, true);
  }
  return cb(new Error("Only CSV files are allowed"));
};

const csvUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: csvFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

module.exports = { csvUpload };
