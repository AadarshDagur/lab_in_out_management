# Task Tracker — 12 Major Feature Changes

## Phase 1: Database & Models (Foundation)
- [ ] Install socket.io dependency
- [ ] Update schema.sql with new tables/columns
- [ ] Add bootstrap migrations in app.js
- [ ] Create models: violationRequestModel.js, auditLogModel.js
- [ ] Update userModel.js (can_view_statistics, dual role)
- [ ] Update entryModel.js (locked violations)
- [ ] Update sessionModel.js (custom date range, visit counts)
- [ ] Create exportService.js

## Phase 2: Middleware & Auth
- [ ] Update auth middleware (dual role support, can_view_statistics)
- [ ] Update authController.js (dual role login, activeRole)

## Phase 3: WebSocket Setup
- [ ] Set up socket.io in app.js
- [ ] Create WebSocket event handlers for live sessions

## Phase 4: Controllers
- [x] Update statisticsController.js (custom date range)
- [x] Update sessionController.js (violation requests, exports, locked violations)
- [x] Update dashboardController.js (admin directory, live sessions, exports, most-visited sort)
- [x] Update userController.js (can_view_statistics, dual role)
- [x] Create auditController.js
- [x] Instrument all controllers with audit logging

## Phase 5: Routes
- [x] Update sessionRoutes.js
- [x] Update adminRoutes.js (logs, directory, violation requests)
- [x] Update statisticsRoutes.js (permission check)
- [x] Update dashboardRoutes.js (exports)
- [x] Update authRoutes.js (switch role)

## Phase 6: Views
- [ ] Update navbar.ejs (switch role, audit logs, pending requests, directory for admin)
- [ ] Update assistant.ejs (live dashboard, clock, WebSocket, export buttons, locked violations)
- [ ] Update statistics/index.ejs (custom date range)
- [ ] Update editUserModal.ejs (dual role, can_view_statistics)
- [ ] Update student-detail.ejs (locked violations, export)
- [ ] Update labs/show.ejs (authorized history button)
- [ ] Update lab-history.ejs (export buttons)
- [ ] Update users/index.ejs (dual role option)
- [ ] Update admin.ejs (pending requests count, directory link)
- [ ] Create admin/violation-requests.ejs
- [ ] Create admin/directory.ejs
- [ ] Create admin/logs.ejs
- [ ] Update student.ejs (most visited sort)

## Phase 7: Verification
- [ ] Test all features via browser
