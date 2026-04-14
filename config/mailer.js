const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT, 10) || 587,
  secure: false,
  family: 4,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

transporter.verify((error) => {
  if (error) {
    console.log("Email service not configured or unavailable:", error.message);
    console.log("Password reset emails will not be sent until SMTP is configured in .env");
  } else {
    console.log("Email service ready");
  }
});

async function sendResetEmail(toEmail, userName, resetUrl) {
  const mailOptions = {
    from: `"Lab Management" <${process.env.SMTP_USER || "noreply@labmanagement.com"}>`,
    to: toEmail,
    subject: "Password Reset - Lab In/Out Management",
    text: `Hi ${userName},

We received a request to reset your password.

Open this link to set a new password:
${resetUrl}

This link expires in 1 hour.

If you did not request this, you can ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #0d6efd; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0;">Lab Management</h1>
          <p style="margin: 5px 0 0;">Password Reset Request</p>
        </div>
        <div style="background: #f8f9fa; padding: 30px; border: 1px solid #dee2e6; border-radius: 0 0 8px 8px;">
          <p>Hi <strong>${userName}</strong>,</p>
          <p>We received a request to reset your password. Click the button below to set a new password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}"
               style="background: #0d6efd; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold;">
              Reset My Password
            </a>
          </div>
          <p style="color: #6c757d; font-size: 14px;">This link expires in <strong>1 hour</strong>.</p>
          <p style="color: #6c757d; font-size: 14px;">If you didn't request this, you can safely ignore this email. Your password will remain unchanged.</p>
          <hr style="border: none; border-top: 1px solid #dee2e6; margin: 20px 0;">
          <p style="color: #adb5bd; font-size: 12px; text-align: center;">Lab In/Out Management System</p>
        </div>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
}

module.exports = { transporter, sendResetEmail };
