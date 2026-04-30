// Lab In/Out Management System - Client-side JS

(() => {
  let lastUserActivityAt = 0;
  const activityEvents = ["scroll", "wheel", "touchmove", "keydown", "pointerdown"];

  const markUserActivity = () => {
    lastUserActivityAt = Date.now();
  };

  activityEvents.forEach((eventName) => {
    window.addEventListener(eventName, markUserActivity, { passive: true });
  });

  function isEditing() {
    const element = document.activeElement;
    if (!element || element === document.body) return false;
    const tagName = element.tagName;
    return element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(tagName);
  }

  window.labRunAutoRefresh = async function(callback, options = {}) {
    if (typeof callback !== "function") return;
    const force = options.force === true;
    const recentActivityMs = Number(options.recentActivityMs) || 1800;

    if (!force) {
      if (document.hidden) return;
      if (isEditing()) return;
      if (Date.now() - lastUserActivityAt < recentActivityMs) return;
    }

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const activityBefore = lastUserActivityAt;

    await callback();

    window.requestAnimationFrame(() => {
      if (lastUserActivityAt !== activityBefore || isEditing()) return;
      if (Math.abs(window.scrollX - scrollX) > 2 || Math.abs(window.scrollY - scrollY) > 2) {
        window.scrollTo(scrollX, scrollY);
      }
    });
  };
})();

