-- ==============================================================================
-- AcademicPrep - Complete Schema & Live Data Migration
-- Target Project: ynqlfjoybxzrgczktrht (Shared safely alongside AMS tables)
-- Exported Live Records:
--   - 724 Students
--   - 43 Access PINs
--   - 2 Admin Credentials (9276@@Dollar / 9276@@AcademicPrep)
--   - 32 Cash Flow Transactions
--   - 3 Processed Payments
--   - 631 Student Mistakes
--   - 749 Student Sessions
--   - 182 Student Topic Progress Records
--   - 50 Weekly Exam Attempts
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

SET search_path = public, extensions;

-- 1. ENUMS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'education_level') THEN
        CREATE TYPE education_level AS ENUM
            ('JHS 1', 'JHS 2', 'JHS 3', 'SHS 1', 'SHS 2', 'SHS 3', 'UNIVERSITY');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pin_status') THEN
        CREATE TYPE pin_status AS ENUM ('ACTIVE', 'REDEEMED', 'REVOKED', 'EXPIRED');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_type') THEN
        CREATE TYPE transaction_type AS ENUM
            ('PIN_PURCHASE', 'SUBSCRIPTION_RENEWAL', 'MANUAL_CREDIT');
    END IF;
END $$;

-- 2. ACADEMICPREP TABLES
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number VARCHAR(20) NOT NULL UNIQUE,
    pin_hash TEXT NOT NULL DEFAULT '',
    full_name VARCHAR(120) NOT NULL DEFAULT 'Student',
    current_level education_level NOT NULL DEFAULT 'JHS 1',
    has_full_access BOOLEAN NOT NULL DEFAULT FALSE,
    access_type VARCHAR(20) NOT NULL DEFAULT 'Free Trial',
    access_expires_at TIMESTAMPTZ,
    completed_topic_ids TEXT[] NOT NULL DEFAULT '{}',
    topics_completed_count INTEGER NOT NULL DEFAULT 0,
    avg_score_percentage INTEGER NOT NULL DEFAULT 0,
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_students_phone ON public.students(phone_number);
CREATE INDEX IF NOT EXISTS idx_students_level ON public.students(current_level);

