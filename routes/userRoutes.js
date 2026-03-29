const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const userController = require("../controllers/userController");
const { isAuthenticated, authorizeRoles } = require("../middleware/auth");
const { userProfileUpload } = require("../middleware/upload");

// All routes require admin
router.use(isAuthenticated, authorizeRoles("admin"));

// GET /users - list all users
router.get("/", userController.index);

// POST /users - create new user
router.post(
  "/",
  userProfileUpload.single("profile_image"),
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Please enter a valid email")
      .custom((value) => {
        if (!value.endsWith('@iitrpr.ac.in')) {
          throw new Error('Email must be an @iitrpr.ac.in address');
        }
        return true;
      }),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
    body("role").isIn(["student", "assistant", "admin"]).withMessage("Invalid role"),
    body("enrollment_no").trim().notEmpty().withMessage("Enrollment / Staff ID is required"),
    body("department").trim().notEmpty().withMessage("Department is required"),
    body("phone").trim().notEmpty().withMessage("Phone number is required"),
  ],
  userController.create
);

// PUT /users/:id - update user
router.put("/:id", userProfileUpload.single("profile_image"), userController.update);

// PUT /users/:id/role - change role
router.put("/:id/role", userController.changeRole);

// POST /users/:id/reactivate - early reactivate suspended user
router.post("/:id/reactivate", userController.reactivate);

// DELETE /users/:id - delete user
router.delete("/:id", userController.delete);

module.exports = router;