document.addEventListener("DOMContentLoaded", () => {
  if (window.io && !window.labPresenceSocket) {
    window.labPresenceSocket = window.io({ reconnection: true, reconnectionAttempts: Infinity });
    window.labPresenceSocket.on("live-update", (payload) => {
      document.dispatchEvent(new CustomEvent("app:live-update", { detail: payload }));
    });
    window.labPresenceSocket.on("app-update", (payload) => {
      document.dispatchEvent(new CustomEvent("app:app-update", { detail: payload }));
    });
  }

  const sidebarToggle = document.getElementById("sidebarToggle");
  if (sidebarToggle) {
    const openClass = "sidebar-open";
    const mobileQuery = window.matchMedia("(max-width: 992px)");
    const applySidebarState = (open) => {
      document.body.classList.toggle(openClass, open && mobileQuery.matches);
      sidebarToggle.setAttribute("aria-expanded", open ? "true" : "false");
    };

    sidebarToggle.addEventListener("click", () => {
      if (!mobileQuery.matches) return;
      const open = !document.body.classList.contains(openClass);
      applySidebarState(open);
    });

    mobileQuery.addEventListener("change", () => {
      applySidebarState(false);
    });

    document.addEventListener("click", (event) => {
      const sidebar = document.querySelector(".app-sidebar");
      if (!mobileQuery.matches || !document.body.classList.contains(openClass) || !sidebar) {
        return;
      }
      if (sidebar.contains(event.target) || sidebarToggle.contains(event.target)) {
        return;
      }
      applySidebarState(false);
    });

    applySidebarState(false);
  }

  const sidebar = document.querySelector(".app-sidebar");
  if (sidebar) {
    const sidebarScrollKey = "appSidebarScrollTop";
    const savedSidebarScroll = window.sessionStorage.getItem(sidebarScrollKey);

    if (savedSidebarScroll !== null) {
      sidebar.scrollTop = Number(savedSidebarScroll) || 0;
    }

    const persistSidebarScroll = () => {
      window.sessionStorage.setItem(sidebarScrollKey, String(sidebar.scrollTop));
    };

    sidebar.addEventListener("scroll", persistSidebarScroll, { passive: true });

    sidebar.querySelectorAll("a, button").forEach((element) => {
      element.addEventListener("click", persistSidebarScroll);
    });

    window.addEventListener("beforeunload", persistSidebarScroll);
  }

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
        window.showAlert("Passwords do not match!", "error");
        confirmPassword.focus();
      }
    });
  }



  const imageUploadForms = document.querySelectorAll(".image-upload-form");
  imageUploadForms.forEach((form) => {
    const fileInput = form.querySelector(".image-upload-input");
    const previewImage = form.querySelector(".image-preview");
    const previewWrap = form.querySelector(".user-avatar-preview");
    const previewFallback = previewWrap?.querySelector("span");
    const removeCheckbox = form.querySelector(".remove-image-checkbox");
    if (!fileInput || !previewWrap) return;

    const initialPreviewSrc = previewImage?.getAttribute("src") || "";

    const resetPreview = () => {
      fileInput.value = "";
      if (previewImage && initialPreviewSrc) {
        previewImage.setAttribute("src", initialPreviewSrc);
        previewImage.classList.remove("d-none");
      } else if (previewImage) {
        previewImage.setAttribute("src", "");
        previewImage.classList.add("d-none");
      }
      if (previewFallback) {
        previewFallback.classList.toggle("d-none", Boolean(previewImage && (initialPreviewSrc || previewImage.getAttribute("src"))));
      }
    };

    if (removeCheckbox) {
      removeCheckbox.addEventListener("change", () => {
        if (removeCheckbox.checked) {
          fileInput.value = "";
          if (previewImage) {
            previewImage.setAttribute("src", "");
            previewImage.classList.add("d-none");
          }
          if (previewFallback) {
            previewFallback.classList.remove("d-none");
          }
        }
      });
    }

    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (!file) {
        resetPreview();
        return;
      }

      if (!file.type.startsWith("image/")) {
        window.showAlert("Please choose a valid image file.", "error");
        resetPreview();
        return;
      }

      if (file.size > 2 * 1024 * 1024) {
        window.showAlert("Please choose an image under 2 MB.", "error");
        resetPreview();
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        if (previewImage) {
          previewImage.setAttribute("src", result);
          previewImage.classList.remove("d-none");
        }
        if (previewFallback) {
          previewFallback.classList.add("d-none");
        }
        if (removeCheckbox) {
          removeCheckbox.checked = false;
        }
      };
      reader.onerror = () => {
        window.showAlert("Unable to read the selected image.", "error");
        resetPreview();
      };
      reader.readAsDataURL(file);
    });
  });

  // Resolve datalist-based student search to a hidden user_id value.
  const studentPickers = document.querySelectorAll(".student-picker");
  studentPickers.forEach((form) => {
    const fieldSelect = form.querySelector(".student-search-field");
    const searchInput = form.querySelector(".student-search-input");
    const hiddenInput = form.querySelector(".student-id-input");
    if (!searchInput || !hiddenInput || !searchInput.list) return;

    const allOptions = Array.from(searchInput.list.options).map((item) => ({
      id: item.dataset.id || "",
      active: item.dataset.active === "true",
      labId: item.dataset.labId || "",
      name: item.dataset.name || "",
      email: item.dataset.email || "",
      enrollment: item.dataset.enrollment || "",
    }));

    const getDisplayValue = (option, field) => {
      if (field === "email") return option.email;
      if (field === "enrollment") return option.enrollment || "";
      return option.name ? `${option.name}${option.enrollment ? ` | ${option.enrollment}` : ""}` : "";
    };

    const renderStudentOptions = (filteredOptions = allOptions) => {
      const field = fieldSelect?.value || "name";
      const datalist = searchInput.list;
      datalist.innerHTML = "";

      filteredOptions.forEach((optionData) => {
        const option = document.createElement("option");
        option.value = getDisplayValue(optionData, field);
        option.dataset.id = optionData.id;
        option.dataset.active = optionData.active ? "true" : "false";
        option.dataset.labId = optionData.labId;
        option.dataset.name = optionData.name;
        option.dataset.email = optionData.email;
        option.dataset.enrollment = optionData.enrollment;
        datalist.appendChild(option);
      });

      searchInput.value = "";
      hiddenInput.value = "";
    };

    const syncStudentId = () => {
      const option = Array.from(searchInput.list.options).find(
        (item) => item.value === searchInput.value
      );
      hiddenInput.value = option ? option.dataset.id || "" : "";
    };

    if (fieldSelect) {
      fieldSelect.addEventListener("change", () => {
        renderStudentOptions();
      });
    }

    searchInput.addEventListener("input", syncStudentId);
    searchInput.addEventListener("change", syncStudentId);

    form.addEventListener("submit", (e) => {
      syncStudentId();
      if (!hiddenInput.value) {
        e.preventDefault();
        window.showAlert("Please select a student from the search list.", "error");
        searchInput.focus();
      }
    });

    renderStudentOptions();
  });

  const assistantStudentDataNode = document.getElementById("assistantStudentData");
  const assistantStudents = assistantStudentDataNode
    ? JSON.parse(assistantStudentDataNode.textContent || "[]")
    : [];

  const rankStudentsBySearch = (students, typedValue) =>
    students
      .map((student) => {
        const fields = [
          (student.name || "").toLowerCase(),
          (student.email || "").toLowerCase(),
          (student.enrollment || "").toLowerCase(),
        ];

        const bestIndex = typedValue
          ? Math.min(
              ...fields
                .map((field) => field.indexOf(typedValue))
                .filter((index) => index >= 0)
            )
          : 0;

        const matches = !typedValue || Number.isFinite(bestIndex);

        return {
          student,
          matches,
          bestIndex: Number.isFinite(bestIndex) ? bestIndex : Number.MAX_SAFE_INTEGER,
          startsWith: typedValue
            ? fields.some((field) => field.startsWith(typedValue))
            : false,
        };
      })
      .filter((item) => item.matches)
      .sort((a, b) => {
        if (!typedValue) {
          return (a.student.name || "").localeCompare(b.student.name || "");
        }

        if (a.startsWith !== b.startsWith) {
          return a.startsWith ? -1 : 1;
        }

        if (a.bestIndex !== b.bestIndex) {
          return a.bestIndex - b.bestIndex;
        }

        return (a.student.name || "").localeCompare(b.student.name || "");
      })
      .map((item) => item.student);

  const liveStudentSelectForms = document.querySelectorAll(".live-student-select-form");
  liveStudentSelectForms.forEach((form) => {
    const liveSearchInput = form.querySelector(".student-live-search");
    const studentSelect = form.querySelector(".student-select");
    if (!liveSearchInput || !studentSelect) return;

    const sourceId = form.dataset.studentSource || "assistantStudentData";
    const sourceNode = document.getElementById(sourceId);
    const availableStudents = sourceNode
      ? JSON.parse(sourceNode.textContent || "[]")
      : assistantStudents;
    const studentMode = form.dataset.studentMode || "all";

    // Robust, simple filtering system for student dropdown
    const renderStudentOptions = () => {
      const typedValue = (liveSearchInput.value || "").trim().toLowerCase();
      let visibleStudents = availableStudents;
      if (typedValue) {
        visibleStudents = availableStudents.filter(student => {
          return [student.name, student.email, student.enrollment_no, student.department]
            .filter(Boolean)
            .some(field => field.toLowerCase().includes(typedValue));
        });
      }
      studentSelect.innerHTML = "";
      if (visibleStudents.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No matching students";
        studentSelect.appendChild(option);
      } else {
        visibleStudents.forEach((student) => {
          const option = document.createElement("option");
          option.value = student.id;
          option.textContent = `${student.name} | ${student.enrollment_no || "-"} | ${student.email}`;
          studentSelect.appendChild(option);
        });
        studentSelect.selectedIndex = 0;
      }
    };

    liveSearchInput.addEventListener("input", renderStudentOptions);
    renderStudentOptions();
  });

  const violationForms = document.querySelectorAll(".violation-form");
  violationForms.forEach((form) => {
    const caseSelect = form.querySelector(".violation-case-select");
    const labSelect = form.querySelector(".violation-lab-select");
    const labInput = form.querySelector('input[name="lab_id"]');
    const liveSearchInput = form.querySelector(".student-live-search");
    const studentSelect = form.querySelector(".student-select");
    if (!caseSelect || !liveSearchInput || !studentSelect) {
      return;
    }

    const sourceId = form.dataset.studentSource || "assistantStudentData";
    const sourceNode = document.getElementById(sourceId);
    const availableStudents = sourceNode
      ? JSON.parse(sourceNode.textContent || "[]")
      : assistantStudents;

    const getVisibleStudents = () => {
      const caseType = caseSelect.value;
      const selectedLabId = labSelect?.value || labInput?.value || "";

      return availableStudents.filter((student) => {
        if (caseType === "missing_entry") {
          return !student.active;
        }

        if (caseType === "false_entry") {
          if (!student.active) return false;
          if (selectedLabId) {
            return String(student.labId) === String(selectedLabId);
          }
          return true;
        }

        return true;
      });
    };

    const renderStudentOptions = () => {
      const typedValue = (liveSearchInput.value || "").trim().toLowerCase();
      const visibleStudents = rankStudentsBySearch(getVisibleStudents(), typedValue);

      studentSelect.innerHTML = "";
      visibleStudents.forEach((student) => {
        const option = document.createElement("option");
        option.value = student.id;
        option.textContent = `${student.name} | ${student.enrollment || "-"} | ${student.email}`;
        studentSelect.appendChild(option);
      });

      if (studentSelect.options.length > 0) {
        studentSelect.selectedIndex = 0;
      } else {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No matching students";
        studentSelect.appendChild(option);
      }
    };

    caseSelect.addEventListener("change", () => {
      liveSearchInput.value = "";
      renderStudentOptions();
    });
    if (labSelect) {
      labSelect.addEventListener("change", () => {
        liveSearchInput.value = "";
        renderStudentOptions();
      });
    }
    liveSearchInput.addEventListener("input", renderStudentOptions);

    renderStudentOptions();
  });

  const auditActionFilters = document.querySelectorAll(".audit-action-filter");
  auditActionFilters.forEach((filter) => {
    const input = filter.querySelector(".audit-action-input");
    const label = filter.querySelector(".audit-action-label");
    const triggerIcon = filter.querySelector(".audit-action-trigger .audit-action-icon");
    const triggerIconGlyph = triggerIcon?.querySelector("i");
    const options = filter.querySelectorAll(".audit-action-option");
    if (!input || !label || !triggerIcon || !triggerIconGlyph || !options.length) return;

    options.forEach((option) => {
      option.addEventListener("click", () => {
        input.value = option.dataset.value || "";
        label.textContent = option.dataset.label || "All actions";

        triggerIcon.className = `audit-action-icon ${option.dataset.tone || "all"}`;
        triggerIconGlyph.className = `bi ${option.dataset.icon || "bi-stars"}`;

        options.forEach((item) => item.classList.remove("active"));
        option.classList.add("active");
      });
    });
  });

  const filterGroups = document.querySelectorAll(".filter-group");
  filterGroups.forEach((group) => {
    const controls = group.querySelectorAll("[data-filter-key]");
    const scope = group.parentElement;
    const targets = scope.querySelectorAll(".filter-targets .filter-item");
    if (!controls.length || !targets.length) return;

    const applyFilters = () => {
      targets.forEach((target) => {
        let visible = true;

        controls.forEach((control) => {
          const key = control.dataset.filterKey;
          const value = (control.value || "").trim().toLowerCase();
          if (!value) return;

          if (key === "text") {
            const haystack = (target.dataset.filterText || "").toLowerCase();
            if (!haystack.includes(value)) visible = false;
            return;
          }

          const datasetKey = `filter${key.charAt(0).toUpperCase()}${key.slice(1)}`;
          const targetValue = (target.dataset[datasetKey] || "").toLowerCase();
          if (targetValue !== value) visible = false;
        });

        target.style.display = visible ? "" : "none";
      });
    };

    controls.forEach((control) => {
      control.addEventListener("input", applyFilters);
      control.addEventListener("change", applyFilters);
    });
  });
});
