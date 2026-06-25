import { createHash, createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
import { hashPassword, normalizeSkillPayload, verifyPassword } from "../backend/shared.mjs";

const OTP_EXPIRY_MINUTES = 5;
const STUDENT_SESSION_DAYS = 7;
const STAFF_SESSION_HOURS = 12;
const DEFAULT_WEEK_TOPICS = [
  ["Setup and foundations", "Build relaxed posture and a clean first sound."],
  ["Pulse and timing", "Develop a steady beat and basic rhythmic control."],
  ["Core technique", "Strengthen the main technique needed for the instrument."],
  ["Clean transitions", "Move between notes, chords or phrases smoothly."],
  ["Accuracy and control", "Improve consistency at a comfortable tempo."],
  ["Musical vocabulary", "Apply the week’s skills to a short musical phrase."],
  ["Expression", "Shape dynamics, tone and musical intention."],
  ["Coordination", "Combine technique, rhythm and listening."],
  ["Repertoire building", "Learn and connect a complete musical section."],
  ["Performance skills", "Practice full play-throughs without stopping."],
  ["Polish and feedback", "Apply teacher feedback to final details."],
  ["Final performance", "Demonstrate the progress built through the course."]
];

function json(status, payload) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY"
    }
  });
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function hashOtp(code, sessionId, secret) {
  return createHmac("sha256", secret).update(`${sessionId}:${code}`).digest("hex");
}

function otpMatches(code, sessionId, expected, secret) {
  return hashOtp(code, sessionId, secret) === expected;
}

