# Lab Management System — 12 Major Feature Changes

## Overview

Implementing 12 significant enhancements across the full stack: database schema, models, controllers, routes, middleware, and views. These changes affect roles, permissions, real-time behavior, audit logging, and data export.

---

## Open Questions

> [!IMPORTANT]
> **Q1: Dual Role Login** — For students who are also assistants (feature #2), should they select which role to log in as at login time (like currently), or should they automatically get a combined dashboard that shows both student and assistant features?
Ans: can login as either role but in his navbar there will be option of switch role




> [!IMPORTANT]
> **Q2: Violation Removal Request (feature #3)** — When an assistant requests removal, should the admin see it in a new "Pending Requests" section on their dashboard or in a separate page? My plan: Add a "Pending Requests" section to admin dashboard + a nav link.
Ans: Pending Requests in navbar

> [!IMPORTANT]
> **Q3: Live Dashboard Polling Interval (#4)** — How frequently should the live dashboard auto-refresh? My plan: Every 5 seconds via AJAX polling (no WebSocket needed for this scale). This keeps the stack simple.
Ans: use WebSocket (refresh really fast as i also need a real time clock on live sessions dashboard)

> [!IMPORTANT]
> **Q4: Export buttons everywhere (#10)** — Should the export buttons on live sessions, student directory, and lab history support all 3 formats (CSV, Excel, PDF) like statistics already does? My plan: Yes, all 3 formats everywhere.
Ans: Yes.
---

## Proposed Changes

### 1. Custom Date Range in Statistics (replacing day/week/month)

Replace the fixed "Today / This Week / This Month" period selector with a **custom date range picker** (from → to).

#### [MODIFY] [sessionModel.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/models/sessionModel.js)
- Modify `getLabUtilization(period)` → `getLabUtilization(startDate, endDate)` accepting date parameters
- Modify `getHistoricalOverfillStats(period)` → `getHistoricalOverfillStats(startDate, endDate)`
- Modify `getGlobalStatistics(days)` → `getGlobalStatistics(startDate, endDate)`
- Modify `getLabStatistics(days)` → `getLabStatistics(startDate, endDate)`
- Modify `getBatchUtilization(labId)` → `getBatchUtilization(labId, startDate, endDate)`

#### [MODIFY] [statisticsController.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/controllers/statisticsController.js)
- Parse `req.query.from` and `req.query.to` instead of `req.query.period`
- Default: from = today, to = today
- Pass dates to all model methods and export

#### [MODIFY] [index.ejs (statistics)](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/views/statistics/index.ejs)
- Replace period dropdown with two date inputs (From / To) and an "Apply" button
- Update AJAX calls to pass `from` and `to` instead of `period`

---

### 2. Dual Role: Student + Assistant

Allow a user to be both a student and an assistant simultaneously.

#### [MODIFY] [schema.sql](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/db/schema.sql)
- Update the `role` CHECK constraint to also allow `'student+assistant'`

#### [MODIFY] [app.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/app.js)
- Add a bootstrap migration `ensureDualRoleSupport()` that ALTERs the role CHECK constraint

#### [MODIFY] [auth.js (middleware)](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/middleware/auth.js)
- Update `authorizeRoles()` to check if user's role contains the required role (e.g., `student+assistant` passes both `student` and `assistant` checks)
- Update `disallowRoles()` similarly
- In `setLocals`, store the **active role** in session (the role they selected at login)

#### [MODIFY] [authController.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/controllers/authController.js)
- When logging in, if user role is `student+assistant`, accept either `student` or `assistant` as the login role
- Store `activeRole` in session alongside `role`

#### [MODIFY] [editUserModal.ejs](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/views/partials/editUserModal.ejs)
- Add `student+assistant` as a role option in Change Role dropdown

#### [MODIFY] [userController.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/controllers/userController.js)
- Accept `student+assistant` as a valid role in `changeRole`

#### [MODIFY] [users/index.ejs](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/views/users/index.ejs)
- Add `student+assistant` to role dropdown in Add User form

#### [MODIFY] [login.ejs](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/views/auth/login.ejs)
- No changes needed — user selects their active role at login and the controller validates

---

### 3. Violation Removal Request → Forward to Admin

Instead of assistants directly removing violations, they submit a **removal request** that goes to admin for approval.

#### [MODIFY] [schema.sql](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/db/schema.sql)
- Add `violation_removal_requests` table: `id, violation_id, requested_by, reason, status (pending/approved/rejected), reviewed_by, created_at, reviewed_at`

#### [MODIFY] [app.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/app.js)
- Add bootstrap migration `ensureViolationRemovalRequestsTable()`

#### [NEW] [models/violationRequestModel.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/models/violationRequestModel.js)
- `create({ violationId, requestedBy, reason })`
- `findPending()`
- `approve(requestId, reviewedBy)` — actually calls `Entry.removeViolation` + updates request status
- `reject(requestId, reviewedBy)`

#### [MODIFY] [sessionController.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/controllers/sessionController.js)
- `removeViolation` for assistant role: instead of directly removing, create a removal request
- `removeViolation` for admin role: keep direct removal
- Add `requestViolationRemoval` action (assistant submits request)
- Add `approveRemoval`, `rejectRemoval` actions (admin)

#### [MODIFY] [sessionRoutes.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/routes/sessionRoutes.js)
- Add `POST /sessions/request-violation-removal/:id` for assistants
- Keep `POST /sessions/remove-violation/:id` for admin only

#### [MODIFY] [adminRoutes.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/routes/adminRoutes.js)
- Add `GET /admin/violation-requests` — list pending requests
- Add `POST /admin/violation-requests/:id/approve`
- Add `POST /admin/violation-requests/:id/reject`

#### [NEW] [views/admin/violation-requests.ejs](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/views/admin/violation-requests.ejs)
- Page showing pending violation removal requests with approve/reject buttons

#### [MODIFY] [assistant.ejs (dashboard)](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/views/dashboard/assistant.ejs)
- Change "Remove" button to "Request Removal" with a reason input
- Show status of past requests

#### [MODIFY] [navbar.ejs](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/views/partials/navbar.ejs)
- Add "Violation Requests" link in admin nav with pending count badge

#### [MODIFY] [admin.ejs (dashboard)](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/views/dashboard/admin.ejs)
- Show pending request count in stat tiles

---

### 4. Live Dashboard (Auto-Refresh + Clock)

Make the assistant's live dashboard update automatically without page refresh, and add a real-time clock.

#### [NEW] [api/sessionsApi.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/api/sessionsApi.js)
- `GET /api/live-sessions` — returns all active sessions as JSON
- `GET /api/live-stats` — returns today stats as JSON

#### [MODIFY] [app.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/app.js)
- Register the new API routes

#### [MODIFY] [assistant.ejs (dashboard)](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/views/dashboard/assistant.ejs)
- Add a live clock widget showing date, hours, minutes, seconds (updated every second via JS)
- Add JavaScript polling that fetches `/api/live-sessions` every 5 seconds and re-renders the sessions table + stats in-place
- Preserve current search/filter state across refreshes

---

### 5. Live Dashboard Clock

Covered in #4 above — the clock will be a prominent element in the live sessions hero panel showing `DD MMM YYYY | HH:MM:SS` updating every second.

---

### 6. Per-Assistant Statistics/History Visibility Control

Not all assistants can see statistics/history by default. Admin toggles visibility per assistant in Edit User modal.

#### [MODIFY] [schema.sql](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/db/schema.sql)
- Add `can_view_statistics BOOLEAN DEFAULT FALSE` to users table

#### [MODIFY] [app.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/app.js)
- Add bootstrap migration `ensureCanViewStatisticsColumn()`

#### [MODIFY] [editUserModal.ejs](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/views/partials/editUserModal.ejs)
- Add a toggle/checkbox for "Can View Statistics & History" (shown only for assistant/student+assistant roles)

#### [MODIFY] [userController.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/controllers/userController.js)
- Handle `can_view_statistics` in update

#### [MODIFY] [userModel.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/models/userModel.js)
- Include `can_view_statistics` in findAll, findById, update

#### [MODIFY] [auth.js (middleware)](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/middleware/auth.js)
- Store `can_view_statistics` in session and res.locals

#### [MODIFY] [statisticsRoutes.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/routes/statisticsRoutes.js)
- Add middleware: admin always allowed; assistants only if `can_view_statistics === true`

#### [MODIFY] [navbar.ejs](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/views/partials/navbar.ejs)
- Only show "Statistics" link for assistants who have `can_view_statistics`

#### [MODIFY] [assistant.ejs (dashboard)](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/views/dashboard/assistant.ejs)
- Hide "statistics" section tab if user lacks permission

---

### 7. Admin Can See Student Directory

#### [MODIFY] [navbar.ejs](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/views/partials/navbar.ejs)
- Add "Student Directory" link in admin nav section

#### [MODIFY] [dashboardController.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/controllers/dashboardController.js)
- Add student directory data to admin dashboard when `section=directory`

#### [MODIFY] [sessionRoutes.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/routes/sessionRoutes.js)
- Allow admin to access `/sessions/student/:id` (add admin to authorizeRoles)

#### [NEW] [views/admin/directory.ejs](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/views/admin/directory.ejs)
- Student directory page for admin (similar to assistant's directory view)

#### [MODIFY] [adminRoutes.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/routes/adminRoutes.js)
- Add `GET /admin/directory` route

---

### 8. Lab History Button Visible to All Assistants, Works Only for Authorized

The "View History" button appears for all assistants in lab views, but only works for those with `can_view_statistics` permission. Others get an "unauthorized" popup.

#### [MODIFY] [labs/show.ejs](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/views/labs/show.ejs)
- Keep "View Full History" button visible for all assistants
- For unauthorized assistants, make it trigger a JS popup instead of navigating

#### [MODIFY] [sessionRoutes.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/routes/sessionRoutes.js)
- Add permission check middleware on `/sessions/lab/:id` — if assistant lacks `can_view_statistics`, redirect with flash error

#### [MODIFY] [assistant.ejs (dashboard)](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/views/dashboard/assistant.ejs)
- Same treatment for directory "View History" button

---

### 9. Student Dashboard Labs Sorted by Most Visited

#### [MODIFY] [sessionModel.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/models/sessionModel.js)
- Add `getVisitCountsByUser(userId)` — returns lab_id → visit_count map

#### [MODIFY] [dashboardController.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/controllers/dashboardController.js)
- In `studentDashboard`, fetch visit counts and sort `labs` array by most visited first

---

### 10. Export CSV/Excel/PDF Everywhere

Add export buttons to: live sessions, student directory, lab history, student detail.

#### [NEW] [services/exportService.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/services/exportService.js)
- Shared export utility: `exportToCSV(res, filename, headers, rows)`
- `exportToExcel(res, filename, sheetName, headers, rows)`
- `exportToPDF(res, filename, title, headers, rows)`

#### [MODIFY] [sessionController.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/controllers/sessionController.js)
- Add `exportLabHistory(req, res)` — export lab history in chosen format
- Add `exportStudentDetail(req, res)` — export student sessions + violations

#### [MODIFY] [dashboardController.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/controllers/dashboardController.js)
- Add `exportLiveSessions(req, res)` — export current active sessions
- Add `exportStudentDirectory(req, res)` — export student directory

#### [MODIFY] [sessionRoutes.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/routes/sessionRoutes.js)
- Add `GET /sessions/lab/:id/export`
- Add `GET /sessions/student/:id/export`

#### [MODIFY] [adminRoutes.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/routes/adminRoutes.js)
- Add `GET /admin/directory/export`

#### Add export dropdown buttons to these views:
- [assistant.ejs](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/views/dashboard/assistant.ejs) — live sessions & directory sections
- [lab-history.ejs](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/views/sessions/lab-history.ejs)
- [student-detail.ejs](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/views/sessions/student-detail.ejs)
- [admin/directory.ejs](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/views/admin/directory.ejs)

---

### 11. Admin Audit Logs (Permanent, Immutable)

A tamper-proof activity log for all admin actions.

#### [MODIFY] [schema.sql](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/db/schema.sql)
- Add `admin_audit_logs` table: `id SERIAL, user_id INT, action VARCHAR(100), target_type VARCHAR(50), target_id INT, details TEXT, ip_address VARCHAR(50), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
- **No UPDATE or DELETE operations ever performed on this table**

#### [MODIFY] [app.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/app.js)
- Add bootstrap migration `ensureAuditLogsTable()`

#### [NEW] [models/auditLogModel.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/models/auditLogModel.js)
- `log({ userId, action, targetType, targetId, details, ipAddress })` — INSERT only
- `findAll(limit, offset)` — SELECT for viewing
- `findByDateRange(from, to, limit, offset)` — filtered view
- **No update or delete methods**

#### [NEW] [controllers/auditController.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/controllers/auditController.js)
- `index(req, res)` — render audit logs page with pagination and date filter
- `exportLogs(req, res)` — export logs as CSV/Excel/PDF

#### [MODIFY] [adminRoutes.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/routes/adminRoutes.js)
- Add `GET /admin/logs` — audit log page
- Add `GET /admin/logs/export` — export

#### [NEW] [views/admin/logs.ejs](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/views/admin/logs.ejs)
- Read-only log viewer with search, date range filter, pagination

#### [MODIFY] [navbar.ejs](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/views/partials/navbar.ejs)
- Add "Audit Logs" link in admin nav

#### Instrument existing controllers to log actions:
- **authController**: log login/logout
- **userController**: log create, update, delete, role change, reactivate, bulk upload
- **labController**: log create, update, delete, status change
- **settingsController**: log settings changes
- **sessionController**: log violation approvals/removals

---

### 12. No Remove Button for Pre-Reactivation Violations

Violations that were marked before a student's account was reactivated should not have a "Remove" button.

#### [MODIFY] [schema.sql](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/db/schema.sql)
- Add `locked BOOLEAN DEFAULT FALSE` to `violation_logs` table

#### [MODIFY] [app.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/app.js)
- Add bootstrap migration for `locked` column

#### [MODIFY] [userModel.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/models/userModel.js)
- In `earlyReactivate()`, after resetting violation_count, mark all existing violations for that user as `locked = TRUE`

#### [MODIFY] [entryModel.js](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/models/entryModel.js)
- Include `locked` field in all violation queries
- `removeViolation` should refuse if violation is locked

#### [MODIFY] [student-detail.ejs](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/views/sessions/student-detail.ejs)
- Hide "Remove"/"Request Removal" button if `violation.locked === true`
- Show a tooltip/badge like "Locked — pre-reactivation"

#### [MODIFY] [assistant.ejs](file:///c:/Users/Adars/Desktop/DEP1/lab_in_out_management/views/dashboard/assistant.ejs)
- Same: hide removal option for locked violations

---

## Verification Plan

### Automated Tests
- Start the dev server with `npm run dev`
- Use browser subagent to test each feature:
  1. Statistics page with custom date range
  2. Create user with dual role, login as both roles
  3. Assistant requests violation removal → appears in admin panel → admin approves
  4. Open live dashboard → check in a student → verify new entry appears without refresh
  5. Verify clock is ticking on live dashboard
  6. Toggle `can_view_statistics` on assistant → verify stats/history access changes
  7. Login as admin → verify student directory is accessible
  8. Unauthorized assistant clicks "View History" → popup appears
  9. Student dashboard → verify labs ordered by most visited
  10. Test export buttons on all pages (CSV download)
  11. Verify audit logs page shows login + user modification entries
  12. Reactivate a suspended student → verify old violations show "Locked" with no remove button

### Manual Verification
- Verify that all existing functionality continues to work
- Check responsive layout on mobile viewport
