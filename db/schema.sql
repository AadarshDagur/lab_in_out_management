-- ============================================
-- Lab In/Out Management System - Database Schema
-- ============================================

-- Drop tables if they exist (for fresh setup)
DROP TABLE IF EXISTS violation_removal_requests CASCADE;
DROP TABLE IF EXISTS admin_audit_logs CASCADE;
DROP TABLE IF EXISTS lab_sessions CASCADE;
DROP TABLE IF EXISTS violation_logs CASCADE;
DROP TABLE IF EXISTS password_reset_tokens CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;
DROP TABLE IF EXISTS labs CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================
-- 1. Users Table
-- ============================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'assistant', 'admin', 'student+assistant')),
    enrollment_no VARCHAR(50) UNIQUE,
    department VARCHAR(100),
    phone VARCHAR(15),
    profile_image TEXT,
    violation_count INT NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    suspended_until TIMESTAMP,
    can_view_statistics BOOLEAN DEFAULT FALSE,
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
    open_time TIME DEFAULT '09:00',
    close_time TIME DEFAULT '21:00',
    is_active BOOLEAN DEFAULT TRUE,
    manual_inactive BOOLEAN DEFAULT FALSE,
    manual_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 3. Lab Sessions Table
-- ============================================
CREATE TABLE lab_sessions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lab_id INT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
    check_in_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    check_out_time TIMESTAMP,
    duration_minutes INT,
    checked_in_by INT REFERENCES users(id),
    checked_out_by INT REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'auto_closed')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 4. System Settings
-- ============================================
CREATE TABLE system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value VARCHAR(255) NOT NULL
);

INSERT INTO system_settings (key, value)
VALUES ('violation_limit', '3');

-- ============================================
-- 5. Password Reset Tokens
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
-- 6. Violation Logs
-- ============================================
CREATE TABLE violation_logs (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lab_id INT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
    marked_by INT REFERENCES users(id) ON DELETE SET NULL,
    note VARCHAR(255),
    locked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_violation_logs_created_at ON violation_logs(created_at DESC);

-- ============================================
-- 7. Violation Removal Requests
-- ============================================
CREATE TABLE violation_removal_requests (
    id SERIAL PRIMARY KEY,
    violation_id INT NOT NULL REFERENCES violation_logs(id) ON DELETE CASCADE,
    requested_by INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP
);

CREATE INDEX idx_violation_requests_status ON violation_removal_requests(status);

-- ============================================
-- 8. Admin Audit Logs (Permanent, Immutable)
-- ============================================
CREATE TABLE admin_audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    user_name VARCHAR(100),
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50),
    target_id INT,
    details TEXT,
    ip_address VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_created ON admin_audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_user ON admin_audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON admin_audit_logs(action);

-- ============================================
-- Indexes for Performance
-- ============================================
CREATE INDEX idx_lab_sessions_user ON lab_sessions(user_id);
CREATE INDEX idx_lab_sessions_lab ON lab_sessions(lab_id);
CREATE INDEX idx_lab_sessions_status ON lab_sessions(status);
CREATE INDEX idx_lab_sessions_checkin ON lab_sessions(check_in_time);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_enrollment ON users(enrollment_no);

-- ============================================
-- Seed: Default Admin User
-- Password: admin123 (bcrypt hash)
-- ============================================
INSERT INTO users (name, email, password_hash, role, enrollment_no, department, phone, can_view_statistics)
VALUES (
    'Admin',
    'admin@iitrpr.ac.in',
    '$2b$10$3u94Rz59m99zEl2TUQCyceev3zDJrKSiV1ymFOesWqU8pRhAhW0u.',
    'admin',
    'ADMIN001',
    'Computer Science',
    '0000000000',
    TRUE
);
