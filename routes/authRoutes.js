const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const authController = require("../controllers/authController");
const resetController = require("../controllers/resetController");
const { isGuest, isAuthenticated } = require("../middleware/auth");

// GET /auth/login
router.get("/login", isGuest, authController.getLogin);

// POST /auth/login
router.post(
  "/login",
  isGuest,
  [
    body("email").isEmail().withMessage("Please enter a valid email")
      .custom((value) => {
        if (!value.endsWith('@iitrpr.ac.in')) {
          throw new Error('Email must be an @iitrpr.ac.in address');
        }
        return true;
      }),
    body("password").notEmpty().withMessage("Password is required"),
    body("role").isIn(["student", "assistant", "admin"]).withMessage("Please select a valid role"),
  ],
  authController.postLogin
);

// Forgot Password
router.get("/forgot-password", isGuest, resetController.getForgotPassword);
router.post("/forgot-password", isGuest, resetController.postForgotPassword);

// Reset Password
router.get("/reset-password/:token", isGuest, resetController.getResetPassword);
router.post("/reset-password/:token", isGuest, resetController.postResetPassword);

// POST /auth/logout
router.post("/logout", isAuthenticated, authController.logout);

module.exports = router;
