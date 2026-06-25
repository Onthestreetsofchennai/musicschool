import { createHash, createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
import { hashPassword, normalizeSkillPayload, verifyPassword } from "./shared.mjs";

const OTP_EXPIRY_MINUTES = 5;
const STUDENT_SESSION_DAYS = 7;
const STAFF_SESSION_HOURS = 12;
const COURSE_WEEK_TITLES = [
  "Setup, posture and first sound", "Pulse and rhythm foundations", "First chord shapes",
  "Clean transitions", "Practice patterns", "First complete song", "Timing with a metronome",
  "Faster transitions", "Dynamics and expression", "Performance preparation",
  "Mock performance", "Final performance"
];

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function hashOtp(code, sessionId, secret) {
  return createHmac("sha256", secret).update(`${sessionId}:${code}`).digest("hex");
}

function otpMatches(code, sessionId, expectedHash, secret) {
  return hashOtp(code, sessionId, secret) === expectedHash;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function statusRank(status) {
  return status === "red" ? 1 : status === "amber" ? 2 : 3;
}

export async function createNeonApi(context) {
  const { neon } = await import("@neondatabase/serverless");
  const {
    sendJson,
    readJson,
    getToken,
    deliverOtpEmail,
    minPracticeSeconds,
    otpSecret,
    signSessionToken,
    verifySessionToken,
    environment = process.env
  } = context;
  const sql = neon(environment.DATABASE_URL);

  async function query(text, params = []) {
    return sql.query(text, params);
  }

  async function one(text, params = []) {
    const rows = await query(text, params);
    return rows[0] || null;
  }

  async function audit(actorUserId, action, entityType, entityId, details = {}) {
    await query(`
      INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details_json)
      VALUES ($1, $2, $3, $4, $5::jsonb)
    `, [actorUserId || null, action, entityType, entityId || null, JSON.stringify(details)]);
  }

  await query("ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS session_id TEXT");
  await query("CREATE UNIQUE INDEX IF NOT EXISTS idx_otp_session_id ON otp_challenges(session_id) WHERE session_id IS NOT NULL");

  async function ensureCourse(instrument) {
    let course = await one(
      "SELECT id FROM courses WHERE instrument = $1 AND active = TRUE ORDER BY id LIMIT 1",
      [instrument]
    );
    if (!course) {
      course = await one(`
        INSERT INTO courses (name, instrument, duration_weeks)
        VALUES ($1, $2, 12) RETURNING id
      `, [`12-Week ${instrument} Foundations`, instrument]);
    }
    for (let index = 0; index < COURSE_WEEK_TITLES.length; index += 1) {
      await query(`
        INSERT INTO course_weeks (course_id, week_number, title, focus, milestone)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (course_id, week_number) DO NOTHING
      `, [
        course.id,
        index + 1,
        COURSE_WEEK_TITLES[index],
        `Week ${index + 1} guided practice`,
        `Complete the week ${index + 1} teacher milestone`
      ]);
    }
    return number(course.id);
  }

  async function ensureBootstrap() {
    const adminEmail = normalizeEmail(environment.ADMIN_EMAIL);
    const adminPassword = String(environment.ADMIN_PASSWORD || "");
    if (!adminEmail || !adminPassword) {
      throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required with DATABASE_URL");
    }

    await query(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES ($1, $2, $3, 'super_admin')
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        password_hash = EXCLUDED.password_hash,
        role = 'super_admin',
      active = TRUE
    `, [environment.ADMIN_NAME || "MUSIC SCHOOL Admin", adminEmail, hashPassword(adminPassword)]);

    await ensureCourse("Guitar");
  }

  await ensureBootstrap();

  async function createSession({ principalType, userId = null, studentId = null, role, ttlMilliseconds }) {
    const expiresAt = new Date(Date.now() + ttlMilliseconds).toISOString();
    const token = signSessionToken({
      version: 1,
      principalType,
      userId: userId ? number(userId) : null,
      studentId: studentId ? number(studentId) : null,
      role,
      exp: new Date(expiresAt).getTime(),
      nonce: randomBytes(16).toString("base64url")
    });
    await query(`
      INSERT INTO auth_sessions (token_hash, principal_type, user_id, student_id, role, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [hashToken(token), principalType, userId, studentId, role, expiresAt]);
    return { token, expiresAt };
  }

  async function authSession(request) {
    const token = getToken(request);
    const claims = verifySessionToken(token);
    if (!claims) return null;
    const row = await one(`
      SELECT auth.*, u.name AS staff_name, u.email AS staff_email,
        u.active AS staff_active, s.name AS student_name, s.active AS student_active,
        account.email AS student_email, account.active AS student_account_active
      FROM auth_sessions auth
      LEFT JOIN users u ON u.id = auth.user_id
      LEFT JOIN students s ON s.id = auth.student_id
      LEFT JOIN student_accounts account ON account.student_id = auth.student_id
      WHERE auth.token_hash = $1 AND auth.revoked_at IS NULL
    `, [hashToken(token)]);
    if (!row) return null;
    if (row.principal_type === "staff" && !row.staff_active) return null;
    if (row.principal_type === "student" && (!row.student_active || !row.student_account_active)) return null;
    if (
      claims.principalType !== row.principal_type ||
      String(claims.userId || "") !== String(row.user_id || "") ||
      String(claims.studentId || "") !== String(row.student_id || "") ||
      claims.role !== row.role
    ) return null;
    if (new Date(row.expires_at) <= new Date()) {
      await query("UPDATE auth_sessions SET revoked_at = NOW() WHERE id = $1", [row.id]);
      return null;
    }
    await query("UPDATE auth_sessions SET last_seen_at = NOW() WHERE id = $1", [row.id]);
    return {
      sessionId: number(row.id),
      principalType: row.principal_type,
      userId: row.user_id ? number(row.user_id) : null,
      studentId: row.student_id ? number(row.student_id) : null,
      role: row.role,
      name: row.principal_type === "staff" ? row.staff_name : row.student_name,
      email: row.principal_type === "staff" ? row.staff_email : row.student_email,
      expiresAt: row.expires_at
    };
  }

  async function requireStaff(request, response, roles = []) {
    const session = await authSession(request);
    if (!session || session.principalType !== "staff") {
      sendJson(response, 401, { error: "Authentication required" });
      return null;
    }
    if (roles.length && !roles.includes(session.role)) {
      sendJson(response, 403, { error: "Insufficient permission" });
      return null;
    }
    return session;
  }

  async function requireStudent(request, response) {
    const session = await authSession(request);
    if (!session || session.principalType !== "student" || !session.studentId) {
      sendJson(response, 401, { error: "Student login required" });
      return null;
    }
    return session;
  }

  async function teacherScope(session) {
    if (session.role !== "teacher") return null;
    const teacher = await one("SELECT id FROM teachers WHERE user_id = $1 AND active = TRUE", [session.userId]);
    return teacher ? number(teacher.id) : -1;
  }

  async function recalculateStudent(studentId) {
    const submission = await one(`
      SELECT COUNT(*)::int AS count FROM practice_submissions
      WHERE student_id = $1 AND uploaded_at >= NOW() - INTERVAL '6 days'
    `, [studentId]);
    const attendance = await one(`
      SELECT COUNT(*) FILTER (WHERE status = 'attended')::int AS attended,
        COUNT(*) FILTER (WHERE status IN ('attended', 'missed'))::int AS completed
      FROM live_sessions
      WHERE student_id = $1 AND scheduled_at >= NOW() - INTERVAL '30 days' AND scheduled_at <= NOW()
    `, [studentId]);
    const rating = await one(`
      SELECT AVG((rhythm + accuracy + technique + posture + musicality + confidence) / 6.0) AS skill_average,
        AVG(feedback_application) AS feedback_average
      FROM (SELECT * FROM skill_ratings WHERE student_id = $1 ORDER BY rated_at DESC LIMIT 10) recent
    `, [studentId]);
    const practiceScore = clamp((number(submission?.count) / 14) * 100, 0, 100);
    const attendanceScore = number(attendance?.completed)
      ? (number(attendance.attended) / number(attendance.completed)) * 100
      : 100;
    const skillScore = rating?.skill_average ? (number(rating.skill_average) / 5) * 100 : 50;
    const feedbackScore = rating?.feedback_average ? (number(rating.feedback_average) / 5) * 100 : 50;
    const overallScore = Math.round(
      practiceScore * 0.35 + attendanceScore * 0.25 + skillScore * 0.25 + feedbackScore * 0.15
    );
    const status = overallScore >= 80 ? "green" : overallScore >= 55 ? "amber" : "red";
    await query(`
      INSERT INTO progress_snapshots (
        student_id, snapshot_date, practice_score, attendance_score, skill_score,
        feedback_score, overall_score, status
      ) VALUES ($1, (NOW() AT TIME ZONE 'Asia/Kolkata')::date, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (student_id, snapshot_date) DO UPDATE SET
        practice_score = EXCLUDED.practice_score,
        attendance_score = EXCLUDED.attendance_score,
        skill_score = EXCLUDED.skill_score,
        feedback_score = EXCLUDED.feedback_score,
        overall_score = EXCLUDED.overall_score,
        status = EXCLUDED.status
    `, [
      studentId, Math.round(practiceScore), Math.round(attendanceScore), Math.round(skillScore),
      Math.round(feedbackScore), overallScore, status
    ]);
    await query("DELETE FROM student_alerts WHERE student_id = $1 AND source = 'system' AND resolved = FALSE", [studentId]);
    if (number(submission?.count) < 10) {
      await query(`
        INSERT INTO student_alerts (student_id, type, severity, title, detail)
        VALUES ($1, 'practice_consistency', $2, 'Practice check-ins are below target', $3)
      `, [
        studentId,
        number(submission?.count) < 5 ? "critical" : "warning",
        `${number(submission?.count)} of 14 expected check-ins were submitted in the last seven days.`
      ]);
    }
    if (overallScore < 55) {
      await query(`
        INSERT INTO student_alerts (student_id, type, severity, title, detail)
        VALUES ($1, 'student_at_risk', 'critical', 'Student requires intervention', $2)
      `, [studentId, `The current weighted progress score is ${overallScore}. Academic review is recommended.`]);
    }
    return { practiceScore, attendanceScore, skillScore, feedbackScore, overallScore, status };
  }

  async function studentAnalysis(studentId) {
    const student = await one(`
      SELECT s.*, account.email, account.email_verified_at, u.name AS teacher_name,
        t.instrument AS teacher_instrument, ps.practice_score, ps.attendance_score,
        ps.skill_score, ps.feedback_score, ps.overall_score, ps.status AS analysis_status
      FROM students s
      LEFT JOIN student_accounts account ON account.student_id = s.id
      JOIN teachers t ON t.id = s.assigned_teacher_id
      JOIN users u ON u.id = t.user_id
      LEFT JOIN LATERAL (
        SELECT * FROM progress_snapshots WHERE student_id = s.id ORDER BY snapshot_date DESC LIMIT 1
      ) ps ON TRUE
      WHERE s.id = $1
    `, [studentId]);
    if (!student) return null;
    const [latestSkills, skillTrend, submissions, sessions, alerts, helpCalls] = await Promise.all([
      one("SELECT * FROM skill_ratings WHERE student_id = $1 ORDER BY rated_at DESC LIMIT 1", [studentId]),
      query(`
        SELECT course_week, ROUND(AVG((rhythm + accuracy + technique + posture + musicality + confidence) / 6.0), 2) AS average
        FROM skill_ratings WHERE student_id = $1 GROUP BY course_week ORDER BY course_week
      `, [studentId]),
      query(`
        SELECT ps.*, tr.positive_observation, tr.main_correction, tr.next_practice_focus
        FROM practice_submissions ps LEFT JOIN teacher_reviews tr ON tr.submission_id = ps.id
        WHERE ps.student_id = $1 ORDER BY ps.uploaded_at DESC LIMIT 20
      `, [studentId]),
      query("SELECT * FROM live_sessions WHERE student_id = $1 ORDER BY scheduled_at DESC LIMIT 12", [studentId]),
      query(`
        SELECT * FROM student_alerts WHERE student_id = $1 AND resolved = FALSE
        ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, created_at DESC
      `, [studentId]),
      query("SELECT * FROM help_calls WHERE student_id = $1 ORDER BY scheduled_at DESC LIMIT 8", [studentId])
    ]);
    return { student, latestSkills, skillTrend, submissions, sessions, alerts, helpCalls };
  }

  async function todaySubmissions(studentId) {
    return query(`
      SELECT period, review_status, file_name, uploaded_at, duration_seconds
      FROM practice_submissions
      WHERE student_id = $1
        AND (uploaded_at AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
      ORDER BY uploaded_at DESC
    `, [studentId]);
  }

  function practiceGate(submissions) {
    const currentHour = number(new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false
    }).format(new Date()));
    const duePeriods = currentHour >= 17 ? ["morning", "evening"] : ["morning"];
    const submitted = new Set(submissions
      .filter((item) => number(item.duration_seconds) >= minPracticeSeconds)
      .map((item) => item.period));
    const missingPeriods = duePeriods.filter((period) => !submitted.has(period));
    const activePeriod = missingPeriods[0] || null;
    return {
      locked: Boolean(activePeriod),
      activePeriod,
      missingPeriods,
      duePeriods,
      minDurationSeconds: minPracticeSeconds,
      message: activePeriod
        ? `${activePeriod === "morning" ? "Morning" : "Evening"} practice is required before using the app. Upload at least ${Math.round(minPracticeSeconds / 60)} minutes.`
        : "Practice gate is clear for now."
    };
  }

  async function dashboard(session) {
    const scope = await teacherScope(session);
    const summary = await one(`
      SELECT COUNT(*)::int AS active_students,
        COUNT(*) FILTER (WHERE snap.status = 'green')::int AS green_students,
        COUNT(*) FILTER (WHERE snap.status = 'amber')::int AS amber_students,
        COUNT(*) FILTER (WHERE snap.status = 'red')::int AS red_students,
        ROUND(AVG(snap.overall_score), 1) AS average_score
      FROM students s
      LEFT JOIN LATERAL (
        SELECT * FROM progress_snapshots WHERE student_id = s.id ORDER BY snapshot_date DESC LIMIT 1
      ) snap ON TRUE
      WHERE s.active = TRUE AND ($1::bigint IS NULL OR s.assigned_teacher_id = $1)
    `, [scope]);
    const counts = await one(`
      SELECT
        (SELECT COUNT(*) FROM practice_submissions WHERE review_status = 'pending'
          AND ($1::bigint IS NULL OR teacher_id = $1))::int AS pending_reviews,
        (SELECT COUNT(*) FROM live_sessions WHERE scheduled_at::date = CURRENT_DATE AND status = 'scheduled'
          AND ($1::bigint IS NULL OR teacher_id = $1))::int AS todays_sessions,
        (SELECT COUNT(*) FROM student_alerts a JOIN students s ON s.id = a.student_id
          WHERE a.resolved = FALSE AND ($1::bigint IS NULL OR s.assigned_teacher_id = $1))::int AS open_alerts
    `, [scope]);
    const attentionStudents = await query(`
      SELECT s.id, s.name, s.instrument, s.current_week, u.name AS teacher_name,
        snap.overall_score, snap.status, COUNT(a.id)::int AS alert_count
      FROM students s JOIN teachers t ON t.id = s.assigned_teacher_id JOIN users u ON u.id = t.user_id
      LEFT JOIN LATERAL (
        SELECT * FROM progress_snapshots WHERE student_id = s.id ORDER BY snapshot_date DESC LIMIT 1
      ) snap ON TRUE
      LEFT JOIN student_alerts a ON a.student_id = s.id AND a.resolved = FALSE
      WHERE s.active = TRUE AND ($1::bigint IS NULL OR s.assigned_teacher_id = $1)
      GROUP BY s.id, u.name, snap.overall_score, snap.status
      ORDER BY CASE snap.status WHEN 'red' THEN 1 WHEN 'amber' THEN 2 ELSE 3 END, snap.overall_score
      LIMIT 5
    `, [scope]);
    const practiceTrend = await query(`
      SELECT uploaded_at::date AS date, COUNT(*)::int AS submissions
      FROM practice_submissions WHERE uploaded_at >= NOW() - INTERVAL '6 days'
        AND ($1::bigint IS NULL OR teacher_id = $1)
      GROUP BY uploaded_at::date ORDER BY date
    `, [scope]);
    const upcomingSessions = await query(`
      SELECT ls.*, s.name AS student_name, u.name AS teacher_name
      FROM live_sessions ls JOIN students s ON s.id = ls.student_id
      JOIN teachers t ON t.id = ls.teacher_id JOIN users u ON u.id = t.user_id
      WHERE ls.status = 'scheduled' AND ls.scheduled_at >= NOW()
        AND ($1::bigint IS NULL OR ls.teacher_id = $1)
      ORDER BY ls.scheduled_at LIMIT 8
    `, [scope]);
    return {
      summary: { ...summary, ...counts, review_turnaround_hours: 0 },
      attentionStudents, practiceTrend, upcomingSessions
    };
  }

  async function handle(request, response, url) {
    const pathname = url.pathname;

    if (pathname === "/api/health" && request.method === "GET") {
      return sendJson(response, 200, {
        status: "ok", database: "neon-postgresql",
        emailDelivery: environment.RESEND_API_KEY && environment.EMAIL_FROM
          ? "resend"
          : "unconfigured",
        videoStorage: "metadata-only-mvp",
        time: new Date().toISOString()
      });
    }

    if (pathname === "/api/student-auth/request-otp" && request.method === "POST") {
      const body = await readJson(request);
      const email = normalizeEmail(body.email);
      if (!isValidEmail(email)) return sendJson(response, 400, { error: "Enter a valid email address" });
      const account = await one(`
        SELECT account.*, s.name AS student_name FROM student_accounts account
        JOIN students s ON s.id = account.student_id
        WHERE account.email = $1 AND account.active = TRUE AND s.active = TRUE
      `, [email]);
      const generic = "If this email is registered, a login code has been sent.";
      if (!account) {
        return sendJson(response, 200, {
          ok: true,
          message: generic,
          sessionId: randomUUID(),
          expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000).toISOString(),
          expiresInSeconds: OTP_EXPIRY_MINUTES * 60
        });
      }
      const recent = await one(`
        SELECT COUNT(*)::int AS count, MAX(created_at) AS latest_created_at
        FROM otp_challenges
        WHERE student_account_id = $1 AND created_at >= NOW() - INTERVAL '1 hour'
      `, [account.id]);
      if (number(recent?.count) >= 5) {
        return sendJson(response, 429, { error: "Too many codes requested. Please try again after one hour." });
      }
      if (
        recent?.latest_created_at &&
        Date.now() - new Date(recent.latest_created_at).getTime() < 60_000
      ) {
        return sendJson(response, 429, { error: "Please wait 60 seconds before requesting another code." });
      }
      await query("UPDATE otp_challenges SET consumed_at = NOW() WHERE student_account_id = $1 AND consumed_at IS NULL", [account.id]);
      const code = String(randomInt(100000, 1_000_000));
      const otpSessionId = randomUUID();
      const challenge = await one(`
        INSERT INTO otp_challenges (student_account_id, session_id, code_hash, code_salt, expires_at)
        VALUES ($1, $2, $3, $4, NOW() + INTERVAL '5 minutes')
        RETURNING id, expires_at
      `, [account.id, otpSessionId, hashOtp(code, otpSessionId, otpSecret), otpSessionId]);
      try {
        await deliverOtpEmail({ email, studentName: account.student_name, code, challengeId: challenge.id });
        await query("UPDATE otp_challenges SET delivery_status = 'sent' WHERE id = $1", [challenge.id]);
        return sendJson(response, 200, {
          ok: true,
          message: "Login code sent to your email.",
          sessionId: otpSessionId,
          expiresAt: challenge.expires_at,
          expiresInSeconds: 300
        });
      } catch (error) {
        await query("UPDATE otp_challenges SET delivery_status = 'failed' WHERE id = $1", [challenge.id]);
        console.error(error);
        return sendJson(response, 503, { error: "The login email could not be sent. Please contact support." });
      }
    }

    if (pathname === "/api/student-auth/verify-otp" && request.method === "POST") {
      const body = await readJson(request);
      const email = normalizeEmail(body.email);
      const otpSessionId = String(body.sessionId || "").trim();
      const code = String(body.otp || "").trim();
      if (!isValidEmail(email) || !otpSessionId || !/^\d{6}$/.test(code)) {
        return sendJson(response, 400, { error: "Enter the six-digit login code" });
      }
      const account = await one(`
        SELECT account.*, s.name AS student_name FROM student_accounts account
        JOIN students s ON s.id = account.student_id
        WHERE account.email = $1 AND account.active = TRUE AND s.active = TRUE
      `, [email]);
      if (!account) return sendJson(response, 401, { error: "Invalid or expired login code" });
      const challenge = await one(`
        SELECT * FROM otp_challenges WHERE student_account_id = $1 AND session_id = $2
          AND consumed_at IS NULL AND delivery_status = 'sent'
        LIMIT 1
      `, [account.id, otpSessionId]);
      if (!challenge || new Date(challenge.expires_at) <= new Date() || number(challenge.attempts) >= number(challenge.max_attempts)) {
        return sendJson(response, 401, { error: "Invalid or expired login code" });
      }
      if (!otpMatches(code, otpSessionId, challenge.code_hash, otpSecret)) {
        await query("UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = $1", [challenge.id]);
        return sendJson(response, 401, { error: "Invalid or expired login code" });
      }
      await query("UPDATE otp_challenges SET consumed_at = NOW() WHERE id = $1", [challenge.id]);
      await query("UPDATE student_accounts SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = $1", [account.id]);
      const auth = await createSession({
        principalType: "student", studentId: account.student_id, role: "student",
        ttlMilliseconds: STUDENT_SESSION_DAYS * 86_400_000
      });
      await audit(null, "student_login", "student", account.student_id, { email });
      return sendJson(response, 200, {
        token: auth.token, expiresAt: auth.expiresAt,
        student: { id: number(account.student_id), name: account.student_name, email }
      });
    }

    if (pathname === "/api/student-auth/me" && request.method === "GET") {
      const session = await requireStudent(request, response);
      if (!session) return;
      return sendJson(response, 200, { student: { id: session.studentId, name: session.name, email: session.email }, expiresAt: session.expiresAt });
    }

    if (pathname === "/api/student-auth/logout" && request.method === "POST") {
      const session = await requireStudent(request, response);
      if (!session) return;
      await query("UPDATE auth_sessions SET revoked_at = NOW() WHERE id = $1", [session.sessionId]);
      return sendJson(response, 200, { ok: true });
    }

    if (pathname === "/api/auth/login" && request.method === "POST") {
      const body = await readJson(request);
      const user = await one("SELECT * FROM users WHERE email = $1 AND active = TRUE", [normalizeEmail(body.email)]);
      if (!user || !verifyPassword(String(body.password || ""), user.password_hash)) {
        return sendJson(response, 401, { error: "Invalid email or password" });
      }
      const auth = await createSession({
        principalType: "staff", userId: user.id, role: user.role,
        ttlMilliseconds: STAFF_SESSION_HOURS * 3_600_000
      });
      audit(user.id, "login", "user", user.id).catch((error) => {
        console.error("Could not write staff login audit log", error);
      });
      return sendJson(response, 200, {
        token: auth.token,
        user: { userId: number(user.id), name: user.name, email: user.email, role: user.role, expiresAt: auth.expiresAt }
      });
    }

    if (pathname === "/api/auth/me" && request.method === "GET") {
      const session = await requireStaff(request, response);
      if (!session) return;
      return sendJson(response, 200, { user: session });
    }

    if (pathname === "/api/auth/logout" && request.method === "POST") {
      const session = await requireStaff(request, response);
      if (!session) return;
      await query("UPDATE auth_sessions SET revoked_at = NOW() WHERE id = $1", [session.sessionId]);
      return sendJson(response, 200, { ok: true });
    }

    if (pathname === "/api/dashboard" && request.method === "GET") {
      const session = await requireStaff(request, response, ["super_admin", "academic_head", "teacher", "operations"]);
      if (!session) return;
      return sendJson(response, 200, await dashboard(session));
    }

    if (pathname === "/api/teachers" && request.method === "GET") {
      const session = await requireStaff(request, response, ["super_admin", "academic_head", "operations"]);
      if (!session) return;
      const teachers = await query(`
        SELECT t.id, u.name, u.email, t.instrument, t.bio, t.review_sla_hours,
          COUNT(DISTINCT s.id)::int AS student_count,
          COUNT(DISTINCT p.id) FILTER (WHERE p.review_status = 'pending')::int AS pending_reviews,
          0::int AS attention_count, 0::numeric AS review_turnaround_hours
        FROM teachers t JOIN users u ON u.id = t.user_id
        LEFT JOIN students s ON s.assigned_teacher_id = t.id AND s.active = TRUE
        LEFT JOIN practice_submissions p ON p.teacher_id = t.id
        WHERE t.active = TRUE AND u.active = TRUE
        GROUP BY t.id, u.name, u.email ORDER BY u.name
      `);
      return sendJson(response, 200, { teachers });
    }

    if (pathname === "/api/staff" && request.method === "GET") {
      const session = await requireStaff(request, response, ["super_admin"]);
      if (!session) return;
      const staff = await query(`
        SELECT u.id, u.name, u.email, u.role, u.active, u.created_at,
          t.id AS teacher_id, t.instrument,
          COUNT(DISTINCT s.id)::int AS student_count
        FROM users u
        LEFT JOIN teachers t ON t.user_id = u.id
        LEFT JOIN students s ON s.assigned_teacher_id = t.id AND s.active = TRUE
        GROUP BY u.id, t.id
        ORDER BY u.active DESC, u.name
      `);
      return sendJson(response, 200, { staff });
    }

    if (pathname === "/api/staff" && request.method === "POST") {
      const session = await requireStaff(request, response, ["super_admin"]);
      if (!session) return;
      const body = await readJson(request);
      const name = String(body.name || "").trim();
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");
      const role = String(body.role || "");
      const instrument = String(body.instrument || "").trim();
      const allowedRoles = ["super_admin", "academic_head", "operations", "teacher"];
      if (name.length < 2 || !isValidEmail(email) || password.length < 8 || !allowedRoles.includes(role)) {
        return sendJson(response, 400, { error: "Name, valid email, role and a password of at least 8 characters are required" });
      }
      if (role === "teacher" && !instrument) {
        return sendJson(response, 400, { error: "Instrument is required for a teacher" });
      }
      if (await one("SELECT id FROM users WHERE email = $1", [email])) {
        return sendJson(response, 409, { error: "A staff account already uses this email" });
      }
      const user = await one(`
        INSERT INTO users (name, email, password_hash, role)
        VALUES ($1, $2, $3, $4) RETURNING id
      `, [name, email, hashPassword(password), role]);
      if (role === "teacher") {
        await query(`
          INSERT INTO teachers (user_id, instrument, bio, review_sla_hours)
          VALUES ($1, $2, $3, 12)
        `, [user.id, instrument, "MUSIC SCHOOL OTS teacher."]);
        await ensureCourse(instrument);
      }
      await audit(session.userId, "create_staff", "user", user.id, { email, role });
      return sendJson(response, 201, {
        id: number(user.id), name, email, role, active: true,
        instrument: role === "teacher" ? instrument : null
      });
    }

    const staffStatusMatch = pathname.match(/^\/api\/staff\/(\d+)\/status$/);
    if (staffStatusMatch && request.method === "PATCH") {
      const session = await requireStaff(request, response, ["super_admin"]);
      if (!session) return;
      const staffId = number(staffStatusMatch[1]);
      const body = await readJson(request);
      const active = Boolean(body.active);
      const target = await one(`
        SELECT u.*, t.id AS teacher_id
        FROM users u LEFT JOIN teachers t ON t.user_id = u.id
        WHERE u.id = $1
      `, [staffId]);
      if (!target) return sendJson(response, 404, { error: "Staff account not found" });
      if (staffId === session.userId && !active) {
        return sendJson(response, 400, { error: "You cannot deactivate your own account" });
      }
      if (!active && target.teacher_id) {
        const assigned = await one(
          "SELECT COUNT(*)::int AS count FROM students WHERE assigned_teacher_id = $1 AND active = TRUE",
          [target.teacher_id]
        );
        if (number(assigned?.count) > 0) {
          return sendJson(response, 409, { error: "Reassign this teacher's active students before deactivating the account" });
        }
      }
      await query("UPDATE users SET active = $1 WHERE id = $2", [active, staffId]);
      if (target.teacher_id) await query("UPDATE teachers SET active = $1 WHERE id = $2", [active, target.teacher_id]);
      if (!active) {
        await query("UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL", [staffId]);
      }
      await audit(session.userId, active ? "activate_staff" : "deactivate_staff", "user", staffId);
      return sendJson(response, 200, { ok: true, active });
    }

    if (pathname === "/api/students" && request.method === "GET") {
      const session = await requireStaff(request, response, ["super_admin", "academic_head", "teacher", "operations"]);
      if (!session) return;
      const scope = await teacherScope(session);
      let students = await query(`
        SELECT s.id, s.name, s.age_group, s.instrument, s.goal, s.current_week,
          s.parent_name, s.parent_email, account.email, u.name AS teacher_name,
          t.id AS teacher_id, snap.practice_score, snap.attendance_score, snap.skill_score,
          snap.feedback_score, snap.overall_score, snap.status,
          COUNT(DISTINCT a.id)::int AS alert_count,
          COUNT(DISTINCT p.id) FILTER (WHERE p.review_status = 'pending')::int AS pending_reviews
        FROM students s JOIN teachers t ON t.id = s.assigned_teacher_id JOIN users u ON u.id = t.user_id
        LEFT JOIN student_accounts account ON account.student_id = s.id
        LEFT JOIN LATERAL (
          SELECT * FROM progress_snapshots WHERE student_id = s.id ORDER BY snapshot_date DESC LIMIT 1
        ) snap ON TRUE
        LEFT JOIN student_alerts a ON a.student_id = s.id AND a.resolved = FALSE
        LEFT JOIN practice_submissions p ON p.student_id = s.id
        WHERE s.active = TRUE AND ($1::bigint IS NULL OR s.assigned_teacher_id = $1)
        GROUP BY s.id, account.email, u.name, t.id, snap.practice_score, snap.attendance_score,
          snap.skill_score, snap.feedback_score, snap.overall_score, snap.status
      `, [scope]);
      const status = url.searchParams.get("status");
      const teacherId = url.searchParams.get("teacherId");
      const search = url.searchParams.get("search")?.trim().toLowerCase();
      students = students
        .filter((row) => !status || row.status === status)
        .filter((row) => !teacherId || String(row.teacher_id) === teacherId)
        .filter((row) => !search || `${row.name} ${row.instrument} ${row.teacher_name}`.toLowerCase().includes(search))
        .sort((a, b) => statusRank(a.status) - statusRank(b.status) || number(a.overall_score) - number(b.overall_score));
      return sendJson(response, 200, { students });
    }

    if (pathname === "/api/students" && request.method === "POST") {
      const session = await requireStaff(request, response, ["super_admin", "academic_head", "operations"]);
      if (!session) return;
      const body = await readJson(request);
      const email = normalizeEmail(body.email);
      const parentEmail = normalizeEmail(body.parentEmail);
      const name = String(body.name || "").trim();
      const teacherId = number(body.teacherId);
      if (name.length < 2 || !isValidEmail(email) || !body.instrument || !body.goal || !body.ageGroup || !teacherId) {
        return sendJson(response, 400, { error: "Name, email, age group, instrument, goal and teacher are required" });
      }
      if (parentEmail && !isValidEmail(parentEmail)) return sendJson(response, 400, { error: "Enter a valid parent email address" });
      if (await one("SELECT id FROM student_accounts WHERE email = $1", [email])) {
        return sendJson(response, 409, { error: "A student account already uses this email" });
      }
      const teacher = await one("SELECT id, instrument FROM teachers WHERE id = $1 AND active = TRUE", [teacherId]);
      if (!teacher || teacher.instrument !== body.instrument) return sendJson(response, 400, { error: "Choose a matching active teacher" });
      const course = await one("SELECT id FROM courses WHERE instrument = $1 AND active = TRUE ORDER BY id LIMIT 1", [body.instrument]);
      if (!course) return sendJson(response, 400, { error: "No active course exists for this instrument" });
      const student = await one(`
        INSERT INTO students (
          name, age_group, instrument, goal, assigned_teacher_id, current_week,
          course_start_date, parent_name, parent_email
        ) VALUES ($1, $2, $3, $4, $5, 1, $6, $7, $8) RETURNING id
      `, [
        name, body.ageGroup, body.instrument, String(body.goal).trim(), teacherId,
        body.courseStartDate || new Date().toISOString().slice(0, 10),
        String(body.parentName || "").trim() || null, parentEmail || null
      ]);
      await query("INSERT INTO student_accounts (student_id, email) VALUES ($1, $2)", [student.id, email]);
      await query("INSERT INTO student_preferences (student_id) VALUES ($1)", [student.id]);
      await query("INSERT INTO enrollments (student_id, course_id) VALUES ($1, $2)", [student.id, course.id]);
      await recalculateStudent(student.id);
      await audit(session.userId, "create_student", "student", student.id, { email, teacherId });
      return sendJson(response, 201, { student: await studentAnalysis(student.id) });
    }

    const studentMatch = pathname.match(/^\/api\/students\/(\d+)$/);
    if (studentMatch && request.method === "GET") {
      const session = await requireStaff(request, response, ["super_admin", "academic_head", "teacher", "operations"]);
      if (!session) return;
      const studentId = number(studentMatch[1]);
      const scope = await teacherScope(session);
      if (scope !== null && !(await one("SELECT id FROM students WHERE id = $1 AND assigned_teacher_id = $2", [studentId, scope]))) {
        return sendJson(response, 403, { error: "Student is outside your assigned roster" });
      }
      const analysis = await studentAnalysis(studentId);
      return analysis ? sendJson(response, 200, analysis) : sendJson(response, 404, { error: "Student not found" });
    }

    if (pathname === "/api/reviews" && request.method === "GET") {
      const session = await requireStaff(request, response, ["super_admin", "academic_head", "teacher"]);
      if (!session) return;
      const scope = await teacherScope(session);
      const status = url.searchParams.get("status") || "pending";
      const submissions = await query(`
        SELECT p.*, s.name AS student_name, s.instrument, s.current_week, u.name AS teacher_name,
          ROUND(EXTRACT(EPOCH FROM (NOW() - p.uploaded_at)) / 3600, 1) AS waiting_hours
        FROM practice_submissions p JOIN students s ON s.id = p.student_id
        JOIN teachers t ON t.id = p.teacher_id JOIN users u ON u.id = t.user_id
        WHERE p.review_status = $1 AND ($2::bigint IS NULL OR p.teacher_id = $2)
        ORDER BY p.uploaded_at
      `, [status, scope]);
      return sendJson(response, 200, { submissions });
    }

    const reviewMatch = pathname.match(/^\/api\/reviews\/(\d+)$/);
    if (reviewMatch && request.method === "POST") {
      const session = await requireStaff(request, response, ["super_admin", "academic_head", "teacher"]);
      if (!session) return;
      const submission = await one("SELECT * FROM practice_submissions WHERE id = $1", [reviewMatch[1]]);
      if (!submission) return sendJson(response, 404, { error: "Submission not found" });
      const scope = await teacherScope(session);
      if (scope !== null && number(submission.teacher_id) !== scope) return sendJson(response, 403, { error: "Submission is outside your queue" });
      if (submission.review_status === "reviewed") return sendJson(response, 409, { error: "Submission already reviewed" });
      const body = await readJson(request);
      const ratings = normalizeSkillPayload(body.ratings || {});
      const review = await one(`
        INSERT INTO teacher_reviews (
          submission_id, teacher_id, positive_observation, main_correction,
          next_practice_focus, requires_help_call
        ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
      `, [
        submission.id, submission.teacher_id, body.positiveObservation || "Good focused practice.",
        body.mainCorrection || "Continue with slow repetition.",
        body.nextPracticeFocus || "Repeat the assigned exercise three times.",
        Boolean(body.requiresHelpCall)
      ]);
      await query(`
        INSERT INTO skill_ratings (
          review_id, student_id, course_week, rhythm, accuracy, technique, posture,
          musicality, confidence, feedback_application
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `, [
        review.id, submission.student_id, submission.course_week, ratings.rhythm, ratings.accuracy,
        ratings.technique, ratings.posture, ratings.musicality, ratings.confidence, ratings.feedback_application
      ]);
      await query("UPDATE practice_submissions SET review_status = 'reviewed', reviewed_at = NOW() WHERE id = $1", [submission.id]);
      await recalculateStudent(submission.student_id);
      await audit(session.userId, "review_submission", "practice_submission", submission.id);
      return sendJson(response, 201, { ok: true, student: await studentAnalysis(submission.student_id) });
    }

    const reviewVideoMatch = pathname.match(/^\/api\/reviews\/(\d+)\/video-access$/);
    if (reviewVideoMatch && request.method === "GET") {
      const session = await requireStaff(request, response, ["super_admin", "academic_head", "teacher"]);
      if (!session) return;
      const submission = await one("SELECT * FROM practice_submissions WHERE id = $1", [reviewVideoMatch[1]]);
      if (!submission) return sendJson(response, 404, { error: "Submission not found" });
      const scope = await teacherScope(session);
      if (scope !== null && number(submission.teacher_id) !== scope) return sendJson(response, 403, { error: "Submission is outside your queue" });
      return sendJson(response, 200, {
        playbackUrl: null,
        storageMode: "metadata-only-mvp",
        message: "Video playback will be enabled in the next storage phase."
      });
    }

    if (pathname === "/api/alerts" && request.method === "GET") {
      const session = await requireStaff(request, response, ["super_admin", "academic_head", "teacher", "operations"]);
      if (!session) return;
      const scope = await teacherScope(session);
      const alerts = await query(`
        SELECT a.*, s.name AS student_name, s.instrument, u.name AS teacher_name
        FROM student_alerts a JOIN students s ON s.id = a.student_id
        JOIN teachers t ON t.id = s.assigned_teacher_id JOIN users u ON u.id = t.user_id
        WHERE a.resolved = FALSE AND ($1::bigint IS NULL OR s.assigned_teacher_id = $1)
        ORDER BY CASE a.severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, a.created_at DESC
      `, [scope]);
      return sendJson(response, 200, { alerts });
    }

    const alertMatch = pathname.match(/^\/api\/alerts\/(\d+)\/resolve$/);
    if (alertMatch && request.method === "POST") {
      const session = await requireStaff(request, response, ["super_admin", "academic_head", "teacher", "operations"]);
      if (!session) return;
      await query("UPDATE student_alerts SET resolved = TRUE, resolved_at = NOW() WHERE id = $1", [alertMatch[1]]);
      return sendJson(response, 200, { ok: true });
    }

    if (pathname === "/api/student/me" && request.method === "GET") {
      const session = await requireStudent(request, response);
      if (!session) return;
      const analysis = await studentAnalysis(session.studentId);
      if (!analysis) return sendJson(response, 404, { error: "Student not found" });
      const submissions = await todaySubmissions(session.studentId);
      const preferences = await one("SELECT * FROM student_preferences WHERE student_id = $1", [session.studentId]);
      return sendJson(response, 200, {
        profile: analysis.student,
        preferences: {
          morningReminder: preferences?.morning_reminder ?? true,
          eveningReminder: preferences?.evening_reminder ?? true,
          parentUpdates: preferences?.parent_updates ?? true
        },
        practiceGate: practiceGate(submissions),
        latestSkills: analysis.latestSkills,
        todaySubmissions: submissions,
        feedback: analysis.submissions.filter((item) => item.review_status === "reviewed").slice(0, 5),
        upcomingSessions: analysis.sessions
          .filter((item) => item.status === "scheduled" && new Date(item.scheduled_at) >= new Date())
          .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)).slice(0, 4),
        recentSubmissions: analysis.submissions.slice(0, 14),
        helpCalls: analysis.helpCalls.filter((item) => item.status === "scheduled")
      });
    }

    if (pathname === "/api/student/me/practice-submissions" && request.method === "POST") {
      const session = await requireStudent(request, response);
      if (!session) return;
      const body = await readJson(request);
      const student = await one("SELECT * FROM students WHERE id = $1", [session.studentId]);
      const durationSeconds = Math.round(number(body.durationSeconds));
      if (!["morning", "evening"].includes(body.period)) return sendJson(response, 400, { error: "Invalid practice period" });
      if (durationSeconds < minPracticeSeconds) return sendJson(response, 400, { error: "Practice video must be at least 7 minutes." });
      if (await one(`
        SELECT id FROM practice_submissions WHERE student_id = $1 AND period = $2
          AND (uploaded_at AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
      `, [session.studentId, body.period])) return sendJson(response, 409, { error: `${body.period} practice was already submitted today` });
      const submission = await one(`
        INSERT INTO practice_submissions (
          student_id, teacher_id, course_week, period, duration_seconds, file_name, storage_key
        ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, uploaded_at
      `, [
        session.studentId, student.assigned_teacher_id, student.current_week, body.period,
        durationSeconds,
        body.fileName || `${body.period}-practice.mp4`,
        `metadata/students/${session.studentId}/${body.period}-${Date.now()}-${randomBytes(6).toString("hex")}`
      ]);
      await recalculateStudent(session.studentId);
      return sendJson(response, 201, {
        id: number(submission.id), storageKey: "metadata-only",
        uploadedAt: submission.uploaded_at, reviewStatus: "pending"
      });
    }

    if (pathname === "/api/student/me/help-calls" && request.method === "POST") {
      const session = await requireStudent(request, response);
      if (!session) return;
      const body = await readJson(request);
      const student = await one("SELECT * FROM students WHERE id = $1", [session.studentId]);
      const call = await one(`
        INSERT INTO help_calls (student_id, teacher_id, topic, scheduled_at, status, room_name)
        VALUES ($1,$2,$3,$4,'scheduled',$5) RETURNING id, scheduled_at
      `, [
        session.studentId, student.assigned_teacher_id, body.topic || "Student requested support",
        body.scheduledAt || new Date(Date.now() + 86_400_000).toISOString(),
        `ots-help-${session.studentId}-${Date.now()}`
      ]);
      return sendJson(response, 201, { id: number(call.id), scheduledAt: call.scheduled_at, status: "scheduled" });
    }

    const cancelCall = pathname.match(/^\/api\/student\/me\/help-calls\/(\d+)\/cancel$/);
    if (cancelCall && request.method === "POST") {
      const session = await requireStudent(request, response);
      if (!session) return;
      const rows = await query(`
        UPDATE help_calls SET status = 'cancelled'
        WHERE id = $1 AND student_id = $2 AND status = 'scheduled' RETURNING id
      `, [cancelCall[1], session.studentId]);
      return rows.length
        ? sendJson(response, 200, { ok: true })
        : sendJson(response, 404, { error: "Scheduled help call not found" });
    }

    if (pathname === "/api/student/me/progress" && request.method === "POST") {
      const session = await requireStudent(request, response);
      if (!session) return;
      const body = await readJson(request);
      const week = clamp(number(body.currentWeek, 1), 1, 12);
      await query("UPDATE students SET current_week = $1 WHERE id = $2", [week, session.studentId]);
      await recalculateStudent(session.studentId);
      return sendJson(response, 200, { ok: true, currentWeek: week });
    }

    if (pathname === "/api/student/me/profile" && request.method === "PATCH") {
      const session = await requireStudent(request, response);
      if (!session) return;
      const body = await readJson(request);
      const name = String(body.name || "").trim();
      const goal = String(body.goal || "").trim();
      if (name.length < 2 || goal.length < 3) return sendJson(response, 400, { error: "Name and learning goal are required" });
      await query("UPDATE students SET name = $1, goal = $2 WHERE id = $3", [name, goal, session.studentId]);
      return sendJson(response, 200, { ok: true, profile: (await studentAnalysis(session.studentId)).student });
    }

    if (pathname === "/api/student/me/preferences" && request.method === "PATCH") {
      const session = await requireStudent(request, response);
      if (!session) return;
      const body = await readJson(request);
      await query(`
        INSERT INTO student_preferences (student_id, morning_reminder, evening_reminder, parent_updates)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (student_id) DO UPDATE SET morning_reminder = EXCLUDED.morning_reminder,
          evening_reminder = EXCLUDED.evening_reminder, parent_updates = EXCLUDED.parent_updates, updated_at = NOW()
      `, [session.studentId, Boolean(body.morningReminder), Boolean(body.eveningReminder), Boolean(body.parentUpdates)]);
      return sendJson(response, 200, { ok: true });
    }

    return sendJson(response, 404, { error: "API route not found" });
  }

  return handle;
}
