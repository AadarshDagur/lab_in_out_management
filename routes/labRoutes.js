const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const labController = require("../controllers/labController");
const { isAuthenticated, authorizeRoles } = require("../middleware/auth");

// GET /labs - all users can view labs
router.get("/", isAuthenticated, labController.index);

// GET /labs/manage - admin only
router.get("/manage", isAuthenticated, authorizeRoles("admin"), labController.manage);

// POST /labs - admin creates a lab
router.post(
  "/",
  isAuthenticated,
  authorizeRoles("admin"),
  [
    body("name").trim().notEmpty().withMessage("Lab name is required"),
    body("capacity").isInt({ min: 1 }).withMessage("Capacity must be a positive number"),
  ],
  labController.create
);

// GET /labs/:id - view single lab
router.get("/:id", isAuthenticated, labController.show);

// PUT /labs/:id - admin updates a lab
router.put("/:id", isAuthenticated, authorizeRoles("admin"), labController.update);

// DELETE /labs/:id - admin deletes a lab
router.delete("/:id", isAuthenticated, authorizeRoles("admin"), labController.delete);

module.exports = router;