CREATE TABLE IF NOT EXISTS public.access_pins (
    id TEXT PRIMARY KEY DEFAULT ('pin-' || replace(gen_random_uuid()::text, '-', '')),
    pin_code VARCHAR(32) NOT NULL UNIQUE,
    batch_id VARCHAR(64) NOT NULL DEFAULT 'legacy',
    price_ghs NUMERIC(10, 2) NOT NULL DEFAULT 25.00,
    validity_days INTEGER NOT NULL DEFAULT 30,
    status pin_status NOT NULL DEFAULT 'ACTIVE',
    redeemed_by_student_phone VARCHAR(20),
    redeemed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_pins_code ON public.access_pins(pin_code);
CREATE INDEX IF NOT EXISTS idx_access_pins_batch ON public.access_pins(batch_id);
CREATE INDEX IF NOT EXISTS idx_access_pins_status ON public.access_pins(status);

CREATE TABLE IF NOT EXISTS public.student_topic_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    student_phone VARCHAR(20),
    topic_id VARCHAR(80) NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    best_score_percentage INTEGER NOT NULL DEFAULT 0,
    attempts_count INTEGER NOT NULL DEFAULT 0,
    last_studied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_topic_phone ON public.student_topic_progress(student_phone);
CREATE UNIQUE INDEX IF NOT EXISTS uq_progress_phone_topic
    ON public.student_topic_progress(student_phone, topic_id);

CREATE TABLE IF NOT EXISTS public.weekly_exam_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    student_phone VARCHAR(20),
    level education_level NOT NULL DEFAULT 'JHS 3',
    paper1_score INTEGER,
    paper1_total INTEGER,
    paper2_score INTEGER,
    paper2_total INTEGER,
    composite_total_percentage INTEGER,
    stanine_grade INTEGER,
    grade_remark TEXT,
    covered_topic_ids TEXT[],
    total_questions INTEGER,
    correct_answers INTEGER,
    score_percentage INTEGER,
    time_spent_seconds INTEGER,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weekly_exams_phone ON public.weekly_exam_attempts(student_phone);

CREATE TABLE IF NOT EXISTS public.student_mistakes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_phone VARCHAR(20) NOT NULL,
    topic_id VARCHAR(80) NOT NULL,
    subject_name VARCHAR(100),
    sub_concept VARCHAR(200),
    question_text TEXT,
    student_wrong_answer TEXT,
    correct_answer TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mistakes_phone ON public.student_mistakes(student_phone);

CREATE TABLE IF NOT EXISTS public.cash_flow_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference VARCHAR(64) NOT NULL UNIQUE,
    student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
    student_phone VARCHAR(20),
    amount_ghs NUMERIC(10, 2) NOT NULL DEFAULT 0,
    transaction_type transaction_type NOT NULL DEFAULT 'PIN_PURCHASE',
    payment_method VARCHAR(32) NOT NULL DEFAULT 'MOBILE_MONEY',
    pin_code_used VARCHAR(32),
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_flow_created ON public.cash_flow_transactions(created_at DESC);

CREATE TABLE IF NOT EXISTS public.student_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_student ON public.student_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON public.student_sessions(expires_at);

CREATE TABLE IF NOT EXISTS public.login_attempts (
    phone_number VARCHAR(20) PRIMARY KEY,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    first_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_until TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.processed_payments (
    reference VARCHAR(64) PRIMARY KEY,
    student_phone VARCHAR(20) NOT NULL,
    amount_pesewas INTEGER NOT NULL,
    channel VARCHAR(32),
    source VARCHAR(16) NOT NULL DEFAULT 'verify',
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admin_credentials (
    slot VARCHAR(16) PRIMARY KEY CHECK (slot IN ('primary', 'secondary')),
    pin_hash TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. SECURITY DEFINER FUNCTIONS (AcademicPrep)
CREATE OR REPLACE FUNCTION public.hash_student_pin(p_pin TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT crypt(p_pin, gen_salt('bf', 10));
$$;

CREATE OR REPLACE FUNCTION public.verify_student_pin(p_phone TEXT, p_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_hash TEXT;
BEGIN
    IF p_phone IS NULL OR p_pin IS NULL OR p_pin = '' THEN
        RETURN FALSE;
    END IF;

    SELECT pin_hash INTO v_hash
      FROM public.students
     WHERE phone_number = p_phone;

    IF NOT FOUND OR v_hash IS NULL OR v_hash = '' THEN
        RETURN FALSE;
    END IF;

    RETURN crypt(p_pin, v_hash) = v_hash;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_student_pin(p_phone TEXT, p_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_rows INTEGER;
BEGIN
    IF p_phone IS NULL OR p_pin IS NULL OR length(p_pin) < 4 THEN
        RETURN FALSE;
    END IF;

    UPDATE public.students
       SET pin_hash = crypt(p_pin, gen_salt('bf', 10)),
           updated_at = NOW()
     WHERE phone_number = p_phone;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_access_pin(p_pin_code TEXT, p_phone TEXT)
RETURNS TABLE (success BOOLEAN, message TEXT, validity_days INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_code TEXT := upper(btrim(coalesce(p_pin_code, '')));
    v_phone TEXT := btrim(coalesce(p_phone, ''));
    v_pin RECORD;
    v_days INTEGER;
    v_expiry TIMESTAMPTZ;
    v_existing TIMESTAMPTZ;
    v_student_id UUID;
BEGIN
    IF v_code = '' THEN
        RETURN QUERY SELECT FALSE, 'Please enter a valid Access PIN.', 0;
        RETURN;
    END IF;

    UPDATE public.access_pins
       SET status = 'REDEEMED',
           redeemed_by_student_phone = NULLIF(v_phone, ''),
           redeemed_at = NOW()
     WHERE pin_code = v_code
       AND status = 'ACTIVE'
    RETURNING validity_days INTO v_pin;

    IF NOT FOUND THEN
        IF EXISTS (SELECT 1 FROM public.access_pins WHERE pin_code = v_code) THEN
            RETURN QUERY SELECT FALSE,
                'This PIN code has already been redeemed and cannot be reused.', 0;
        ELSE
            RETURN QUERY SELECT FALSE,
                'Invalid PIN code. Please verify the code and try again.', 0;
        END IF;
        RETURN;
    END IF;

    v_days := coalesce(v_pin.validity_days, 30);

    IF v_phone <> '' THEN
        SELECT access_expires_at, id INTO v_existing, v_student_id
          FROM public.students
         WHERE phone_number = v_phone;

        IF FOUND THEN
            IF v_existing IS NOT NULL AND v_existing > NOW() THEN
                v_expiry := v_existing + (v_days || ' days')::INTERVAL;
            ELSE
                v_expiry := NOW() + (v_days || ' days')::INTERVAL;
            END IF;

            UPDATE public.students
               SET has_full_access = TRUE,
                   access_type = 'Full Pass',
                   access_expires_at = v_expiry,
                   last_active_at = NOW(),
                   updated_at = NOW()
             WHERE phone_number = v_phone;

            INSERT INTO public.cash_flow_transactions
                (reference, student_id, student_phone, amount_ghs,
                 transaction_type, payment_method, pin_code_used, description)
            VALUES
                ('PIN-' || v_code || '-' || floor(extract(epoch FROM NOW()))::BIGINT::TEXT,
                 v_student_id, v_phone, 25.00,
                 'PIN_PURCHASE', 'SCRATCH_CARD', v_code,
                 'Access PIN redemption (' || v_days || ' days)')
            ON CONFLICT (reference) DO NOTHING;
        END IF;
    END IF;

    RETURN QUERY SELECT TRUE,
        'Access PIN successfully verified! Full access unlocked for ' || v_days || ' days.',
        v_days;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_paid_access(
    p_reference TEXT,
    p_phone TEXT,
    p_amount_pesewas INTEGER,
    p_channel TEXT,
    p_source TEXT,
    p_validity_days INTEGER
)
RETURNS TABLE (granted BOOLEAN, already_processed BOOLEAN, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_phone TEXT := btrim(coalesce(p_phone, ''));
    v_days INTEGER := coalesce(p_validity_days, 30);
    v_expiry TIMESTAMPTZ;
    v_existing TIMESTAMPTZ;
    v_student_id UUID;
BEGIN
    IF p_reference IS NULL OR p_reference = '' OR v_phone = '' THEN
        RETURN QUERY SELECT FALSE, FALSE, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    BEGIN
        INSERT INTO public.processed_payments
            (reference, student_phone, amount_pesewas, channel, source)
        VALUES
            (p_reference, v_phone, coalesce(p_amount_pesewas, 0), p_channel, coalesce(p_source, 'verify'));
    EXCEPTION WHEN unique_violation THEN
        SELECT s.access_expires_at INTO v_expiry
          FROM public.students s
         WHERE s.phone_number = v_phone;
        RETURN QUERY SELECT FALSE, TRUE, v_expiry;
        RETURN;
    END;

    SELECT access_expires_at, id INTO v_existing, v_student_id
      FROM public.students
     WHERE phone_number = v_phone;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, FALSE, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    IF v_existing IS NOT NULL AND v_existing > NOW() THEN
        v_expiry := v_existing + (v_days || ' days')::INTERVAL;
    ELSE
        v_expiry := NOW() + (v_days || ' days')::INTERVAL;
    END IF;

    UPDATE public.students
       SET has_full_access = TRUE,
           access_type = 'Full Pass',
           access_expires_at = v_expiry,
           last_active_at = NOW(),
           updated_at = NOW()
     WHERE phone_number = v_phone;

    INSERT INTO public.cash_flow_transactions
        (reference, student_id, student_phone, amount_ghs,
         transaction_type, payment_method, description)
    VALUES
        (p_reference, v_student_id, v_phone, coalesce(p_amount_pesewas, 0) / 100.0,
         'SUBSCRIPTION_RENEWAL', coalesce(upper(p_channel), 'MOBILE_MONEY'),
         'Paystack monthly VIP pass (' || v_days || ' days)')
    ON CONFLICT (reference) DO NOTHING;

    RETURN QUERY SELECT TRUE, FALSE, v_expiry;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_lapsed_access()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_rows INTEGER;
BEGIN
    UPDATE public.students
       SET has_full_access = FALSE,
           access_type = 'Expired',
           updated_at = NOW()
     WHERE has_full_access = TRUE
       AND access_expires_at IS NOT NULL
       AND access_expires_at <= NOW();

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    DELETE FROM public.student_sessions WHERE expires_at <= NOW();
    DELETE FROM public.login_attempts
     WHERE (locked_until IS NOT NULL AND locked_until <= NOW())
        OR (first_attempt_at <= NOW() - INTERVAL '1 hour');

    RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_admin_pin(p_slot TEXT, p_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_hash TEXT;
BEGIN
    IF p_pin IS NULL OR p_pin = '' THEN
        RETURN FALSE;
    END IF;

    SELECT pin_hash INTO v_hash
      FROM public.admin_credentials
     WHERE slot = p_slot;

    IF NOT FOUND OR v_hash IS NULL OR v_hash = '' THEN
        RETURN NULL;
    END IF;

    RETURN crypt(p_pin, v_hash) = v_hash;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_admin_pin(p_slot TEXT, p_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF p_slot NOT IN ('primary', 'secondary') OR p_pin IS NULL OR length(p_pin) < 8 THEN
        RETURN FALSE;
    END IF;

    INSERT INTO public.admin_credentials (slot, pin_hash, updated_at)
    VALUES (p_slot, crypt(p_pin, gen_salt('bf', 10)), NOW())
    ON CONFLICT (slot)
    DO UPDATE SET pin_hash = EXCLUDED.pin_hash, updated_at = NOW();

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_pin_is_set(p_slot TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.admin_credentials
         WHERE slot = p_slot AND pin_hash <> ''
    );
$$;

-- 4. RLS & SCOPED PERMISSIONS (Scoped strictly to AcademicPrep tables so AMS tables are untouched!)
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_flow_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_topic_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_mistakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_credentials ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE
    public.students,
    public.access_pins,
    public.cash_flow_transactions,
    public.student_topic_progress,
    public.weekly_exam_attempts,
    public.student_mistakes,
    public.student_sessions,
    public.login_attempts,
    public.processed_payments,
    public.admin_credentials
TO service_role;

GRANT EXECUTE ON FUNCTION public.hash_student_pin(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_student_pin(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_student_pin(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_access_pin(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_paid_access(TEXT, TEXT, INTEGER, TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_lapsed_access() TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_admin_pin(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_admin_pin(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_pin_is_set(TEXT) TO service_role;

-- ==============================================================================
