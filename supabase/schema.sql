-- ==========================================
-- EVENT QR MANAGEMENT PLATFORM DATABASE SCHEMA
-- ==========================================

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. EVENT SETTINGS TABLE
-- Tracks configuration for the event. Design supports multiple events (future-proofing).
CREATE TABLE IF NOT EXISTS event_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name TEXT NOT NULL,
    qr_prefix TEXT NOT NULL UNIQUE,
    starting_number INTEGER NOT NULL DEFAULT 1,
    default_max_usage INTEGER NOT NULL DEFAULT 1,
    description TEXT,
    logo_url TEXT,
    venue TEXT,
    event_date TIMESTAMP WITH TIME ZONE,
    contact_details TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for scanning active events
CREATE INDEX IF NOT EXISTS idx_event_settings_active ON event_settings(is_active);

-- 2. USER PROFILES TABLE
-- Extends Supabase auth.users to store roles and status.
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_login_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

-- 3. QR CODES TABLE
-- Holds the QR information. Lookups are done by secure_token.
CREATE TABLE IF NOT EXISTS qr_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qr_id TEXT NOT NULL UNIQUE, -- e.g., "JUBICON-0001"
    secure_token TEXT NOT NULL UNIQUE, -- Cryptographically secure token
    event_id UUID NOT NULL REFERENCES event_settings(id) ON DELETE CASCADE,
    current_usage INTEGER NOT NULL DEFAULT 0,
    max_usage INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'Unused' CHECK (status IN ('Unused', 'Partially Used', 'Fully Used', 'Disabled')),
    description TEXT,
    version INTEGER NOT NULL DEFAULT 1, -- Optimistic locking support
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_scanned_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_qr_codes_token ON qr_codes(secure_token);
CREATE INDEX IF NOT EXISTS idx_qr_codes_qr_id ON qr_codes(qr_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_status ON qr_codes(status);

-- 4. SCAN HISTORY TABLE
-- Records every scan increment.
CREATE TABLE IF NOT EXISTS scan_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qr_code_id UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
    qr_id TEXT NOT NULL,
    scanned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    staff_name TEXT,
    action TEXT NOT NULL DEFAULT 'scan_increment',
    previous_usage INTEGER NOT NULL,
    new_usage INTEGER NOT NULL,
    device_info TEXT,
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scan_history_qr_id ON scan_history(qr_id);
CREATE INDEX IF NOT EXISTS idx_scan_history_staff ON scan_history(scanned_by);

-- 5. AUDIT LOGS TABLE
-- Records administrator and authentication events for accountability.
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL CHECK (category IN ('auth_event', 'scan_event', 'admin_edit', 'config_change')),
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    actor_name TEXT,
    action TEXT NOT NULL, -- e.g., 'login', 'logout', 'reset_usage', 'disable_qr', 'update_config'
    target_id TEXT, -- ID of the QR, staff username, or config item
    details JSONB, -- Context of change (e.g. {previous_value: 3, new_value: 5})
    ip_address TEXT,
    device_info TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON audit_logs(category);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);


-- ==========================================
-- AUTOMATIC TRIGGERS & PROCEDURES
-- ==========================================

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_event_settings_modtime BEFORE UPDATE ON event_settings FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_profiles_modtime BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_qr_codes_modtime BEFORE UPDATE ON qr_codes FOR EACH ROW EXECUTE FUNCTION update_modified_column();


-- Trigger to dynamically update status based on usage when updated, if it is not Disabled
CREATE OR REPLACE FUNCTION update_qr_status_on_usage()
RETURNS TRIGGER AS $$
BEGIN
    -- If the QR code is disabled, keep it disabled
    IF NEW.status = 'Disabled' THEN
        RETURN NEW;
    END IF;

    -- If status was changed from Disabled to something else, or usage changes:
    IF NEW.current_usage = 0 THEN
        NEW.status := 'Unused';
    ELSIF NEW.current_usage >= NEW.max_usage THEN
        NEW.status := 'Fully Used';
    ELSE
        NEW.status := 'Partially Used';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_qr_status_trigger
BEFORE UPDATE OF current_usage, max_usage, status ON qr_codes
FOR EACH ROW
EXECUTE FUNCTION update_qr_status_on_usage();


