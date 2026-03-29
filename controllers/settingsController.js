const Settings = require("../models/settingsModel");

const settingsController = {
  // GET /admin/settings
  async getSettings(req, res) {
    try {
      const limit = await Settings.getViolationLimit();
      res.render("admin/settings", { 
        title: "System Settings", 
        violation_limit: limit 
      });
    } catch (err) {
      console.error("Error fetching settings:", err);
      req.flash("error", "Failed to load settings.");
      res.redirect("/dashboard");
    }
  },

  // POST /admin/settings
  async updateSettings(req, res) {
    try {
      const { violation_limit } = req.body;
      if (!violation_limit || isNaN(violation_limit) || parseInt(violation_limit, 10) < 1) {
        req.flash("error", "Invalid limit provided. Must be a positive number.");
        return res.redirect("/admin/settings");
      }
      
      await Settings.updateViolationLimit(violation_limit);
      req.flash("success", "System settings updated successfully!");
      res.redirect("/admin/settings");
    } catch (err) {
      console.error("Error updating settings:", err);
      req.flash("error", "Failed to update settings.");
      res.redirect("/admin/settings");
    }
  }
};

module.exports = settingsController;
