# Lab In/Out Management System

A lab access and presence management system for IIT Ropar with role-based workflows for students, lab assistants, and admins.

Tech stack: Node.js, Express, EJS, PostgreSQL

## Features

- Student self check-in and check-out
- Assistant handling for missing-entry and false-entry cases
- Violation tracking with automatic suspension based on system settings
- Admin management for labs, users, and violation limits
- Session history for students and lab history for assistants
- Password reset through email

## Roles

- Student: check in, check out, view own history, view own violations
- Assistant: manage lab entries, mark violations, check out students, view lab history
- Admin: manage labs, manage users, configure system settings

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
