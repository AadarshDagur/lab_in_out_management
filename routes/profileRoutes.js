const express = require("express");
const router = express.Router();
const profileController = require("../controllers/profileController");
const { isAuthenticated } = require("../middleware/auth");
const { userProfileUpload } = require("../middleware/upload");

// All routes require authentication (any role)
router.use(isAuthenticated);

// GET /profile — view own profile
router.get("/", profileController.show);

// PUT /profile — update profile (role-based restrictions in controller)
router.put("/", userProfileUpload.single("profile_image"), profileController.update);

module.exports = router;
