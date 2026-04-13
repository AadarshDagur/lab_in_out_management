# Lab In/Out Management System

A streamlined lab access and presence management system for IIT Ropar with role-based workflows for students, lab assistants, and admins. 

Tech stack: Node.js, Express, PostgreSQL, EJS, Bootstrap

## Features

- **Simplified Check-In/Out:** Students can easily check into and out of labs (no seat assignments or purpose tracking needed, maximizing speed).
- **Assistant Management:** Lab assistants can manage active sessions, check out students who forgot, and monitor current lab occupancy.
- **Violation Tracking:** Assistants can mark students for violations (e.g., missing entry, false entry) with automatic suspensions based on system limits.
- **Admin Dashboard:** Admins can manage labs, users, system settings (like violation limits), and view platform-wide analytics.
- **History & Reports:** Session history available for students, and detailed lab history/daily reports available for assistants.
- **Password Reset:** Secure self-service password reset flow via email.

## Roles

- **Student:** Check in, check out, view active session, view personal session history, view own violations.
- **Assistant:** View active lab occupancy, manage ongoing sessions, check out students, mark violations, view lab history.
- **Admin:** Add/manage labs, oversee user accounts, configure system settings (violation limits, etc.), view analytical dashboards.

## Project Structure

```text
lab_in_out_management/
|- app.js
|- config/
|- controllers/
|- db/
|- middleware/
|- models/
|- public/
|- routes/
|- views/
|- .env.example
|- package.json
```

## Setup

1. Install dependencies

```bash
npm install
```

2. Create the PostgreSQL database

```bash
createdb lab_management
```

3. Run the schema

```bash
psql -d lab_management -f db/schema.sql
```

4. Create your environment file

Linux/macOS:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

5. Update `.env` with your database, session, and SMTP values

6. Start the app

```bash
npm run dev
```

Open `http://localhost:3000`

## Notes

- The app auto-creates required support tables such as session storage, password reset tokens, and system settings at startup.
- Admin accounts are managed by admins from the user management page.
- The last active admin cannot be deleted, demoted, or deactivated.
