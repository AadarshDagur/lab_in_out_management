const crypto = require("crypto");
const User = require("../models/userModel");
const db = require("../config/db");
const { sendResetEmail } = require("../config/mailer");

const resetController = {
  // GET /auth/forgot-password
  getForgotPassword(req, res) {
    res.render("auth/forgot-password", { title: "Forgot Password" });
  },

  // POST /auth/forgot-password
  async postForgotPassword(req, res) {
    try {
      const { email } = req.body;

      if (!email) {
        req.flash("error", "Please enter your email address");
        return res.redirect("/auth/forgot-password");
      }

      const user = await User.findByEmail(email);

      // Always show success message (don't reveal if email exists)
      if (!user) {
        req.flash("success", "If an account with that email exists, a password reset link has been sent.");
        return res.redirect("/auth/forgot-password");
      }

      // Generate reset token
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Invalidate any existing tokens for this user
      await db.query(
        "UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE",
        [user.id]
      );

      // Store hashed token in DB
      await db.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [user.id, tokenHash, expiresAt]
      );

      // Build reset URL (send the unhashed token in the email)
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const resetUrl = `${baseUrl}/auth/reset-password/${token}`;

      // Send email
      try {
        await sendResetEmail(user.email, user.name, resetUrl);
        req.flash("success", "If an account with that email exists, a password reset link has been sent. Check your inbox.");
      } catch (emailErr) {
        console.error("Email send error:", emailErr);
        req.flash("error", "Failed to send reset email. Please contact the administrator.");
      }

      return res.redirect("/auth/forgot-password");
    } catch (err) {
      console.error("Forgot password error:", err);
      req.flash("error", "Something went wrong. Please try again.");
      return res.redirect("/auth/forgot-password");
    }
  },

  // GET /auth/reset-password/:token
  async getResetPassword(req, res) {
    try {
      const { token } = req.params;
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      // Find valid token
      const result = await db.query(
        `SELECT prt.*, u.name, u.email FROM password_reset_tokens prt
         JOIN users u ON prt.user_id = u.id
         WHERE prt.token_hash = $1 AND prt.used = FALSE AND prt.expires_at > NOW()`,
        [tokenHash]
      );

      if (result.rows.length === 0) {
        req.flash("error", "Invalid or expired reset link. Please request a new one.");
        return res.redirect("/auth/forgot-password");
      }

      res.render("auth/reset-password", {
        title: "Reset Password",
        token,
        email: result.rows[0].email,
      });
    } catch (err) {
      console.error("Reset password page error:", err);
      req.flash("error", "Something went wrong. Please try again.");
      return res.redirect("/auth/forgot-password");
    }
  },

  // POST /auth/reset-password/:token
  async postResetPassword(req, res) {
    try {
      const { token } = req.params;
      const { password, confirmPassword } = req.body;

      if (!password || password.length < 6) {
        req.flash("error", "Password must be at least 6 characters");
        return res.redirect(`/auth/reset-password/${token}`);
      }

      if (password !== confirmPassword) {
        req.flash("error", "Passwords do not match");
        return res.redirect(`/auth/reset-password/${token}`);
      }

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      // Find valid token
      const result = await db.query(
        `SELECT * FROM password_reset_tokens
         WHERE token_hash = $1 AND used = FALSE AND expires_at > NOW()`,
        [tokenHash]
      );

      if (result.rows.length === 0) {
        req.flash("error", "Invalid or expired reset link. Please request a new one.");
        return res.redirect("/auth/forgot-password");
      }

      const resetRecord = result.rows[0];

      // Update password
      await User.changePassword(resetRecord.user_id, password);

      // Mark token as used
      await db.query(
        "UPDATE password_reset_tokens SET used = TRUE WHERE id = $1",
        [resetRecord.id]
      );

      req.flash("success", "Your password has been reset successfully! You can now log in.");
      return res.redirect("/auth/login");
    } catch (err) {
      console.error("Reset password error:", err);
      req.flash("error", "Something went wrong. Please try again.");
      return res.redirect("/auth/forgot-password");
    }
  },
};

module.exports = resetController;
