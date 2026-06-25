import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hashPassword, normalizeSkillPayload, verifyPassword } from "./shared.mjs";

function nowIso() {
  return new Date().toISOString();
}

function dateAtOffset(daysOffset, hour = 8, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export { hashPassword, normalizeSkillPayload, verifyPassword };

export function createDatabase(databasePath) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  createSchema(db);
  seedDatabase(db);
  seedStudentIdentityData(db);
  recalculateAllStudents(db);
  return db;
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('super_admin', 'academic_head', 'teacher', 'operations')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
      instrument TEXT NOT NULL,
      bio TEXT,
      review_sla_hours INTEGER NOT NULL DEFAULT 12,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      age_group TEXT NOT NULL,
      instrument TEXT NOT NULL,
      goal TEXT NOT NULL,
      assigned_teacher_id INTEGER NOT NULL REFERENCES teachers(id),
      current_week INTEGER NOT NULL DEFAULT 1,
      course_start_date TEXT NOT NULL,
      parent_name TEXT,
      parent_email TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS student_accounts (
      id INTEGER PRIMARY KEY,
      student_id INTEGER NOT NULL UNIQUE REFERENCES students(id),
      email TEXT NOT NULL UNIQUE,
      email_verified_at TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS student_preferences (
      student_id INTEGER PRIMARY KEY REFERENCES students(id),
      morning_reminder INTEGER NOT NULL DEFAULT 1,
      evening_reminder INTEGER NOT NULL DEFAULT 1,
      parent_updates INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS otp_challenges (
      id INTEGER PRIMARY KEY,
      student_account_id INTEGER NOT NULL REFERENCES student_accounts(id),
      session_id TEXT UNIQUE,
      code_hash TEXT NOT NULL,
      code_salt TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      consumed_at TEXT,
      delivery_status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id INTEGER PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      principal_type TEXT NOT NULL CHECK (principal_type IN ('staff', 'student')),
      user_id INTEGER REFERENCES users(id),
      student_id INTEGER REFERENCES students(id),
      role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      instrument TEXT NOT NULL,
      duration_weeks INTEGER NOT NULL DEFAULT 12,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS course_weeks (
      id INTEGER PRIMARY KEY,
      course_id INTEGER NOT NULL REFERENCES courses(id),
      week_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      focus TEXT NOT NULL,
      milestone TEXT NOT NULL,
      UNIQUE(course_id, week_number)
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      id INTEGER PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id),
      course_id INTEGER NOT NULL REFERENCES courses(id),
      status TEXT NOT NULL DEFAULT 'active',
      enrolled_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS live_sessions (
      id INTEGER PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id),
      teacher_id INTEGER NOT NULL REFERENCES teachers(id),
      course_week INTEGER NOT NULL,
      session_number INTEGER NOT NULL CHECK (session_number IN (1, 2)),
      topic TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 45,
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'attended', 'missed', 'cancelled')),
      meeting_url TEXT
    );

    CREATE TABLE IF NOT EXISTS practice_submissions (
      id INTEGER PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id),
      teacher_id INTEGER NOT NULL REFERENCES teachers(id),
      course_week INTEGER NOT NULL,
      period TEXT NOT NULL CHECK (period IN ('morning', 'evening')),
      duration_seconds INTEGER NOT NULL DEFAULT 600,
      file_name TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'reviewed')),
      reviewed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS teacher_reviews (
      id INTEGER PRIMARY KEY,
      submission_id INTEGER NOT NULL UNIQUE REFERENCES practice_submissions(id),
      teacher_id INTEGER NOT NULL REFERENCES teachers(id),
      positive_observation TEXT NOT NULL,
      main_correction TEXT NOT NULL,
      next_practice_focus TEXT NOT NULL,
      requires_help_call INTEGER NOT NULL DEFAULT 0,
      reviewed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skill_ratings (
      id INTEGER PRIMARY KEY,
      review_id INTEGER NOT NULL UNIQUE REFERENCES teacher_reviews(id),
      student_id INTEGER NOT NULL REFERENCES students(id),
      course_week INTEGER NOT NULL,
      rhythm INTEGER NOT NULL CHECK (rhythm BETWEEN 1 AND 5),
      accuracy INTEGER NOT NULL CHECK (accuracy BETWEEN 1 AND 5),
      technique INTEGER NOT NULL CHECK (technique BETWEEN 1 AND 5),
      posture INTEGER NOT NULL CHECK (posture BETWEEN 1 AND 5),
      musicality INTEGER NOT NULL CHECK (musicality BETWEEN 1 AND 5),
      confidence INTEGER NOT NULL CHECK (confidence BETWEEN 1 AND 5),
      feedback_application INTEGER NOT NULL CHECK (feedback_application BETWEEN 1 AND 5),
      rated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS help_calls (
      id INTEGER PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id),
      teacher_id INTEGER NOT NULL REFERENCES teachers(id),
      topic TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('requested', 'scheduled', 'completed', 'cancelled')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS student_alerts (
      id INTEGER PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id),
      type TEXT NOT NULL,
      severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'system',
      resolved INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS progress_snapshots (
      id INTEGER PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id),
      snapshot_date TEXT NOT NULL,
      practice_score REAL NOT NULL,
      attendance_score REAL NOT NULL,
      skill_score REAL NOT NULL,
      feedback_score REAL NOT NULL,
      overall_score REAL NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('green', 'amber', 'red')),
      UNIQUE(student_id, snapshot_date)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY,
      actor_user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      details_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_submissions_review_status ON practice_submissions(review_status, uploaded_at);
    CREATE INDEX IF NOT EXISTS idx_submissions_student_date ON practice_submissions(student_id, uploaded_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_student_date ON live_sessions(student_id, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_alerts_student_resolved ON student_alerts(student_id, resolved);
    CREATE INDEX IF NOT EXISTS idx_otp_account_created ON otp_challenges(student_account_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token_hash, revoked_at, expires_at);
  `);

  const otpColumns = db.prepare("PRAGMA table_info(otp_challenges)").all();
  if (!otpColumns.some((column) => column.name === "session_id")) {
    db.exec("ALTER TABLE otp_challenges ADD COLUMN session_id TEXT;");
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_otp_session_id ON otp_challenges(session_id) WHERE session_id IS NOT NULL;");
}

function seedDatabase(db) {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM students").get();
  if (existing.count > 0) return;

  db.exec("BEGIN");
  try {
    const insertUser = db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertUser.run(1, "OTS Super Admin", "admin@ots.test", hashPassword("otsadmin123"), "super_admin", nowIso());
    insertUser.run(2, "Meera Rao", "head@ots.test", hashPassword("head12345"), "academic_head", nowIso());
    insertUser.run(3, "Arjun Kumar", "arjun@ots.test", hashPassword("teacher123"), "teacher", nowIso());
    insertUser.run(4, "Neha Shah", "neha@ots.test", hashPassword("teacher123"), "teacher", nowIso());

    const insertTeacher = db.prepare(`
      INSERT INTO teachers (id, user_id, instrument, bio, review_sla_hours)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertTeacher.run(1, 3, "Guitar", "Contemporary guitar educator focused on rhythm and performance confidence.", 12);
    insertTeacher.run(2, 4, "Keyboard", "Keyboard and vocals educator focused on foundations and examination readiness.", 12);

    const insertCourse = db.prepare("INSERT INTO courses (id, name, instrument, duration_weeks) VALUES (?, ?, ?, ?)");
    insertCourse.run(1, "12-Week Guitar Foundations", "Guitar", 12);
    insertCourse.run(2, "12-Week Keyboard Foundations", "Keyboard", 12);

    const weeks = [
      ["Setup, posture and first sound", "Instrument setup and relaxed posture", "Produce five clean notes"],
      ["Pulse and rhythm foundations", "Count steady beats", "Hold a four-count for one minute"],
      ["First chord shapes", "Build clean foundational shapes", "Play three shapes clearly"],
      ["Clean chord transitions", "Move smoothly between shapes", "Complete ten clean transitions"],
      ["Strumming patterns", "Connect rhythm and chords", "Play a four-bar loop"],
      ["First complete song", "Combine skills into a song", "Perform one complete song"],
      ["Timing with a metronome", "Develop consistent timing", "Perform at 70 BPM"],
      ["Faster transitions", "Increase speed with clarity", "Reach 25 changes per minute"],
      ["Dynamics and expression", "Add musical expression", "Perform clear dynamic sections"],
      ["Performance preparation", "Build a reliable routine", "Record without restarting"],
      ["Mock performance", "Polish through teacher review", "Complete a reviewed mock"],
      ["Final performance", "Demonstrate course skills", "Submit the final performance"]
    ];
    const insertWeek = db.prepare(`
      INSERT INTO course_weeks (course_id, week_number, title, focus, milestone)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const courseId of [1, 2]) {
      weeks.forEach((week, index) => insertWeek.run(courseId, index + 1, ...week));
    }

    const insertStudent = db.prepare(`
      INSERT INTO students (
        id, name, age_group, instrument, goal, assigned_teacher_id, current_week,
        course_start_date, parent_name, parent_email, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const students = [
      [1, "Riya Sharma", "13-17", "Guitar", "Play complete songs confidently", 1, 3, -18, "Anita Sharma", "anita@example.com"],
      [2, "Kabir Mehta", "8-12", "Guitar", "Build strong musical foundations", 1, 5, -32, "Nikhil Mehta", "nikhil@example.com"],
      [3, "Meera Iyer", "18+", "Keyboard", "Prepare for a performance", 2, 4, -25, null, null],
      [4, "Aarav Singh", "13-17", "Guitar", "Prepare for music examinations", 1, 8, -53, "Priya Singh", "priya@example.com"],
      [5, "Nina Joseph", "18+", "Keyboard", "Play complete songs confidently", 2, 2, -10, null, null]
    ];
    for (const student of students) {
      const [id, name, age, instrument, goal, teacherId, currentWeek, startOffset, parentName, parentEmail] = student;
      insertStudent.run(
        id,
        name,
        age,
        instrument,
        goal,
        teacherId,
        currentWeek,
        dateAtOffset(startOffset).slice(0, 10),
        parentName,
        parentEmail,
        nowIso()
      );
    }

    const insertEnrollment = db.prepare(`
      INSERT INTO enrollments (student_id, course_id, status, enrolled_at)
      VALUES (?, ?, 'active', ?)
    `);
    for (const student of students) {
      insertEnrollment.run(student[0], student[3] === "Guitar" ? 1 : 2, dateAtOffset(student[7]));
    }

    seedSessions(db, students);
    seedPracticeAndReviews(db, students);
    seedHelpCalls(db);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function seedStudentIdentityData(db) {
  const accounts = [
    [1, "riya@ots.test"],
    [2, "kabir@ots.test"],
    [3, "meera.student@ots.test"],
    [4, "aarav@ots.test"],
    [5, "nina@ots.test"]
  ];
  const insertAccount = db.prepare(`
    INSERT OR IGNORE INTO student_accounts (
      student_id, email, email_verified_at, active, created_at
    ) VALUES (?, ?, NULL, 1, ?)
  `);
  const insertPreferences = db.prepare(`
    INSERT OR IGNORE INTO student_preferences (
      student_id, morning_reminder, evening_reminder, parent_updates, updated_at
    ) VALUES (?, 1, 1, 1, ?)
  `);
  for (const [studentId, email] of accounts) {
    const student = db.prepare("SELECT id FROM students WHERE id = ?").get(studentId);
    if (!student) continue;
    insertAccount.run(studentId, email, nowIso());
    insertPreferences.run(studentId, nowIso());
  }
}

function seedHelpCalls(db) {
  const insertCall = db.prepare(`
    INSERT INTO help_calls (student_id, teacher_id, topic, scheduled_at, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertCall.run(
    1,
    1,
    "Clean G-to-C transitions and relaxed wrist position",
    dateAtOffset(2, 18, 30),
    "scheduled",
    nowIso()
  );
  insertCall.run(
    3,
    2,
    "Timing and posture correction before the next live session",
    dateAtOffset(1, 19, 0),
    "scheduled",
    nowIso()
  );
}

function seedSessions(db, students) {
  const insertSession = db.prepare(`
    INSERT INTO live_sessions (
      student_id, teacher_id, course_week, session_number, topic, scheduled_at, status, meeting_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const attendancePatterns = {
    1: ["attended", "attended", "scheduled", "scheduled"],
    2: ["attended", "missed", "scheduled", "scheduled"],
    3: ["missed", "missed", "scheduled", "scheduled"],
    4: ["attended", "attended", "scheduled", "scheduled"],
    5: ["attended", "attended", "scheduled", "scheduled"]
  };

  for (const student of students) {
    const [studentId, , , , , teacherId, currentWeek] = student;
    const pattern = attendancePatterns[studentId];
    const sessions = [
      [-6, 1, "Technique and weekly focus"],
      [-3, 2, "Review and correction"],
      [1, 1, "New skill introduction"],
      [4, 2, "Weekly review and performance"]
    ];
    sessions.forEach((session, index) => {
      insertSession.run(
        studentId,
        teacherId,
        index < 2 ? Math.max(1, currentWeek - 1) : currentWeek,
        session[1],
        session[2],
        dateAtOffset(session[0], 18),
        pattern[index],
        `https://meet.example.test/ots-${studentId}-${index + 1}`
      );
    });
  }
}

function seedPracticeAndReviews(db, students) {
  const insertSubmission = db.prepare(`
    INSERT INTO practice_submissions (
      student_id, teacher_id, course_week, period, duration_seconds, file_name,
      storage_key, uploaded_at, review_status, reviewed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertReview = db.prepare(`
    INSERT INTO teacher_reviews (
      submission_id, teacher_id, positive_observation, main_correction,
      next_practice_focus, requires_help_call, reviewed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertRating = db.prepare(`
    INSERT INTO skill_ratings (
      review_id, student_id, course_week, rhythm, accuracy, technique, posture,
      musicality, confidence, feedback_application, rated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const submissionTargets = { 1: 12, 2: 8, 3: 3, 4: 14, 5: 10 };
  const baseRatings = { 1: 4, 2: 3, 3: 2, 4: 5, 5: 3 };
  let submissionIndex = 1;

  for (const student of students) {
    const [studentId, name, , , , teacherId, currentWeek] = student;
    const target = submissionTargets[studentId];
    for (let index = 0; index < target; index += 1) {
      const dayOffset = -1 - Math.floor(index / 2);
      const period = index % 2 === 0 ? "morning" : "evening";
      const uploadedAt = dateAtOffset(dayOffset, period === "morning" ? 7 : 19, 15);
      const shouldRemainPending =
        (studentId === 1 && index === 0) ||
        (studentId === 2 && index < 2) ||
        (studentId === 3 && index === 0) ||
        (studentId === 5 && index === 1);
      const reviewedAt = shouldRemainPending ? null : dateAtOffset(dayOffset, period === "morning" ? 12 : 22);
      const result = insertSubmission.run(
        studentId,
        teacherId,
        currentWeek,
        period,
        600,
        `${name.toLowerCase().replaceAll(" ", "-")}-${period}-${submissionIndex}.mp4`,
        `students/${studentId}/week-${currentWeek}/${submissionIndex}.mp4`,
        uploadedAt,
        shouldRemainPending ? "pending" : "reviewed",
        reviewedAt
      );

      if (!shouldRemainPending) {
        const base = baseRatings[studentId];
        const variation = index % 3 === 0 ? 0 : index % 3 === 1 ? -1 : 1;
        const skill = clamp(base + variation, 1, 5);
        const reviewResult = insertReview.run(
          result.lastInsertRowid,
          teacherId,
          "The student maintained focus and showed better control.",
          studentId === 3 ? "Timing and posture need immediate attention." : "Slow the difficult transition and remove excess tension.",
          "Repeat the assigned exercise three times before the next upload.",
          studentId === 3 ? 1 : 0,
          reviewedAt
        );
        insertRating.run(
          reviewResult.lastInsertRowid,
          studentId,
          currentWeek,
          skill,
          clamp(skill - (studentId === 2 ? 1 : 0), 1, 5),
          skill,
          clamp(skill + (studentId === 1 ? 1 : 0), 1, 5),
          clamp(skill - 1, 1, 5),
          skill,
          clamp(base, 1, 5),
          reviewedAt
        );
      }
      submissionIndex += 1;
    }
  }
}

export function recalculateAllStudents(db) {
  const students = db.prepare("SELECT id FROM students WHERE active = 1").all();
  students.forEach((student) => recalculateStudent(db, student.id));
}

export function recalculateStudent(db, studentId) {
  const sevenDaysAgo = dateAtOffset(-6, 0);
  const thirtyDaysAgo = dateAtOffset(-30, 0);
  const today = nowIso().slice(0, 10);

  const submissions = db.prepare(`
    SELECT COUNT(*) AS count
    FROM practice_submissions
    WHERE student_id = ? AND uploaded_at >= ?
  `).get(studentId, sevenDaysAgo);
  const practiceScore = clamp((submissions.count / 14) * 100, 0, 100);

  const attendance = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'attended' THEN 1 ELSE 0 END) AS attended,
      SUM(CASE WHEN status IN ('attended', 'missed') THEN 1 ELSE 0 END) AS completed
    FROM live_sessions
    WHERE student_id = ? AND scheduled_at >= ? AND scheduled_at <= ?
  `).get(studentId, thirtyDaysAgo, nowIso());
  const attendanceScore = attendance.completed ? (attendance.attended / attendance.completed) * 100 : 100;

  const rating = db.prepare(`
    SELECT
      AVG((rhythm + accuracy + technique + posture + musicality + confidence) / 6.0) AS skill_average,
      AVG(feedback_application) AS feedback_average
    FROM (
      SELECT *
      FROM skill_ratings
      WHERE student_id = ?
      ORDER BY rated_at DESC
      LIMIT 10
    )
  `).get(studentId);
  const skillScore = rating.skill_average ? (rating.skill_average / 5) * 100 : 50;
  const feedbackScore = rating.feedback_average ? (rating.feedback_average / 5) * 100 : 50;

  const overallScore = Math.round(
    practiceScore * 0.35 +
    attendanceScore * 0.25 +
    skillScore * 0.25 +
    feedbackScore * 0.15
  );
  const status = overallScore >= 80 ? "green" : overallScore >= 55 ? "amber" : "red";

  db.prepare(`
    INSERT INTO progress_snapshots (
      student_id, snapshot_date, practice_score, attendance_score, skill_score,
      feedback_score, overall_score, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(student_id, snapshot_date) DO UPDATE SET
      practice_score = excluded.practice_score,
      attendance_score = excluded.attendance_score,
      skill_score = excluded.skill_score,
      feedback_score = excluded.feedback_score,
      overall_score = excluded.overall_score,
      status = excluded.status
  `).run(
    studentId,
    today,
    Math.round(practiceScore),
    Math.round(attendanceScore),
    Math.round(skillScore),
    Math.round(feedbackScore),
    overallScore,
    status
  );

  refreshAlerts(db, studentId, { submissions: submissions.count, overallScore });
  return { practiceScore, attendanceScore, skillScore, feedbackScore, overallScore, status };
}

function refreshAlerts(db, studentId, metrics) {
  db.prepare("DELETE FROM student_alerts WHERE student_id = ? AND source = 'system' AND resolved = 0").run(studentId);
  const insertAlert = db.prepare(`
    INSERT INTO student_alerts (
      student_id, type, severity, title, detail, source, created_at
    ) VALUES (?, ?, ?, ?, ?, 'system', ?)
  `);

  if (metrics.submissions < 10) {
    insertAlert.run(
      studentId,
      "practice_consistency",
      metrics.submissions < 5 ? "critical" : "warning",
      "Practice check-ins are below target",
      `${metrics.submissions} of 14 expected check-ins were submitted in the last seven days.`,
      nowIso()
    );
  }

  const missedSession = db.prepare(`
    SELECT COUNT(*) AS count
    FROM live_sessions
    WHERE student_id = ? AND status = 'missed' AND scheduled_at >= ?
  `).get(studentId, dateAtOffset(-14, 0));
  if (missedSession.count > 0) {
    insertAlert.run(
      studentId,
      "missed_session",
      missedSession.count > 1 ? "critical" : "warning",
      "Live session missed",
      `${missedSession.count} live session${missedSession.count === 1 ? " was" : "s were"} missed in the last two weeks.`,
      nowIso()
    );
  }

  const overdueReview = db.prepare(`
    SELECT COUNT(*) AS count
    FROM practice_submissions ps
    JOIN teachers t ON t.id = ps.teacher_id
    WHERE ps.student_id = ?
      AND ps.review_status = 'pending'
      AND julianday(ps.uploaded_at) < julianday('now', '-' || t.review_sla_hours || ' hours')
  `).get(studentId);
  if (overdueReview.count > 0) {
    insertAlert.run(
      studentId,
      "review_overdue",
      "warning",
      "Teacher review overdue",
      `${overdueReview.count} practice submission${overdueReview.count === 1 ? " is" : "s are"} beyond the review target.`,
      nowIso()
    );
  }

  if (metrics.overallScore < 55) {
    insertAlert.run(
      studentId,
      "student_at_risk",
      "critical",
      "Student requires intervention",
      `The current weighted progress score is ${metrics.overallScore}. Academic review is recommended.`,
      nowIso()
    );
  }
}

export function logAudit(db, actorUserId, action, entityType, entityId, details = {}) {
  db.prepare(`
    INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(actorUserId || null, action, entityType, entityId || null, JSON.stringify(details), nowIso());
}

export function getStudentAnalysis(db, studentId) {
  const student = db.prepare(`
    SELECT
      s.*,
      account.email,
      account.email_verified_at,
      u.name AS teacher_name,
      t.instrument AS teacher_instrument,
      ps.practice_score,
      ps.attendance_score,
      ps.skill_score,
      ps.feedback_score,
      ps.overall_score,
      ps.status AS analysis_status
    FROM students s
    LEFT JOIN student_accounts account ON account.student_id = s.id
    JOIN teachers t ON t.id = s.assigned_teacher_id
    JOIN users u ON u.id = t.user_id
    LEFT JOIN progress_snapshots ps
      ON ps.student_id = s.id
      AND ps.snapshot_date = (SELECT MAX(snapshot_date) FROM progress_snapshots WHERE student_id = s.id)
    WHERE s.id = ?
  `).get(studentId);
  if (!student) return null;

  const latestSkills = db.prepare(`
    SELECT rhythm, accuracy, technique, posture, musicality, confidence, feedback_application, rated_at
    FROM skill_ratings
    WHERE student_id = ?
    ORDER BY rated_at DESC
    LIMIT 1
  `).get(studentId);

  const skillTrend = db.prepare(`
    SELECT course_week,
      ROUND(AVG((rhythm + accuracy + technique + posture + musicality + confidence) / 6.0), 2) AS average
    FROM skill_ratings
    WHERE student_id = ?
    GROUP BY course_week
    ORDER BY course_week
  `).all(studentId);

  const submissions = db.prepare(`
    SELECT
      ps.*,
      tr.positive_observation,
      tr.main_correction,
      tr.next_practice_focus
    FROM practice_submissions ps
    LEFT JOIN teacher_reviews tr ON tr.submission_id = ps.id
    WHERE ps.student_id = ?
    ORDER BY ps.uploaded_at DESC
    LIMIT 20
  `).all(studentId);

  const sessions = db.prepare(`
    SELECT *
    FROM live_sessions
    WHERE student_id = ?
    ORDER BY scheduled_at DESC
    LIMIT 12
  `).all(studentId);

  const alerts = db.prepare(`
    SELECT *
    FROM student_alerts
    WHERE student_id = ? AND resolved = 0
    ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, created_at DESC
  `).all(studentId);

  const helpCalls = db.prepare(`
    SELECT *
    FROM help_calls
    WHERE student_id = ?
    ORDER BY scheduled_at DESC
    LIMIT 8
  `).all(studentId);

  return { student, latestSkills, skillTrend, submissions, sessions, alerts, helpCalls };
}
