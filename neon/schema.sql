CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'academic_head', 'teacher', 'operations')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teachers (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id),
  instrument TEXT NOT NULL,
  bio TEXT,
  review_sla_hours INTEGER NOT NULL DEFAULT 12,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS students (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  age_group TEXT NOT NULL,
  instrument TEXT NOT NULL,
  goal TEXT NOT NULL,
  assigned_teacher_id BIGINT NOT NULL REFERENCES teachers(id),
  current_week INTEGER NOT NULL DEFAULT 1 CHECK (current_week BETWEEN 1 AND 12),
  course_start_date DATE NOT NULL,
  parent_name TEXT,
  parent_email TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_accounts (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  email_verified_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_preferences (
  student_id BIGINT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  morning_reminder BOOLEAN NOT NULL DEFAULT TRUE,
  evening_reminder BOOLEAN NOT NULL DEFAULT TRUE,
  parent_updates BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS otp_challenges (
  id BIGSERIAL PRIMARY KEY,
  student_account_id BIGINT NOT NULL REFERENCES student_accounts(id) ON DELETE CASCADE,
  session_id TEXT UNIQUE,
  code_hash TEXT NOT NULL,
  code_salt TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  consumed_at TIMESTAMPTZ,
  delivery_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS session_id TEXT;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id BIGSERIAL PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  principal_type TEXT NOT NULL CHECK (principal_type IN ('staff', 'student')),
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  student_id BIGINT REFERENCES students(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS courses (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  instrument TEXT NOT NULL,
  duration_weeks INTEGER NOT NULL DEFAULT 12,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS course_weeks (
  id BIGSERIAL PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  focus TEXT NOT NULL,
  milestone TEXT NOT NULL,
  UNIQUE(course_id, week_number)
);

CREATE TABLE IF NOT EXISTS enrollments (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id BIGINT NOT NULL REFERENCES courses(id),
  status TEXT NOT NULL DEFAULT 'active',
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS live_sessions (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id BIGINT NOT NULL REFERENCES teachers(id),
  course_week INTEGER NOT NULL,
  session_number INTEGER NOT NULL CHECK (session_number IN (1, 2)),
  topic TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 45,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'attended', 'missed', 'cancelled')),
  meeting_url TEXT
);

CREATE TABLE IF NOT EXISTS practice_submissions (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id BIGINT NOT NULL REFERENCES teachers(id),
  course_week INTEGER NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('morning', 'evening')),
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds >= 420),
  file_name TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'reviewed')),
  reviewed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS teacher_reviews (
  id BIGSERIAL PRIMARY KEY,
  submission_id BIGINT NOT NULL UNIQUE REFERENCES practice_submissions(id) ON DELETE CASCADE,
  teacher_id BIGINT NOT NULL REFERENCES teachers(id),
  positive_observation TEXT NOT NULL,
  main_correction TEXT NOT NULL,
  next_practice_focus TEXT NOT NULL,
  requires_help_call BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS skill_ratings (
  id BIGSERIAL PRIMARY KEY,
  review_id BIGINT NOT NULL UNIQUE REFERENCES teacher_reviews(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_week INTEGER NOT NULL,
  rhythm INTEGER NOT NULL CHECK (rhythm BETWEEN 1 AND 5),
  accuracy INTEGER NOT NULL CHECK (accuracy BETWEEN 1 AND 5),
  technique INTEGER NOT NULL CHECK (technique BETWEEN 1 AND 5),
  posture INTEGER NOT NULL CHECK (posture BETWEEN 1 AND 5),
  musicality INTEGER NOT NULL CHECK (musicality BETWEEN 1 AND 5),
  confidence INTEGER NOT NULL CHECK (confidence BETWEEN 1 AND 5),
  feedback_application INTEGER NOT NULL CHECK (feedback_application BETWEEN 1 AND 5),
  rated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS help_calls (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id BIGINT NOT NULL REFERENCES teachers(id),
  topic TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('requested', 'scheduled', 'completed', 'cancelled')),
  room_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_alerts (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'system',
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS progress_snapshots (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  practice_score NUMERIC(5,2) NOT NULL,
  attendance_score NUMERIC(5,2) NOT NULL,
  skill_score NUMERIC(5,2) NOT NULL,
  feedback_score NUMERIC(5,2) NOT NULL,
  overall_score NUMERIC(5,2) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('green', 'amber', 'red')),
  UNIQUE(student_id, snapshot_date)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id BIGINT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id BIGINT,
  details_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submissions_review_status ON practice_submissions(review_status, uploaded_at);
CREATE INDEX IF NOT EXISTS idx_submissions_student_date ON practice_submissions(student_id, uploaded_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_daily_period_submission
  ON practice_submissions (student_id, period, ((uploaded_at AT TIME ZONE 'Asia/Kolkata')::date));
CREATE INDEX IF NOT EXISTS idx_sessions_student_date ON live_sessions(student_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_alerts_student_resolved ON student_alerts(student_id, resolved);
CREATE INDEX IF NOT EXISTS idx_otp_account_created ON otp_challenges(student_account_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_otp_session_id ON otp_challenges(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token_hash, revoked_at, expires_at);
