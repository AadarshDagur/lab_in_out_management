const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const labController = require("../controllers/labController");
const { isAuthenticated, authorizeRoles, disallowRoles } = require("../middleware/auth");

// GET /labs - all users can view labs
router.get("/", isAuthenticated, disallowRoles("admin"), labController.index);

// GET /labs/manage - admin only
router.get("/manage", isAuthenticated, authorizeRoles("admin"), labController.manage);

router.post(
  "/:id/status",
  isAuthenticated,
  authorizeRoles("admin", "assistant"),
  labController.updateStatus
);

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
router.get("/:id", isAuthenticated, disallowRoles("admin"), labController.show);

// PUT /labs/:id - admin updates a lab
router.put("/:id", isAuthenticated, authorizeRoles("admin"), labController.update);

// DELETE /labs/:id - admin deletes a lab
router.delete("/:id", isAuthenticated, authorizeRoles("admin"), labController.delete);

module.exports = router;
