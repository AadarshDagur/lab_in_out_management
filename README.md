# Lab In/Out Management System

College Computer Lab In/Out Management System — Track student and lab assistant entry/exit with real-time dashboards, seat management, and reports.

**Tech Stack:** Node.js, Express, EJS, PostgreSQL

---

## Features

- **Authentication** — Register/login with role-based access (Student, Assistant, Admin)
- **Check-in / Check-out** — Students check into labs, system tracks time and seat
- **Live Dashboard** — Real-time occupancy per lab with seat map
- **Lab Management** — Admin CRUD for labs with auto-generated seats
- **Session History** — Personal and lab-wide session logs
- **Daily Reports** — Stats breakdown by lab, date, and usage

## Project Structure

```
lab_in_out_management/
├── app.js                  # Express entry point
├── config/db.js            # PostgreSQL connection
├── controllers/            # Route handlers
├── db/schema.sql           # Database schema + seed
├── middleware/auth.js       # Auth & role middleware
├── models/                 # Database models
├── public/                 # Static assets (CSS/JS)
├── routes/                 # Express routes
├── views/                  # EJS templates
├── .env.example            # Environment variables template
└── package.json
```

## Getting Started

### 1. Install dependencies

```bash
cd lab_in_out_management
npm install
```

### 2. Setup PostgreSQL database

Create a database and run the schema:

```bash
createdb lab_management
psql -d lab_management -f db/schema.sql
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your database credentials
```

### 4. Start the server

```bash
# Development (auto-restart on changes)
npm run dev

# Production
npm start
```

Visit **http://localhost:3000**

### Default Admin Login

| Email | Password |
|---|---|
| admin@iitrpr.ac.in | admin123 |

> **Important:** Change the admin password after first login.

## Roles

| Role | Capabilities |
|---|---|
| **Student** | Check-in/out, view own history, browse labs |
| **Assistant** | All student features + check out any student, view lab history |
| **Admin** | All features + manage labs, view reports, manage users |