-- ==========================================
-- ATOMIC TRANSACTION STORED PROCEDURES (RPC)
-- ==========================================

-- 1. ATOMIC SCAN INCREMENT (Staff Check-in)
-- Executed inside a row-level write lock to prevent race conditions.
CREATE OR REPLACE FUNCTION increment_qr_usage(
    p_token TEXT,
    p_staff_id UUID,
    p_device_info TEXT,
    p_ip_address TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with creator privileges to write to logs/history
AS $$
DECLARE
    v_qr RECORD;
    v_staff RECORD;
    v_new_usage INTEGER;
    v_new_status TEXT;
    v_result JSONB;
BEGIN
    -- Lock the specific QR code row
    SELECT * INTO v_qr
    FROM qr_codes
    WHERE secure_token = p_token
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'QR code not found', 'errorCode', 'QR_NOT_FOUND');
    END IF;

    IF v_qr.status = 'Disabled' THEN
        RETURN jsonb_build_object('success', false, 'message', 'This QR code is disabled.', 'errorCode', 'QR_DISABLED');
    END IF;

    IF v_qr.current_usage >= v_qr.max_usage THEN
        RETURN jsonb_build_object('success', false, 'message', 'This QR code has reached its usage limit.', 'errorCode', 'LIMIT_REACHED');
    END IF;

    -- Fetch staff profile
    SELECT * INTO v_staff
    FROM profiles
    WHERE id = p_staff_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Staff profile not found', 'errorCode', 'STAFF_NOT_FOUND');
    END IF;

    IF v_staff.status = 'disabled' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Staff account is disabled.', 'errorCode', 'STAFF_DISABLED');
    END IF;

    -- Calculations
    v_new_usage := v_qr.current_usage + 1;
    
    -- Update QR code usage and let trigger compute status
    UPDATE qr_codes
    SET 
        current_usage = v_new_usage,
        updated_at = now(),
        last_scanned_at = now(),
        version = version + 1
    WHERE id = v_qr.id;

    -- Insert into scan history
    INSERT INTO scan_history (
        qr_code_id,
        qr_id,
        scanned_by,
        staff_name,
        action,
        previous_usage,
        new_usage,
        device_info,
        ip_address
    ) VALUES (
        v_qr.id,
        v_qr.qr_id,
        v_staff.id,
        v_staff.name,
        'scan_increment',
        v_qr.current_usage,
        v_new_usage,
        p_device_info,
        p_ip_address
    );

    -- Return updated info
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Scan recorded successfully.',
        'data', jsonb_build_object(
            'qr_id', v_qr.qr_id,
            'previous_usage', v_qr.current_usage,
            'new_usage', v_new_usage,
            'max_usage', v_qr.max_usage,
            'status', CASE WHEN v_new_usage >= v_qr.max_usage THEN 'Fully Used' ELSE 'Partially Used' END
        )
    );
END;
$$;


