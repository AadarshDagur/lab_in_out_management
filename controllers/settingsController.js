const Settings = require("../models/settingsModel");

const settingsController = {
  // GET /admin/settings
  async getSettings(req, res) {
    try {
      const limit = await Settings.getViolationLimit();
      const departments = await Settings.getDepartments();
      res.render("admin/settings", { 
        title: "System Settings", 
        violation_limit: limit,
        departments,
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
  },

  async addDepartment(req, res) {
    try {
      const name = String(req.body.department || "").trim().replace(/\s+/g, " ");
      if (!name) {
        req.flash("error", "Department name is required.");
        return res.redirect("/admin/settings");
      }

      const departments = await Settings.getDepartments();
      if (departments.some((department) => department.toLowerCase() === name.toLowerCase())) {
        req.flash("error", "That department already exists.");
        return res.redirect("/admin/settings");
      }

      await Settings.updateDepartments([...departments, name]);
      req.flash("success", `Department "${name}" added successfully.`);
      res.redirect("/admin/settings");
    } catch (err) {
      console.error("Error adding department:", err);
      req.flash("error", "Failed to add department.");
      res.redirect("/admin/settings");
    }
  }
};

module.exports = settingsController;