function getToken(request) {
  const authorization = request.headers.get("Authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

async function bodyJson(request) {
  return request.json().catch(() => ({}));
}

export function createD1Api(environment, helpers) {
  const db = environment.DB;
  const minPracticeSeconds = Number(environment.MIN_PRACTICE_SECONDS || 420);

  async function all(sql, ...params) {
    return (await db.prepare(sql).bind(...params).all()).results || [];
  }

  async function one(sql, ...params) {
    return db.prepare(sql).bind(...params).first();
  }

  async function run(sql, ...params) {
    return db.prepare(sql).bind(...params).run();
  }

  async function ensureBootstrap() {
    const email = normalizeEmail(environment.ADMIN_EMAIL);
    const password = String(environment.ADMIN_PASSWORD || "");
    if (!email || password.length < 8) throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required");
    await run(`
      INSERT INTO users (name, email, password_hash, role, active)
      VALUES (?, ?, ?, 'super_admin', 1)
      ON CONFLICT(email) DO UPDATE SET
        name = excluded.name,
        role = 'super_admin',
        active = 1
    `, environment.ADMIN_NAME || "MUSIC SCHOOL Admin", email, hashPassword(password));
  }

  let bootstrapPromise;

  async function createSession({ principalType, userId = null, studentId = null, role, ttl }) {
    const expiresAt = new Date(Date.now() + ttl).toISOString();
    const token = helpers.signSessionToken({
      principalType, userId, studentId, role,
      exp: new Date(expiresAt).getTime(),
      nonce: randomBytes(16).toString("base64url")
    });
    await run(`
      INSERT INTO auth_sessions (token_hash, principal_type, user_id, student_id, role, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, hashToken(token), principalType, userId, studentId, role, expiresAt);
    return { token, expiresAt };
  }

  async function session(request) {
    const token = getToken(request);
    const claims = helpers.verifySessionToken(token);
    if (!claims) return null;
    const row = await one(`
      SELECT a.*, u.name AS staff_name, u.email AS staff_email, u.active AS staff_active,
        s.name AS student_name, s.active AS student_active,
        sa.email AS student_email, sa.active AS account_active
      FROM auth_sessions a
      LEFT JOIN users u ON u.id = a.user_id
      LEFT JOIN students s ON s.id = a.student_id
      LEFT JOIN student_accounts sa ON sa.student_id = a.student_id
      WHERE a.token_hash = ? AND a.revoked_at IS NULL
    `, hashToken(token));
    if (!row || new Date(row.expires_at) <= new Date()) return null;
    if (row.principal_type === "staff" && !row.staff_active) return null;
    if (row.principal_type === "student" && (!row.student_active || !row.account_active)) return null;
    return {
      sessionId: row.id,
      principalType: row.principal_type,
      userId: row.user_id,
      studentId: row.student_id,
      role: row.role,
      name: row.principal_type === "staff" ? row.staff_name : row.student_name,
      email: row.principal_type === "staff" ? row.staff_email : row.student_email,
      expiresAt: row.expires_at
    };
  }

  async function requireStaff(request, roles = []) {
    const current = await session(request);
    if (!current || current.principalType !== "staff") return { error: json(401, { error: "Authentication required" }) };
    if (roles.length && !roles.includes(current.role)) return { error: json(403, { error: "Insufficient permission" }) };
    return { current };
  }

  async function requireStudent(request) {
    const current = await session(request);
    if (!current || current.principalType !== "student") return { error: json(401, { error: "Student login required" }) };
    return { current };
  }

  async function teacherScope(current) {
    if (current.role !== "teacher") return null;
    const teacher = await one("SELECT id FROM teachers WHERE user_id = ? AND active = 1", current.userId);
    return teacher?.id || -1;
  }

  async function canManageStudent(current, studentId) {
    const scope = await teacherScope(current);
    if (scope === null) return true;
    return Boolean(await one(
      "SELECT id FROM students WHERE id = ? AND assigned_teacher_id = ? AND active = 1",
      studentId,
      scope
    ));
  }

  function defaultCourseWeeks(instrument) {
    return DEFAULT_WEEK_TOPICS.map(([title, focus], index) => ({
      week_number: index + 1,
      title,
      focus: `${focus} Focus: ${instrument}.`,
      milestone: `Complete the Week ${index + 1} ${instrument} milestone with teacher approval.`,
      lessons: [`Teacher session focus`, `${instrument} technique`, "Guided practice review"],
      practice_instructions: `Practice the Week ${index + 1} focus slowly and accurately.`
    }));
  }

  async function coursePlan(studentId) {
    const student = await one("SELECT instrument FROM students WHERE id = ?", studentId);
    if (!student) return null;
    const plan = await one("SELECT * FROM student_course_plans WHERE student_id = ?", studentId);
    const weeks = await all(`
      SELECT week_number, title, focus, milestone, lessons_json, practice_instructions
      FROM student_course_weeks WHERE student_id = ? ORDER BY week_number
    `, studentId);
    return {
      student_id: studentId,
      course_title: plan?.course_title || `12-week ${student.instrument} course`,
      total_weeks: number(plan?.total_weeks, 12),
      practice_minutes: number(plan?.practice_minutes, Math.round(minPracticeSeconds / 60)),
      morning_required: Boolean(plan?.morning_required ?? 1),
      evening_required: Boolean(plan?.evening_required ?? 1),
      updated_at: plan?.updated_at || null,
      weeks: weeks.length ? weeks.map((week) => ({
        ...week,
        lessons: JSON.parse(week.lessons_json || "[]")
      })) : defaultCourseWeeks(student.instrument)
    };
  }

  async function scores(studentId) {
    const practice = await one(`
      SELECT COUNT(*) AS count FROM practice_submissions
      WHERE student_id = ? AND uploaded_at >= datetime('now', '-7 days')
    `, studentId);
    const attendance = await one(`
      SELECT
        SUM(CASE WHEN status = 'attended' THEN 1 ELSE 0 END) AS attended,
        SUM(CASE WHEN status IN ('attended','missed') THEN 1 ELSE 0 END) AS completed
      FROM live_sessions WHERE student_id = ? AND scheduled_at <= CURRENT_TIMESTAMP
    `, studentId);
    const rating = await one(`
      SELECT AVG((rhythm + accuracy + technique + posture + musicality + confidence) / 6.0) AS skill,
        AVG(feedback_application) AS feedback
      FROM skill_ratings WHERE student_id = ?
    `, studentId);
    const practiceScore = clamp(number(practice?.count) / 14 * 100, 0, 100);
    const attendanceScore = number(attendance?.completed) ? number(attendance.attended) / number(attendance.completed) * 100 : 100;
    const skillScore = rating?.skill ? number(rating.skill) * 20 : 60;
    const feedbackScore = rating?.feedback ? number(rating.feedback) * 20 : 60;
    const overallScore = practiceScore * 0.35 + attendanceScore * 0.25 + skillScore * 0.25 + feedbackScore * 0.15;
    return {
      practice_score: practiceScore,
      attendance_score: attendanceScore,
      skill_score: skillScore,
      feedback_score: feedbackScore,
      overall_score: overallScore,
      status: overallScore < 55 ? "red" : overallScore < 80 ? "amber" : "green"
    };
  }

  async function studentBase(studentId) {
    return one(`
      SELECT s.*, sa.email, t.id AS teacher_id, u.name AS teacher_name
      FROM students s
      JOIN student_accounts sa ON sa.student_id = s.id
      JOIN teachers t ON t.id = s.assigned_teacher_id
      JOIN users u ON u.id = t.user_id
      WHERE s.id = ?
    `, studentId);
  }

  async function studentAnalysis(studentId) {
    const student = await studentBase(studentId);
    if (!student) return null;
    const calculated = await scores(studentId);
    const latestSkills = await one(`
      SELECT * FROM skill_ratings WHERE student_id = ? ORDER BY rated_at DESC LIMIT 1
    `, studentId);
    const submissions = await all(`
      SELECT p.*, r.positive_observation, r.main_correction, r.next_practice_focus, r.reviewed_at
      FROM practice_submissions p
      LEFT JOIN teacher_reviews r ON r.submission_id = p.id
      WHERE p.student_id = ? ORDER BY p.uploaded_at DESC LIMIT 30
    `, studentId);
    const sessions = await all("SELECT * FROM live_sessions WHERE student_id = ? ORDER BY scheduled_at DESC LIMIT 20", studentId);
    const alerts = await all("SELECT * FROM student_alerts WHERE student_id = ? AND resolved = 0 ORDER BY created_at DESC", studentId);
    const helpCalls = await all("SELECT * FROM help_calls WHERE student_id = ? ORDER BY scheduled_at DESC LIMIT 10", studentId);
    return {
      student: { ...student, ...calculated, analysis_status: calculated.status },
      latestSkills,
      submissions,
      sessions,
      alerts,
      helpCalls
    };
  }

  async function todaySubmissions(studentId) {
    return all(`
      SELECT * FROM practice_submissions
      WHERE student_id = ? AND date(uploaded_at, '+5 hours', '+30 minutes') = date('now', '+5 hours', '+30 minutes')
      ORDER BY uploaded_at
    `, studentId);
  }

  function practiceGate(submissions, plan) {
    const periods = new Set(submissions.map((item) => item.period));
    const hour = number(new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false
    }).format(new Date()));
    const morningRequired = plan?.morning_required !== false;
    const eveningRequired = plan?.evening_required !== false;
    const activePeriod = morningRequired && !periods.has("morning")
      ? "morning"
      : hour >= 17 && eveningRequired && !periods.has("evening")
        ? "evening"
        : null;
    return {
      locked: Boolean(activePeriod),
      activePeriod,
      minDurationSeconds: number(plan?.practice_minutes, 7) * 60,
      message: activePeriod
        ? `${activePeriod === "morning" ? "Morning" : "Evening"} practice is required before using the app.`
        : "Today's required practice is complete."
    };
  }

  async function dashboard(current) {
    const scope = await teacherScope(current);
    const rows = await all(`
      SELECT s.id, s.name, s.instrument, s.current_week, s.assigned_teacher_id,
        u.name AS teacher_name,
        (SELECT COUNT(*) FROM student_alerts a WHERE a.student_id = s.id AND a.resolved = 0) AS alert_count
      FROM students s
      JOIN teachers t ON t.id = s.assigned_teacher_id
      JOIN users u ON u.id = t.user_id
      WHERE s.active = 1
    `);
    const students = [];
    for (const row of rows.filter((item) => scope === null || item.assigned_teacher_id === scope)) {
      students.push({ ...row, ...(await scores(row.id)) });
    }
    const pending = await one(`
      SELECT COUNT(*) AS count FROM practice_submissions p
      WHERE p.review_status = 'pending' AND (? IS NULL OR p.teacher_id = ?)
    `, scope, scope);
    const openAlerts = await one(`
      SELECT COUNT(*) AS count FROM student_alerts a
      JOIN students s ON s.id = a.student_id
      WHERE a.resolved = 0 AND (? IS NULL OR s.assigned_teacher_id = ?)
    `, scope, scope);
    const todaysSessions = await one(`
      SELECT COUNT(*) AS count FROM live_sessions
      WHERE date(scheduled_at) = date('now') AND (? IS NULL OR teacher_id = ?)
    `, scope, scope);
    const upcomingSessions = await all(`
      SELECT l.*, s.name AS student_name, u.name AS teacher_name
      FROM live_sessions l
      JOIN students s ON s.id = l.student_id
      JOIN teachers t ON t.id = l.teacher_id
      JOIN users u ON u.id = t.user_id
      WHERE l.status = 'scheduled' AND l.scheduled_at >= CURRENT_TIMESTAMP
        AND (? IS NULL OR l.teacher_id = ?)
      ORDER BY l.scheduled_at LIMIT 8
    `, scope, scope);
    const summary = {
      active_students: students.length,
      green_students: students.filter((item) => item.status === "green").length,
      amber_students: students.filter((item) => item.status === "amber").length,
      red_students: students.filter((item) => item.status === "red").length,
      pending_reviews: number(pending?.count),
      open_alerts: number(openAlerts?.count),
      todays_sessions: number(todaysSessions?.count),
      average_score: students.length ? students.reduce((sum, item) => sum + item.overall_score, 0) / students.length : 0,
      review_turnaround_hours: 0
    };
    return {
      summary,
      attentionStudents: students.filter((item) => item.status !== "green").sort((a, b) => a.overall_score - b.overall_score).slice(0, 8),
      upcomingSessions
    };
  }

  return async function handle(request) {
    bootstrapPromise ||= ensureBootstrap();
    await bootstrapPromise;
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/health" && request.method === "GET") {
      return json(200, {
        status: "ok",
        database: "cloudflare-d1",
        otpDelivery: environment.OTP_DELIVERY_MODE === "screen"
          ? "temporary-screen"
          : environment.OTP_DELIVERY_MODE,
        videoStorage: "metadata-only-mvp"
      });
    }

    if (path === "/api/student-auth/request-otp" && request.method === "POST") {
      const body = await bodyJson(request);
      const email = normalizeEmail(body.email);
      if (!isValidEmail(email)) return json(400, { error: "Enter a valid email address" });
      const account = await one(`
        SELECT sa.*, s.name AS student_name FROM student_accounts sa
        JOIN students s ON s.id = sa.student_id
        WHERE sa.email = ? AND sa.active = 1 AND s.active = 1
      `, email);
      const sessionId = randomUUID();
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000).toISOString();
      if (!account) return json(200, { ok: true, sessionId, expiresAt, expiresInSeconds: 300 });
      const rate = await one(`
        SELECT COUNT(*) AS count, MAX(created_at) AS latest FROM otp_challenges
        WHERE student_account_id = ? AND delivery_status != 'failed'
          AND created_at >= datetime('now', '-1 hour')
      `, account.id);
      if (number(rate?.count) >= 5) return json(429, { error: "Too many codes requested. Please try again after one hour." });
      if (rate?.latest && Date.now() - new Date(`${rate.latest}Z`).getTime() < 60_000) {
        return json(429, { error: "Please wait 60 seconds before requesting another code." });
      }
      await run("UPDATE otp_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE student_account_id = ? AND consumed_at IS NULL", account.id);
      const code = String(randomInt(100000, 1_000_000));
      const inserted = await run(`
        INSERT INTO otp_challenges (student_account_id, session_id, code_hash, expires_at)
        VALUES (?, ?, ?, ?)
      `, account.id, sessionId, hashOtp(code, sessionId, environment.OTP_SECRET), expiresAt);
      if (environment.OTP_DELIVERY_MODE === "screen") {
        await run("UPDATE otp_challenges SET delivery_status = 'sent' WHERE id = ?", inserted.meta.last_row_id);
        return json(200, {
          ok: true,
          sessionId,
          expiresAt,
          expiresInSeconds: 300,
          deliveryMode: "screen",
          developmentOtp: code
        });
      }
      try {
        await helpers.deliverOtpEmail({ email, studentName: account.student_name, code, challengeId: inserted.meta.last_row_id });
        await run("UPDATE otp_challenges SET delivery_status = 'sent' WHERE id = ?", inserted.meta.last_row_id);
        return json(200, { ok: true, sessionId, expiresAt, expiresInSeconds: 300, deliveryMode: "email" });
      } catch (error) {
        await run("UPDATE otp_challenges SET delivery_status = 'failed' WHERE id = ?", inserted.meta.last_row_id);
        console.error(error);
        return json(503, { error: "The login email could not be sent. Please contact the school." });
      }
    }

    if (path === "/api/student-auth/verify-otp" && request.method === "POST") {
      const body = await bodyJson(request);
      const email = normalizeEmail(body.email);
      const sessionId = String(body.sessionId || "");
      const code = String(body.otp || "");
      if (!isValidEmail(email) || !sessionId || !/^\d{6}$/.test(code)) return json(400, { error: "Enter the six-digit login code" });
      const challenge = await one(`
        SELECT o.*, sa.student_id, s.name AS student_name
        FROM otp_challenges o
        JOIN student_accounts sa ON sa.id = o.student_account_id
        JOIN students s ON s.id = sa.student_id
        WHERE sa.email = ? AND o.session_id = ? AND o.consumed_at IS NULL
          AND o.delivery_status = 'sent' AND sa.active = 1 AND s.active = 1
      `, email, sessionId);
      if (!challenge || new Date(challenge.expires_at) <= new Date() || challenge.attempts >= challenge.max_attempts) {
        return json(401, { error: "Invalid or expired login code" });
      }
      if (!otpMatches(code, sessionId, challenge.code_hash, environment.OTP_SECRET)) {
        await run("UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?", challenge.id);
        return json(401, { error: "Invalid or expired login code" });
      }
      await db.batch([
        db.prepare("UPDATE otp_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?").bind(challenge.id),
        db.prepare("UPDATE student_accounts SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP) WHERE student_id = ?").bind(challenge.student_id)
      ]);
      const auth = await createSession({
        principalType: "student", studentId: challenge.student_id, role: "student",
        ttl: STUDENT_SESSION_DAYS * 86_400_000
      });
      return json(200, {
        token: auth.token, expiresAt: auth.expiresAt,
        student: { id: challenge.student_id, name: challenge.student_name, email }
      });
    }

    if (path === "/api/student-auth/me" && request.method === "GET") {
      const auth = await requireStudent(request);
      if (auth.error) return auth.error;
      return json(200, { student: { id: auth.current.studentId, name: auth.current.name, email: auth.current.email }, expiresAt: auth.current.expiresAt });
    }

    if (path === "/api/student-auth/logout" && request.method === "POST") {
      const auth = await requireStudent(request);
      if (auth.error) return auth.error;
      await run("UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?", auth.current.sessionId);
      return json(200, { ok: true });
    }

    if (path === "/api/auth/login" && request.method === "POST") {
      const body = await bodyJson(request);
      const user = await one("SELECT * FROM users WHERE email = ? AND active = 1", normalizeEmail(body.email));
      if (!user || !verifyPassword(String(body.password || ""), user.password_hash)) return json(401, { error: "Invalid email or password" });
      const auth = await createSession({
        principalType: "staff", userId: user.id, role: user.role,
        ttl: STAFF_SESSION_HOURS * 3_600_000
      });
      return json(200, { token: auth.token, user: { userId: user.id, name: user.name, email: user.email, role: user.role, expiresAt: auth.expiresAt } });
    }

    if (path === "/api/auth/me" && request.method === "GET") {
      const auth = await requireStaff(request);
      return auth.error ? auth.error : json(200, { user: auth.current });
    }

    if (path === "/api/auth/logout" && request.method === "POST") {
      const auth = await requireStaff(request);
      if (auth.error) return auth.error;
      await run("UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?", auth.current.sessionId);
      return json(200, { ok: true });
    }

    if (path === "/api/auth/password" && request.method === "PATCH") {
      const auth = await requireStaff(request);
      if (auth.error) return auth.error;
      const body = await bodyJson(request);
      const currentPassword = String(body.currentPassword || "");
      const newPassword = String(body.newPassword || "");
      const user = await one("SELECT password_hash FROM users WHERE id = ?", auth.current.userId);
      if (!user || !verifyPassword(currentPassword, user.password_hash)) {
        return json(401, { error: "Current password is incorrect" });
      }
      if (newPassword.length < 8) return json(400, { error: "New password must be at least 8 characters" });
      await db.batch([
        db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(hashPassword(newPassword), auth.current.userId),
        db.prepare("UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id != ?").bind(auth.current.userId, auth.current.sessionId)
      ]);
      return json(200, { ok: true });
    }

    if (path === "/api/dashboard" && request.method === "GET") {
      const auth = await requireStaff(request, ["super_admin", "academic_head", "teacher", "operations"]);
      return auth.error ? auth.error : json(200, await dashboard(auth.current));
    }

    if (path === "/api/teachers" && request.method === "GET") {
      const auth = await requireStaff(request, ["super_admin", "academic_head", "operations"]);
      if (auth.error) return auth.error;
      const teachers = await all(`
        SELECT t.id, u.name, u.email, t.instrument, t.bio,
          (SELECT COUNT(*) FROM students s WHERE s.assigned_teacher_id = t.id AND s.active = 1) AS student_count,
          (SELECT COUNT(*) FROM practice_submissions p WHERE p.teacher_id = t.id AND p.review_status = 'pending') AS pending_reviews,
          0 AS attention_count, 0 AS review_turnaround_hours
        FROM teachers t JOIN users u ON u.id = t.user_id
        WHERE t.active = 1 AND u.active = 1 ORDER BY u.name
      `);
      return json(200, { teachers });
    }

    if (path === "/api/staff" && request.method === "GET") {
      const auth = await requireStaff(request, ["super_admin"]);
      if (auth.error) return auth.error;
      const staff = await all(`
        SELECT u.id, u.name, u.email, u.role, u.active, u.created_at,
          t.id AS teacher_id, t.instrument,
          (SELECT COUNT(*) FROM students s WHERE s.assigned_teacher_id = t.id AND s.active = 1) AS student_count
        FROM users u LEFT JOIN teachers t ON t.user_id = u.id
        ORDER BY u.active DESC, u.name
      `);
      return json(200, { staff });
    }

    if (path === "/api/staff" && request.method === "POST") {
      const auth = await requireStaff(request, ["super_admin"]);
      if (auth.error) return auth.error;
      const body = await bodyJson(request);
      const name = String(body.name || "").trim();
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");
      const role = String(body.role || "");
      const instrument = String(body.instrument || "").trim();
      if (name.length < 2 || !isValidEmail(email) || password.length < 8 || !["super_admin", "academic_head", "operations", "teacher"].includes(role)) {
        return json(400, { error: "Name, valid email, role and an 8-character password are required" });
      }
      if (role === "teacher" && !instrument) return json(400, { error: "Instrument is required for a teacher" });
      if (await one("SELECT id FROM users WHERE email = ?", email)) return json(409, { error: "A staff account already uses this email" });
      const inserted = await run("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)", name, email, hashPassword(password), role);
      if (role === "teacher") await run("INSERT INTO teachers (user_id, instrument, bio) VALUES (?, ?, ?)", inserted.meta.last_row_id, instrument, "MUSIC SCHOOL OTS teacher.");
      return json(201, { id: inserted.meta.last_row_id, name, email, role, active: true, instrument: role === "teacher" ? instrument : null });
    }

    const staffStatus = path.match(/^\/api\/staff\/(\d+)\/status$/);
    if (staffStatus && request.method === "PATCH") {
      const auth = await requireStaff(request, ["super_admin"]);
      if (auth.error) return auth.error;
      const staffId = number(staffStatus[1]);
      const body = await bodyJson(request);
      const active = Boolean(body.active);
      if (staffId === auth.current.userId && !active) return json(400, { error: "You cannot deactivate your own account" });
      const teacher = await one("SELECT id FROM teachers WHERE user_id = ?", staffId);
      if (!active && teacher) {
        const assigned = await one("SELECT COUNT(*) AS count FROM students WHERE assigned_teacher_id = ? AND active = 1", teacher.id);
        if (number(assigned?.count)) return json(409, { error: "Reassign this teacher's students before deactivating the account" });
      }
      await run("UPDATE users SET active = ? WHERE id = ?", active ? 1 : 0, staffId);
      if (teacher) await run("UPDATE teachers SET active = ? WHERE id = ?", active ? 1 : 0, teacher.id);
      if (!active) await run("UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ?", staffId);
      return json(200, { ok: true, active });
    }

    const staffPassword = path.match(/^\/api\/staff\/(\d+)\/password$/);
    if (staffPassword && request.method === "PATCH") {
      const auth = await requireStaff(request, ["super_admin"]);
      if (auth.error) return auth.error;
      const body = await bodyJson(request);
      const newPassword = String(body.newPassword || "");
      if (newPassword.length < 8) return json(400, { error: "Password must be at least 8 characters" });
      const staffId = number(staffPassword[1]);
      if (!(await one("SELECT id FROM users WHERE id = ?", staffId))) return json(404, { error: "Staff account not found" });
      await db.batch([
        db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(hashPassword(newPassword), staffId),
        db.prepare("UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ?").bind(staffId)
      ]);
      return json(200, { ok: true });
    }

    if (path === "/api/students" && request.method === "GET") {
      const auth = await requireStaff(request, ["super_admin", "academic_head", "teacher", "operations"]);
      if (auth.error) return auth.error;
      const scope = await teacherScope(auth.current);
      const rows = await all(`
        SELECT s.id, s.name, s.age_group, s.instrument, s.goal, s.current_week,
          s.assigned_teacher_id AS teacher_id, u.name AS teacher_name, sa.email,
          (SELECT COUNT(*) FROM student_alerts a WHERE a.student_id = s.id AND a.resolved = 0) AS alert_count,
          (SELECT COUNT(*) FROM practice_submissions p WHERE p.student_id = s.id AND p.review_status = 'pending') AS pending_reviews
        FROM students s
        JOIN teachers t ON t.id = s.assigned_teacher_id
        JOIN users u ON u.id = t.user_id
        JOIN student_accounts sa ON sa.student_id = s.id
        WHERE s.active = 1
      `);
      const students = [];
      for (const row of rows.filter((item) => scope === null || item.teacher_id === scope)) {
        students.push({ ...row, ...(await scores(row.id)) });
      }
      const status = url.searchParams.get("status");
      const search = String(url.searchParams.get("search") || "").toLowerCase();
      return json(200, {
        students: students
          .filter((item) => !status || item.status === status)
          .filter((item) => !search || `${item.name} ${item.teacher_name} ${item.instrument}`.toLowerCase().includes(search))
      });
    }

    if (path === "/api/students" && request.method === "POST") {
      const auth = await requireStaff(request, ["super_admin", "academic_head", "operations"]);
      if (auth.error) return auth.error;
      const body = await bodyJson(request);
      const email = normalizeEmail(body.email);
      const name = String(body.name || "").trim();
      const teacherId = number(body.teacherId);
      if (name.length < 2 || !isValidEmail(email) || !body.ageGroup || !body.instrument || !body.goal || !teacherId) {
        return json(400, { error: "Name, email, age group, instrument, goal and teacher are required" });
      }
      if (await one("SELECT id FROM student_accounts WHERE email = ?", email)) return json(409, { error: "A student account already uses this email" });
      const teacher = await one("SELECT id, instrument FROM teachers WHERE id = ? AND active = 1", teacherId);
      if (!teacher || teacher.instrument !== body.instrument) return json(400, { error: "Choose a matching active teacher" });
      const inserted = await run(`
        INSERT INTO students (name, age_group, instrument, goal, assigned_teacher_id, course_start_date, parent_name, parent_email)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, name, body.ageGroup, body.instrument, String(body.goal).trim(), teacherId,
      body.courseStartDate || new Date().toISOString().slice(0, 10),
      String(body.parentName || "").trim() || null, normalizeEmail(body.parentEmail) || null);
      const studentId = inserted.meta.last_row_id;
      await db.batch([
        db.prepare("INSERT INTO student_accounts (student_id, email) VALUES (?, ?)").bind(studentId, email),
        db.prepare("INSERT INTO student_preferences (student_id) VALUES (?)").bind(studentId),
        db.prepare(`
          INSERT INTO student_course_plans (
            student_id, course_title, total_weeks, practice_minutes,
            morning_required, evening_required, updated_by_user_id
          ) VALUES (?, ?, 12, 7, 1, 1, ?)
        `).bind(studentId, `12-week ${body.instrument} course`, auth.current.userId)
      ]);
      return json(201, { student: await studentAnalysis(studentId) });
    }

    const studentDetail = path.match(/^\/api\/students\/(\d+)$/);
    if (studentDetail && request.method === "GET") {
      const auth = await requireStaff(request, ["super_admin", "academic_head", "teacher", "operations"]);
      if (auth.error) return auth.error;
      const studentId = number(studentDetail[1]);
      const scope = await teacherScope(auth.current);
      if (scope !== null && !(await one("SELECT id FROM students WHERE id = ? AND assigned_teacher_id = ?", studentId, scope))) {
        return json(403, { error: "Student is outside your assigned roster" });
      }
      const analysis = await studentAnalysis(studentId);
      return analysis ? json(200, { ...analysis, coursePlan: await coursePlan(studentId) }) : json(404, { error: "Student not found" });
    }

    if (path === "/api/sessions" && request.method === "GET") {
      const auth = await requireStaff(request, ["super_admin", "academic_head", "teacher", "operations"]);
      if (auth.error) return auth.error;
      const scope = await teacherScope(auth.current);
      const sessions = await all(`
        SELECT l.*, s.name AS student_name, s.instrument, u.name AS teacher_name
        FROM live_sessions l
        JOIN students s ON s.id = l.student_id
        JOIN teachers t ON t.id = l.teacher_id
        JOIN users u ON u.id = t.user_id
        WHERE (? IS NULL OR l.teacher_id = ?)
        ORDER BY l.scheduled_at DESC LIMIT 100
      `, scope, scope);
      return json(200, { sessions });
    }

    if (path === "/api/sessions" && request.method === "POST") {
      const auth = await requireStaff(request, ["super_admin", "academic_head", "teacher", "operations"]);
      if (auth.error) return auth.error;
      const body = await bodyJson(request);
      const studentId = number(body.studentId);
      const student = await one("SELECT * FROM students WHERE id = ? AND active = 1", studentId);
      if (!student || !(await canManageStudent(auth.current, studentId))) return json(403, { error: "Student is outside your roster" });
      if (!body.topic || !body.scheduledAt) return json(400, { error: "Student, topic and session time are required" });
      const inserted = await run(`
        INSERT INTO live_sessions (
          student_id, teacher_id, topic, scheduled_at, status,
          duration_minutes, meeting_room, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, student.id, student.assigned_teacher_id, String(body.topic).trim(), body.scheduledAt,
      body.status || "scheduled", clamp(number(body.durationMinutes, 45), 15, 180),
      String(body.meetingRoom || "").trim() || `ots-session-${student.id}-${Date.now()}`,
      String(body.notes || "").trim() || null);
      return json(201, { id: inserted.meta.last_row_id });
    }

    const sessionUpdate = path.match(/^\/api\/sessions\/(\d+)$/);
    if (sessionUpdate && request.method === "PATCH") {
      const auth = await requireStaff(request, ["super_admin", "academic_head", "teacher", "operations"]);
      if (auth.error) return auth.error;
      const sessionRow = await one("SELECT * FROM live_sessions WHERE id = ?", number(sessionUpdate[1]));
      if (!sessionRow || !(await canManageStudent(auth.current, sessionRow.student_id))) {
        return json(404, { error: "Session not found" });
      }
      const body = await bodyJson(request);
      await run(`
        UPDATE live_sessions SET topic = ?, scheduled_at = ?, status = ?,
          duration_minutes = ?, meeting_room = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, String(body.topic || sessionRow.topic).trim(), body.scheduledAt || sessionRow.scheduled_at,
      body.status || sessionRow.status, clamp(number(body.durationMinutes, sessionRow.duration_minutes), 15, 180),
      String(body.meetingRoom ?? sessionRow.meeting_room ?? "").trim() || null,
      String(body.notes ?? sessionRow.notes ?? "").trim() || null, sessionRow.id);
      return json(200, { ok: true });
    }

    const studentCoursePlan = path.match(/^\/api\/students\/(\d+)\/course-plan$/);
    if (studentCoursePlan && request.method === "GET") {
      const auth = await requireStaff(request, ["super_admin", "academic_head", "teacher", "operations"]);
      if (auth.error) return auth.error;
      const studentId = number(studentCoursePlan[1]);
      if (!(await canManageStudent(auth.current, studentId))) return json(403, { error: "Student is outside your roster" });
      const plan = await coursePlan(studentId);
      return plan ? json(200, { coursePlan: plan }) : json(404, { error: "Student not found" });
    }

    if (studentCoursePlan && request.method === "PATCH") {
      const auth = await requireStaff(request, ["super_admin", "academic_head", "teacher", "operations"]);
      if (auth.error) return auth.error;
      const studentId = number(studentCoursePlan[1]);
      if (!(await canManageStudent(auth.current, studentId))) return json(403, { error: "Student is outside your roster" });
      const body = await bodyJson(request);
      const totalWeeks = clamp(number(body.totalWeeks, 12), 1, 24);
      const practiceMinutes = clamp(number(body.practiceMinutes, 7), 1, 60);
      const weeks = Array.isArray(body.weeks) ? body.weeks.slice(0, totalWeeks) : [];
      await run(`
        INSERT INTO student_course_plans (
          student_id, course_title, total_weeks, practice_minutes,
          morning_required, evening_required, updated_by_user_id, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(student_id) DO UPDATE SET
          course_title = excluded.course_title,
          total_weeks = excluded.total_weeks,
          practice_minutes = excluded.practice_minutes,
          morning_required = excluded.morning_required,
          evening_required = excluded.evening_required,
          updated_by_user_id = excluded.updated_by_user_id,
          updated_at = CURRENT_TIMESTAMP
      `, studentId, String(body.courseTitle || "Custom music course").trim(), totalWeeks, practiceMinutes,
      body.morningRequired === false ? 0 : 1, body.eveningRequired === false ? 0 : 1, auth.current.userId);
      await run("DELETE FROM student_course_weeks WHERE student_id = ?", studentId);
      for (let index = 0; index < weeks.length; index += 1) {
        const week = weeks[index] || {};
        await run(`
          INSERT INTO student_course_weeks (
            student_id, week_number, title, focus, milestone, lessons_json, practice_instructions
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, studentId, index + 1, String(week.title || `Week ${index + 1}`).trim(),
        String(week.focus || "").trim(), String(week.milestone || "").trim(),
        JSON.stringify(Array.isArray(week.lessons) ? week.lessons : []),
        String(week.practiceInstructions || week.practice_instructions || "").trim());
      }
      return json(200, { coursePlan: await coursePlan(studentId) });
    }

    if (path === "/api/reviews" && request.method === "GET") {
      const auth = await requireStaff(request, ["super_admin", "academic_head", "teacher"]);
      if (auth.error) return auth.error;
      const scope = await teacherScope(auth.current);
      const rows = await all(`
        SELECT p.*, s.name AS student_name,
          CAST((julianday('now') - julianday(p.uploaded_at)) * 24 AS INTEGER) AS waiting_hours
        FROM practice_submissions p JOIN students s ON s.id = p.student_id
        WHERE p.review_status = 'pending' AND (? IS NULL OR p.teacher_id = ?)
        ORDER BY p.uploaded_at
      `, scope, scope);
      return json(200, { submissions: rows });
    }

    const videoAccess = path.match(/^\/api\/reviews\/(\d+)\/video-access$/);
    if (videoAccess && request.method === "GET") {
      const auth = await requireStaff(request, ["super_admin", "academic_head", "teacher"]);
      if (auth.error) return auth.error;
      return json(200, { playbackUrl: null, message: "This MVP stores the practice check-in details without the video file." });
    }

    const reviewSubmit = path.match(/^\/api\/reviews\/(\d+)$/);
    if (reviewSubmit && request.method === "POST") {
      const auth = await requireStaff(request, ["super_admin", "academic_head", "teacher"]);
      if (auth.error) return auth.error;
      const submission = await one("SELECT * FROM practice_submissions WHERE id = ? AND review_status = 'pending'", number(reviewSubmit[1]));
      if (!submission) return json(404, { error: "Pending submission not found" });
      const scope = await teacherScope(auth.current);
      if (scope !== null && scope !== submission.teacher_id) return json(403, { error: "Submission is outside your roster" });
      const body = await bodyJson(request);
      const ratings = normalizeSkillPayload(body.ratings || {});
      const review = await run(`
        INSERT INTO teacher_reviews (
          submission_id, teacher_id, positive_observation, main_correction,
          next_practice_focus, requires_help_call
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, submission.id, submission.teacher_id, body.positiveObservation, body.mainCorrection,
      body.nextPracticeFocus, body.requiresHelpCall ? 1 : 0);
      await db.batch([
        db.prepare(`
          INSERT INTO skill_ratings (
            review_id, student_id, rhythm, accuracy, technique, posture,
            musicality, confidence, feedback_application
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(review.meta.last_row_id, submission.student_id, ratings.rhythm, ratings.accuracy,
        ratings.technique, ratings.posture, ratings.musicality, ratings.confidence, ratings.feedback_application),
        db.prepare("UPDATE practice_submissions SET review_status = 'reviewed', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?").bind(submission.id)
      ]);
      return json(200, { ok: true });
    }

    if (path === "/api/alerts" && request.method === "GET") {
      const auth = await requireStaff(request, ["super_admin", "academic_head", "teacher", "operations"]);
      if (auth.error) return auth.error;
      const scope = await teacherScope(auth.current);
      const alerts = await all(`
        SELECT a.*, s.name AS student_name, s.instrument, u.name AS teacher_name
        FROM student_alerts a
        JOIN students s ON s.id = a.student_id
        JOIN teachers t ON t.id = s.assigned_teacher_id
        JOIN users u ON u.id = t.user_id
        WHERE a.resolved = 0 AND (? IS NULL OR s.assigned_teacher_id = ?)
        ORDER BY a.created_at DESC
      `, scope, scope);
      return json(200, { alerts });
    }

    const resolveAlert = path.match(/^\/api\/alerts\/(\d+)\/resolve$/);
    if (resolveAlert && request.method === "POST") {
      const auth = await requireStaff(request, ["super_admin", "academic_head", "teacher", "operations"]);
      if (auth.error) return auth.error;
      await run("UPDATE student_alerts SET resolved = 1, resolved_at = CURRENT_TIMESTAMP WHERE id = ?", number(resolveAlert[1]));
      return json(200, { ok: true });
    }

    if (path === "/api/student/me" && request.method === "GET") {
      const auth = await requireStudent(request);
      if (auth.error) return auth.error;
      const analysis = await studentAnalysis(auth.current.studentId);
      const submissions = await todaySubmissions(auth.current.studentId);
      const preferences = await one("SELECT * FROM student_preferences WHERE student_id = ?", auth.current.studentId);
      const plan = await coursePlan(auth.current.studentId);
      return json(200, {
        profile: analysis.student,
        preferences: {
          morningReminder: Boolean(preferences?.morning_reminder ?? 1),
          eveningReminder: Boolean(preferences?.evening_reminder ?? 1),
          parentUpdates: Boolean(preferences?.parent_updates ?? 1)
        },
        coursePlan: plan,
        practiceGate: practiceGate(submissions, plan),
        latestSkills: analysis.latestSkills,
        todaySubmissions: submissions,
        feedback: analysis.submissions.filter((item) => item.review_status === "reviewed").slice(0, 5),
        upcomingSessions: analysis.sessions.filter((item) => item.status === "scheduled" && new Date(item.scheduled_at) >= new Date()).slice(0, 4),
        recentSubmissions: analysis.submissions.slice(0, 14),
        helpCalls: analysis.helpCalls.filter((item) => item.status === "scheduled")
      });
    }

    if (path === "/api/student/me/practice-submissions" && request.method === "POST") {
      const auth = await requireStudent(request);
      if (auth.error) return auth.error;
      const body = await bodyJson(request);
      const duration = Math.round(number(body.durationSeconds));
      const plan = await coursePlan(auth.current.studentId);
      const requiredSeconds = number(plan?.practice_minutes, Math.round(minPracticeSeconds / 60)) * 60;
      if (!["morning", "evening"].includes(body.period)) return json(400, { error: "Invalid practice period" });
      if (duration < requiredSeconds) return json(400, { error: `Practice video must be at least ${Math.round(requiredSeconds / 60)} minutes.` });
      if (await one(`
        SELECT id FROM practice_submissions
        WHERE student_id = ? AND period = ?
          AND date(uploaded_at, '+5 hours', '+30 minutes') = date('now', '+5 hours', '+30 minutes')
      `, auth.current.studentId, body.period)) return json(409, { error: `${body.period} practice was already submitted today` });
      const student = await one("SELECT * FROM students WHERE id = ?", auth.current.studentId);
      const inserted = await run(`
        INSERT INTO practice_submissions (
          student_id, teacher_id, course_week, period, duration_seconds, file_name, storage_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, student.id, student.assigned_teacher_id, student.current_week, body.period, duration,
      body.fileName || `${body.period}-practice.mp4`,
      `metadata/students/${student.id}/${body.period}-${Date.now()}-${randomUUID()}`);
      return json(201, { id: inserted.meta.last_row_id, storageKey: "metadata-only", storageMode: "metadata-only-mvp", reviewStatus: "pending" });
    }

    const deletePractice = path.match(/^\/api\/student\/me\/practice-submissions\/(\d+)$/);
    if (deletePractice && request.method === "DELETE") {
      const auth = await requireStudent(request);
      if (auth.error) return auth.error;
      const submission = await one(`
        SELECT id FROM practice_submissions
        WHERE id = ? AND student_id = ? AND review_status = 'pending'
      `, number(deletePractice[1]), auth.current.studentId);
      if (!submission) return json(409, { error: "Only a practice upload waiting for review can be removed" });
      await run("DELETE FROM practice_submissions WHERE id = ?", submission.id);
      return json(200, { ok: true });
    }

    if (path === "/api/student/me/help-calls" && request.method === "POST") {
      const auth = await requireStudent(request);
      if (auth.error) return auth.error;
      const body = await bodyJson(request);
      const student = await one("SELECT * FROM students WHERE id = ?", auth.current.studentId);
      const inserted = await run(`
        INSERT INTO help_calls (student_id, teacher_id, topic, scheduled_at)
        VALUES (?, ?, ?, ?)
      `, student.id, student.assigned_teacher_id, body.topic || "Student requested support",
      body.scheduledAt || new Date(Date.now() + 86_400_000).toISOString());
      return json(201, { id: inserted.meta.last_row_id, scheduledAt: body.scheduledAt, status: "scheduled" });
    }

    const cancelCall = path.match(/^\/api\/student\/me\/help-calls\/(\d+)\/cancel$/);
    if (cancelCall && request.method === "POST") {
      const auth = await requireStudent(request);
      if (auth.error) return auth.error;
      await run("UPDATE help_calls SET status = 'cancelled' WHERE id = ? AND student_id = ?", number(cancelCall[1]), auth.current.studentId);
      return json(200, { ok: true });
    }

    if (path === "/api/student/me/progress" && request.method === "POST") {
      const auth = await requireStudent(request);
      if (auth.error) return auth.error;
      const body = await bodyJson(request);
      const week = clamp(number(body.currentWeek, 1), 1, 12);
      await run("UPDATE students SET current_week = ? WHERE id = ?", week, auth.current.studentId);
      return json(200, { ok: true, currentWeek: week });
    }

    if (path === "/api/student/me/profile" && request.method === "PATCH") {
      const auth = await requireStudent(request);
      if (auth.error) return auth.error;
      const body = await bodyJson(request);
      await run("UPDATE students SET name = ?, goal = ? WHERE id = ?",
        String(body.name || "").trim(), String(body.goal || "").trim(), auth.current.studentId);
      const profile = await studentBase(auth.current.studentId);
      return json(200, { profile });
    }

    if (path === "/api/student/me/preferences" && request.method === "PATCH") {
      const auth = await requireStudent(request);
      if (auth.error) return auth.error;
      const body = await bodyJson(request);
      await run(`
        UPDATE student_preferences SET morning_reminder = ?, evening_reminder = ?,
          parent_updates = ?, updated_at = CURRENT_TIMESTAMP WHERE student_id = ?
      `, body.morningReminder ? 1 : 0, body.eveningReminder ? 1 : 0,
      body.parentUpdates ? 1 : 0, auth.current.studentId);
      return json(200, { ok: true });
    }

    return json(404, { error: "API route not found" });
  };
}
