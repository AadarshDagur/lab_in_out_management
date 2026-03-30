-- ============================================
-- Lab In/Out Management System - Database Schema
-- ============================================

-- Enable UUID extension (optional, we use SERIAL here)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop tables if they exist (for fresh setup)
DROP TABLE IF EXISTS lab_sessions CASCADE;
DROP TABLE IF EXISTS seats CASCADE;
DROP TABLE IF EXISTS violation_logs CASCADE;
DROP TABLE IF EXISTS password_reset_tokens CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;
DROP TABLE IF EXISTS labs CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS session CASCADE;

-- ============================================
-- 1. Users Table
-- ============================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'assistant', 'admin')),
    enrollment_no VARCHAR(50) UNIQUE,
    department VARCHAR(100),
    phone VARCHAR(15),
    profile_image TEXT,
    violation_count INT NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    suspended_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 2. Labs Table
-- ============================================
CREATE TABLE labs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    location VARCHAR(200),
    capacity INT NOT NULL DEFAULT 30,
    open_time TIME DEFAULT '08:00',
    close_time TIME DEFAULT '18:00',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 3. Seats Table
-- ============================================
CREATE TABLE seats (
    id SERIAL PRIMARY KEY,
    lab_id INT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
    seat_number VARCHAR(10) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(lab_id, seat_number)
);

-- ============================================
-- 4. Lab Sessions (Check-in / Check-out)
-- ============================================
CREATE TABLE lab_sessions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lab_id INT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
    seat_id INT REFERENCES seats(id) ON DELETE SET NULL,
    purpose VARCHAR(255),
    check_in_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    check_out_time TIMESTAMP,
    duration_minutes INT,
    checked_in_by INT REFERENCES users(id),  -- assistant who checked them in
    checked_out_by INT REFERENCES users(id), -- assistant who checked them out
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'auto_closed')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 5. System Settings
-- ============================================
CREATE TABLE system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value VARCHAR(255) NOT NULL
);

INSERT INTO system_settings (key, value)
VALUES ('violation_limit', '3');

-- ============================================
-- 6. Express Session Store Table
-- ============================================
CREATE TABLE session (
    sid VARCHAR NOT NULL COLLATE "default",
    sess JSON NOT NULL,
    expire TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (sid)
);

CREATE INDEX idx_session_expire ON session (expire);

-- ============================================
-- 7. Password Reset Tokens
-- ============================================
CREATE TABLE password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_prt_token ON password_reset_tokens(token_hash);
CREATE INDEX idx_prt_user ON password_reset_tokens(user_id);

-- ============================================
-- 8. Violation Logs
-- ============================================
CREATE TABLE violation_logs (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lab_id INT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
    marked_by INT REFERENCES users(id) ON DELETE SET NULL,
    note VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_violation_logs_created_at ON violation_logs(created_at DESC);

-- ============================================
-- Indexes for Performance
-- ============================================
CREATE INDEX idx_lab_sessions_user ON lab_sessions(user_id);
CREATE INDEX idx_lab_sessions_lab ON lab_sessions(lab_id);
CREATE INDEX idx_lab_sessions_status ON lab_sessions(status);
CREATE INDEX idx_lab_sessions_checkin ON lab_sessions(check_in_time);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_enrollment ON users(enrollment_no);
CREATE INDEX idx_seats_lab ON seats(lab_id);

-- ============================================
-- Seed: Default Admin User
-- Password: admin123 (bcrypt hash)
-- ============================================
INSERT INTO users (name, email, password_hash, role, enrollment_no, department, phone)
VALUES (
    'Admin',
    'admin@iitrpr.ac.in',
    '$2b$10$3u94Rz59m99zEl2TUQCyceev3zDJrKSiV1ymFOesWqU8pRhAhW0u.',
    'admin',
    'ADMIN001',
    'Computer Science',
    '0000000000'
);