-- 2. ATOMIC ADMIN MODIFY QR
-- Performs administrative changes to a QR code and logs to audit trail.
CREATE OR REPLACE FUNCTION admin_modify_qr(
    p_qr_id TEXT,
    p_actor_id UUID,
    p_action TEXT, -- 'increase', 'decrease', 'reset', 'change_max', 'toggle_disable', 'edit_desc'
    p_param_val TEXT, -- Value to change or adjust (e.g. new max limit, or new description)
    p_device_info TEXT,
    p_ip_address TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_qr RECORD;
    v_actor RECORD;
    v_old_usage INTEGER;
    v_new_usage INTEGER;
    v_old_max INTEGER;
    v_new_max INTEGER;
    v_old_status TEXT;
    v_new_status TEXT;
    v_old_desc TEXT;
    v_new_desc TEXT;
    v_details JSONB;
BEGIN
    -- Fetch actor profile
    SELECT * INTO v_actor FROM profiles WHERE id = p_actor_id;
    IF NOT FOUND OR v_actor.role != 'admin' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Unauthorized. Administrator access required.', 'errorCode', 'UNAUTHORIZED');
    END IF;

    -- Fetch and lock the QR code
    SELECT * INTO v_qr FROM qr_codes WHERE qr_id = p_qr_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'QR code not found.', 'errorCode', 'QR_NOT_FOUND');
    END IF;

    v_old_usage := v_qr.current_usage;
    v_new_usage := v_qr.current_usage;
    v_old_max := v_qr.max_usage;
    v_new_max := v_qr.max_usage;
    v_old_status := v_qr.status;
    v_new_status := v_qr.status;
    v_old_desc := v_qr.description;
    v_new_desc := v_qr.description;

    -- Process action
    IF p_action = 'increase' THEN
        IF v_old_usage >= v_old_max THEN
            RETURN jsonb_build_object('success', false, 'message', 'Cannot increase usage beyond the maximum limit.', 'errorCode', 'LIMIT_EXCEEDED');
        END IF;
        v_new_usage := v_old_usage + 1;
        v_details := jsonb_build_object('previous_usage', v_old_usage, 'new_usage', v_new_usage);

    ELSIF p_action = 'decrease' THEN
        IF v_old_usage <= 0 THEN
            RETURN jsonb_build_object('success', false, 'message', 'Cannot decrease usage below zero.', 'errorCode', 'LIMIT_EXCEEDED');
        END IF;
        v_new_usage := v_old_usage - 1;
        v_details := jsonb_build_object('previous_usage', v_old_usage, 'new_usage', v_new_usage);

    ELSIF p_action = 'reset' THEN
        v_new_usage := 0;
        v_details := jsonb_build_object('previous_usage', v_old_usage, 'new_usage', v_new_usage);

    ELSIF p_action = 'change_max' THEN
        v_new_max := p_param_val::INTEGER;
        IF v_new_max < v_old_usage THEN
            RETURN jsonb_build_object('success', false, 'message', 'Maximum usage cannot be less than the current usage.', 'errorCode', 'INVALID_PARAM');
        END IF;
        v_details := jsonb_build_object('previous_max', v_old_max, 'new_max', v_new_max);

    ELSIF p_action = 'toggle_disable' THEN
        IF v_old_status = 'Disabled' THEN
            -- Recalculate status based on current usage
            IF v_old_usage = 0 THEN
                v_new_status := 'Unused';
            ELSIF v_old_usage >= v_old_max THEN
                v_new_status := 'Fully Used';
            ELSE
                v_new_status := 'Partially Used';
            END IF;
        ELSE
            v_new_status := 'Disabled';
        END IF;
        v_details := jsonb_build_object('previous_status', v_old_status, 'new_status', v_new_status);

    ELSIF p_action = 'edit_desc' THEN
        v_new_desc := p_param_val;
        v_details := jsonb_build_object('previous_description', v_old_desc, 'new_description', v_new_desc);

    ELSE
        RETURN jsonb_build_object('success', false, 'message', 'Unknown admin action.', 'errorCode', 'INVALID_ACTION');
    END IF;

    -- Apply modifications
    UPDATE qr_codes
    SET
        current_usage = v_new_usage,
        max_usage = v_new_max,
        status = v_new_status,
        description = v_new_desc,
        updated_at = now()
    WHERE id = v_qr.id;

    -- Add scan history record if the usage changed
    IF v_new_usage != v_old_usage THEN
        INSERT INTO scan_history (
            qr_code_id,
            qr_id,
            scanned_by,
            staff_name,
            action,
            previous_usage,
            new_usage,
            device_info,
            ip_address
        ) VALUES (
            v_qr.id,
            v_qr.qr_id,
            v_actor.id,
            v_actor.name,
            'admin_' || p_action,
            v_old_usage,
            v_new_usage,
            p_device_info,
            p_ip_address
        );
    END IF;

    -- Log admin audit entry
    INSERT INTO audit_logs (
        category,
        actor_id,
        actor_name,
        action,
        target_id,
        details,
        ip_address,
        device_info
    ) VALUES (
        'admin_edit',
        v_actor.id,
        v_actor.name,
        p_action,
        p_qr_id,
        v_details,
        p_ip_address,
        p_device_info
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'QR code updated successfully.',
        'data', jsonb_build_object(
            'qr_id', p_qr_id,
            'current_usage', v_new_usage,
            'max_usage', v_new_max,
            'status', v_new_status,
            'description', v_new_desc
        )
    );
END;
$$;
