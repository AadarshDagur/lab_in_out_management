// Lab In/Out Management System - Client-side JS

document.addEventListener("DOMContentLoaded", () => {
  // Auto-dismiss alerts after 5 seconds
  const alerts = document.querySelectorAll(".alert-dismissible");
  alerts.forEach((alert) => {
    setTimeout(() => {
      const closeBtn = alert.querySelector(".btn-close");
      if (closeBtn) closeBtn.click();
    }, 5000);
  });

  // Confirm password match on register page
  const confirmPassword = document.getElementById("confirmPassword");
  const password = document.getElementById("password");

  if (confirmPassword && password) {
    const form = confirmPassword.closest("form");
    form.addEventListener("submit", (e) => {
      if (password.value !== confirmPassword.value) {
        e.preventDefault();
        alert("Passwords do not match!");
        confirmPassword.focus();
      }
    });
  }

  // Confirm delete actions
  const deleteForms = document.querySelectorAll('form[onsubmit*="confirm"]');
  deleteForms.forEach((form) => {
    form.removeAttribute("onsubmit");
    form.addEventListener("submit", (e) => {
      if (!confirm("Are you sure you want to delete this? This action cannot be undone.")) {
        e.preventDefault();
      }
    });
  });
});
