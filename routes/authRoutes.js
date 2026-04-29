const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { isGuest, isAuthenticated } = require("../middleware/auth");
const { body } = require("express-validator");

// Validation middleware
const validateLogin = [
  body("email").isEmail().withMessage("Please enter a valid email").normalizeEmail(),
  body("password").notEmpty().withMessage("Password is required"),
  body("role").isIn(["student", "assistant", "admin"]).withMessage("Please select a valid role")
];

// Routes
router.get("/login", isGuest, authController.getLogin);
router.post("/login", isGuest, validateLogin, authController.postLogin);
router.post("/logout", isAuthenticated, authController.logout);
router.post("/switch-role", isAuthenticated, authController.switchRole);

module.exports = router;
