CREATE TABLE IF NOT EXISTS student_course_plans (
  student_id INTEGER PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  course_title TEXT NOT NULL,
  total_weeks INTEGER NOT NULL DEFAULT 12,
  practice_minutes INTEGER NOT NULL DEFAULT 7,
  morning_required INTEGER NOT NULL DEFAULT 1,
  evening_required INTEGER NOT NULL DEFAULT 1,
  updated_by_user_id INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_course_weeks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  focus TEXT NOT NULL,
  milestone TEXT NOT NULL,
  lessons_json TEXT NOT NULL DEFAULT '[]',
  practice_instructions TEXT NOT NULL DEFAULT '',
  UNIQUE(student_id, week_number)
);

ALTER TABLE live_sessions ADD COLUMN duration_minutes INTEGER NOT NULL DEFAULT 45;
ALTER TABLE live_sessions ADD COLUMN meeting_room TEXT;
ALTER TABLE live_sessions ADD COLUMN notes TEXT;
ALTER TABLE live_sessions ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_course_weeks_student ON student_course_weeks(student_id, week_number);
CREATE INDEX IF NOT EXISTS idx_sessions_teacher_date ON live_sessions(teacher_id, scheduled_at);
