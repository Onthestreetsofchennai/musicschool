import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { createServer } from "node:http";
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual
} from "node:crypto";
import {
  createDatabase,
  getStudentAnalysis,
  logAudit,
  normalizeSkillPayload,
  recalculateStudent,
  verifyPassword
} from "./backend/database.mjs";
import { createNeonApi } from "./backend/neon-api.mjs";

const ROOT = resolve(".");
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || (IS_PRODUCTION ? "0.0.0.0" : "127.0.0.1");
const USE_NEON = Boolean(process.env.DATABASE_URL);
const db = USE_NEON ? null : createDatabase(join(ROOT, "data", "ots.db"));
const OTP_SECRET = process.env.OTP_SECRET || "music-school-ots-development-secret";
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "";
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || "";
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || "";
const OTP_EXPIRY_MINUTES = 10;
const STUDENT_SESSION_DAYS = 14;
const STAFF_SESSION_HOURS = 12;
const MIN_PRACTICE_SECONDS = Number(process.env.MIN_PRACTICE_SECONDS || 420);
const MAX_PRACTICE_VIDEO_BYTES = Number(process.env.MAX_PRACTICE_VIDEO_BYTES || 100_000_000);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp4": "video/mp4"
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolveBody, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body is too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body) return resolveBody({});
      try {
        resolveBody(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    request.on("error", reject);
  });
}

function getToken(request) {
  const authorization = request.headers.authorization || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
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

function createPracticeUploadReceipt({ studentId, period, publicId }) {
  const payload = Buffer.from(JSON.stringify({
    action: "upload",
    studentId,
    period,
    publicId,
    expiresAt: Date.now() + 10 * 60 * 1000
  })).toString("base64url");
  const signature = createHmac("sha256", OTP_SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyPracticeUploadReceipt(receipt, { studentId, period, storageKey }) {
  const [payload, signature] = String(receipt || "").split(".");
  if (!payload || !signature) return false;
  const expected = createHmac("sha256", OTP_SECRET).update(payload).digest("base64url");
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.action === "upload" &&
      Number(data.studentId) === Number(studentId) &&
      data.period === period &&
      Date.now() <= Number(data.expiresAt) &&
      String(storageKey).startsWith(`${data.publicId}.`);
  } catch {
    return false;
  }
}

function signCloudinaryParameters(parameters) {
  const serialized = Object.entries(parameters)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return createHash("sha1").update(`${serialized}${CLOUDINARY_API_SECRET}`).digest("hex");
}

function cloudinaryIsConfigured() {
  return Boolean(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);
}

function createCloudinaryPrivateDownloadUrl(storageKey) {
  const separator = storageKey.lastIndexOf(".");
  if (separator <= 0 || separator === storageKey.length - 1) return null;
  const publicId = storageKey.slice(0, separator);
  const format = storageKey.slice(separator + 1);
  const timestamp = Math.floor(Date.now() / 1000);
  const expiresAt = timestamp + 15 * 60;
  const parameters = {
    expires_at: expiresAt,
    format,
    public_id: publicId,
    timestamp,
    type: "private"
  };
  const query = new URLSearchParams({
    ...Object.fromEntries(Object.entries(parameters).map(([key, value]) => [key, String(value)])),
    signature: signCloudinaryParameters(parameters),
    api_key: CLOUDINARY_API_KEY
  });
  return `https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUDINARY_CLOUD_NAME)}/video/download?${query}`;
}

function cloudinaryUploadConfig({ studentId, period }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `music-school-ots/students/${studentId}/${period}-${timestamp}-${randomUUID()}`;
  const uploadParameters = { public_id: publicId, timestamp, type: "private" };
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUDINARY_CLOUD_NAME)}/video/upload`,
    cloudName: CLOUDINARY_CLOUD_NAME,
    apiKey: CLOUDINARY_API_KEY,
    timestamp,
    publicId,
    deliveryType: "private",
    signature: signCloudinaryParameters(uploadParameters),
    storageMode: "cloudinary-private"
  };
}

function createAuthSession({ principalType, userId = null, studentId = null, role, ttlMilliseconds }) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMilliseconds);
  db.prepare(`
    INSERT INTO auth_sessions (
      token_hash, principal_type, user_id, student_id, role,
      created_at, expires_at, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    hashToken(token),
    principalType,
    userId,
    studentId,
    role,
    now.toISOString(),
    expiresAt.toISOString(),
    now.toISOString()
  );
  return { token, expiresAt: expiresAt.toISOString() };
}

function getAuthSession(request) {
  const token = getToken(request);
  if (!token) return null;
  const tokenHash = hashToken(token);
  const row = db.prepare(`
    SELECT
      auth.*,
      u.name AS staff_name,
      u.email AS staff_email,
      s.name AS student_name,
      account.email AS student_email
    FROM auth_sessions auth
    LEFT JOIN users u ON u.id = auth.user_id
    LEFT JOIN students s ON s.id = auth.student_id
    LEFT JOIN student_accounts account ON account.student_id = auth.student_id
    WHERE auth.token_hash = ? AND auth.revoked_at IS NULL
  `).get(tokenHash);
  if (!row) return null;
  if (new Date(row.expires_at) <= new Date()) {
    db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE id = ?").run(new Date().toISOString(), row.id);
    return null;
  }
  db.prepare("UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?").run(new Date().toISOString(), row.id);
  return {
    sessionId: row.id,
    tokenHash,
    principalType: row.principal_type,
    userId: row.user_id,
    studentId: row.student_id,
    role: row.role,
    name: row.principal_type === "staff" ? row.staff_name : row.student_name,
    email: row.principal_type === "staff" ? row.staff_email : row.student_email,
    expiresAt: row.expires_at
  };
}

function requireAuth(request, response, allowedRoles = []) {
  const session = getAuthSession(request);
  if (!session || session.principalType !== "staff") {
    sendJson(response, 401, { error: "Authentication required" });
    return null;
  }
  if (allowedRoles.length && !allowedRoles.includes(session.role)) {
    sendJson(response, 403, { error: "Insufficient permission" });
    return null;
  }
  return session;
}

function requireStudentAuth(request, response) {
  const session = getAuthSession(request);
  if (!session || session.principalType !== "student" || !session.studentId) {
    sendJson(response, 401, { error: "Student login required" });
    return null;
  }
  return session;
}

function hashOtp(code, salt) {
  return createHmac("sha256", OTP_SECRET).update(`${salt}:${code}`).digest("hex");
}

function otpMatches(code, salt, expectedHash) {
  const calculated = Buffer.from(hashOtp(code, salt), "hex");
  const stored = Buffer.from(expectedHash, "hex");
  return calculated.length === stored.length && timingSafeEqual(calculated, stored);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function deliverOtpEmail({ email, studentName, code, challengeId }) {
  const cloudflareWorkerUrl = process.env.CLOUDFLARE_EMAIL_WORKER_URL;
  const cloudflareWorkerToken = process.env.CLOUDFLARE_EMAIL_WORKER_TOKEN;
  const from = process.env.OTP_FROM_EMAIL;
  const subject = `${code} is your MUSIC SCHOOL OTS login code`;
  const text = `Hello ${studentName}, your MUSIC SCHOOL OTS login code is ${code}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px;color:#111426">
      <div style="font-weight:800;margin-bottom:24px">MUSIC SCHOOL OTS</div>
      <h1 style="font-size:26px">Your login code</h1>
      <p>Hello ${escapeHtml(studentName)}, use this one-time code to sign in:</p>
      <div style="font-size:38px;font-weight:900;letter-spacing:8px;padding:20px 0;color:#7057ff">${code}</div>
      <p>This code expires in ${OTP_EXPIRY_MINUTES} minutes. Do not share it with anyone.</p>
    </div>
  `;

  if (cloudflareWorkerUrl && cloudflareWorkerToken && from) {
    const response = await fetch(cloudflareWorkerUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cloudflareWorkerToken}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `ots-otp-${challengeId}`
      },
      body: JSON.stringify({
        from,
        to: email,
        subject,
        text,
        html
      })
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Cloudflare OTP email delivery failed: ${detail.slice(0, 240)}`);
    }
    return { mode: "cloudflare" };
  }

  if (IS_PRODUCTION) {
    throw new Error("Email delivery is not configured");
  }
  console.log(`[DEV OTP] ${email}: ${code}`);
  return { mode: "development", developmentOtp: code };
}

function todayPracticeSubmissions(studentId) {
  return db.prepare(`
    SELECT period, review_status, file_name, uploaded_at, duration_seconds
    FROM practice_submissions
    WHERE student_id = ?
      AND date(uploaded_at, '+5 hours', '+30 minutes') = date('now', '+5 hours', '+30 minutes')
    ORDER BY uploaded_at DESC
  `).all(studentId);
}

function getPracticeGate(studentId, submissions = todayPracticeSubmissions(studentId)) {
  const now = new Date();
  const currentHour = now.getHours();
  const duePeriods = currentHour >= 17 ? ["morning", "evening"] : ["morning"];
  const submittedPeriods = new Set(
    submissions
      .filter((submission) => Number(submission.duration_seconds || 0) >= MIN_PRACTICE_SECONDS)
      .map((submission) => submission.period)
  );
  const missingPeriods = duePeriods.filter((period) => !submittedPeriods.has(period));
  const activePeriod = missingPeriods[0] || null;
  return {
    locked: Boolean(activePeriod),
    activePeriod,
    missingPeriods,
    duePeriods,
    minDurationSeconds: MIN_PRACTICE_SECONDS,
    message: activePeriod
      ? `${activePeriod === "morning" ? "Morning" : "Evening"} practice is required before using the app. Upload at least ${Math.round(MIN_PRACTICE_SECONDS / 60)} minutes.`
      : "Practice gate is clear for now."
  };
}

function statusRank(status) {
  return status === "red" ? 1 : status === "amber" ? 2 : 3;
}

function getTeacherScope(session) {
  if (session.role !== "teacher") return null;
  return db.prepare("SELECT id FROM teachers WHERE user_id = ? AND active = 1").get(session.userId)?.id ?? -1;
}

function canAccessStudent(session, studentId) {
  const teacherId = getTeacherScope(session);
  if (teacherId === null) return true;
  return Boolean(db.prepare("SELECT id FROM students WHERE id = ? AND assigned_teacher_id = ?").get(studentId, teacherId));
}

function getDashboard(session) {
  const teacherId = getTeacherScope(session);
  const summary = db.prepare(`
    SELECT
      COUNT(*) AS active_students,
      SUM(CASE WHEN ps.status = 'green' THEN 1 ELSE 0 END) AS green_students,
      SUM(CASE WHEN ps.status = 'amber' THEN 1 ELSE 0 END) AS amber_students,
      SUM(CASE WHEN ps.status = 'red' THEN 1 ELSE 0 END) AS red_students,
      ROUND(AVG(ps.overall_score), 1) AS average_score
    FROM students s
    LEFT JOIN progress_snapshots ps
      ON ps.student_id = s.id
      AND ps.snapshot_date = (SELECT MAX(snapshot_date) FROM progress_snapshots WHERE student_id = s.id)
    WHERE s.active = 1
      AND (? IS NULL OR s.assigned_teacher_id = ?)
  `).get(teacherId, teacherId);

  const pendingReviews = db.prepare(`
    SELECT COUNT(*) AS count
    FROM practice_submissions
    WHERE review_status = 'pending'
      AND (? IS NULL OR teacher_id = ?)
  `).get(teacherId, teacherId).count;
  const todaysSessions = db.prepare(`
    SELECT COUNT(*) AS count
    FROM live_sessions
    WHERE date(scheduled_at) = date('now') AND status = 'scheduled'
      AND (? IS NULL OR teacher_id = ?)
  `).get(teacherId, teacherId).count;
  const openAlerts = db.prepare(`
    SELECT COUNT(*) AS count
    FROM student_alerts sa
    JOIN students s ON s.id = sa.student_id
    WHERE sa.resolved = 0
      AND (? IS NULL OR s.assigned_teacher_id = ?)
  `).get(teacherId, teacherId).count;
  const reviewTurnaround = db.prepare(`
    SELECT ROUND(AVG((julianday(reviewed_at) - julianday(uploaded_at)) * 24), 1) AS hours
    FROM practice_submissions
    WHERE reviewed_at IS NOT NULL
      AND (? IS NULL OR teacher_id = ?)
  `).get(teacherId, teacherId).hours;

  const attentionStudents = db.prepare(`
    SELECT
      s.id, s.name, s.instrument, s.current_week,
      u.name AS teacher_name,
      ps.overall_score, ps.status,
      COUNT(DISTINCT sa.id) AS alert_count
    FROM students s
    JOIN teachers t ON t.id = s.assigned_teacher_id
    JOIN users u ON u.id = t.user_id
    LEFT JOIN progress_snapshots ps
      ON ps.student_id = s.id
      AND ps.snapshot_date = (SELECT MAX(snapshot_date) FROM progress_snapshots WHERE student_id = s.id)
    LEFT JOIN student_alerts sa ON sa.student_id = s.id AND sa.resolved = 0
    WHERE s.active = 1
      AND (? IS NULL OR s.assigned_teacher_id = ?)
    GROUP BY s.id
    ORDER BY CASE ps.status WHEN 'red' THEN 1 WHEN 'amber' THEN 2 ELSE 3 END, ps.overall_score ASC
    LIMIT 5
  `).all(teacherId, teacherId);

  const practiceTrend = db.prepare(`
    SELECT substr(uploaded_at, 1, 10) AS date, COUNT(*) AS submissions
    FROM practice_submissions
    WHERE uploaded_at >= datetime('now', '-6 days')
      AND (? IS NULL OR teacher_id = ?)
    GROUP BY substr(uploaded_at, 1, 10)
    ORDER BY date
  `).all(teacherId, teacherId);

  const upcomingSessions = db.prepare(`
    SELECT ls.*, s.name AS student_name, u.name AS teacher_name
    FROM live_sessions ls
    JOIN students s ON s.id = ls.student_id
    JOIN teachers t ON t.id = ls.teacher_id
    JOIN users u ON u.id = t.user_id
    WHERE ls.status = 'scheduled'
      AND julianday(ls.scheduled_at) >= julianday('now')
      AND (? IS NULL OR ls.teacher_id = ?)
    ORDER BY ls.scheduled_at
    LIMIT 8
  `).all(teacherId, teacherId);

  return {
    summary: {
      ...summary,
      pending_reviews: pendingReviews,
      todays_sessions: todaysSessions,
      open_alerts: openAlerts,
      review_turnaround_hours: reviewTurnaround || 0
    },
    attentionStudents,
    practiceTrend,
    upcomingSessions
  };
}

function getStudents(url, session) {
  const scopedTeacherId = getTeacherScope(session);
  const status = url.searchParams.get("status");
  const teacherId = url.searchParams.get("teacherId");
  const search = url.searchParams.get("search")?.trim().toLowerCase();
  const rows = db.prepare(`
    SELECT
      s.id, s.name, s.age_group, s.instrument, s.goal, s.current_week,
      s.parent_name, s.parent_email,
      account.email,
      u.name AS teacher_name, t.id AS teacher_id,
      ps.practice_score, ps.attendance_score, ps.skill_score, ps.feedback_score,
      ps.overall_score, ps.status,
      COUNT(DISTINCT sa.id) AS alert_count,
      SUM(CASE WHEN psub.review_status = 'pending' THEN 1 ELSE 0 END) AS pending_reviews
    FROM students s
    JOIN teachers t ON t.id = s.assigned_teacher_id
    JOIN users u ON u.id = t.user_id
    LEFT JOIN student_accounts account ON account.student_id = s.id
    LEFT JOIN progress_snapshots ps
      ON ps.student_id = s.id
      AND ps.snapshot_date = (SELECT MAX(snapshot_date) FROM progress_snapshots WHERE student_id = s.id)
    LEFT JOIN student_alerts sa ON sa.student_id = s.id AND sa.resolved = 0
    LEFT JOIN practice_submissions psub ON psub.student_id = s.id
    WHERE s.active = 1
    GROUP BY s.id
  `).all();

  return rows
    .filter((row) => scopedTeacherId === null || row.teacher_id === scopedTeacherId)
    .filter((row) => !status || row.status === status)
    .filter((row) => !teacherId || String(row.teacher_id) === teacherId)
    .filter((row) => !search || `${row.name} ${row.instrument} ${row.teacher_name}`.toLowerCase().includes(search))
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.overall_score - b.overall_score);
}

function getReviewQueue(url, session) {
  const teacherId = getTeacherScope(session);
  const status = url.searchParams.get("status") || "pending";
  return db.prepare(`
    SELECT
      ps.*,
      s.name AS student_name,
      s.instrument,
      s.current_week,
      u.name AS teacher_name,
      ROUND((julianday('now') - julianday(ps.uploaded_at)) * 24, 1) AS waiting_hours
    FROM practice_submissions ps
    JOIN students s ON s.id = ps.student_id
    JOIN teachers t ON t.id = ps.teacher_id
    JOIN users u ON u.id = t.user_id
    WHERE ps.review_status = ?
      AND (? IS NULL OR ps.teacher_id = ?)
    ORDER BY ps.uploaded_at ASC
  `).all(status, teacherId, teacherId);
}

function getTeachersOverview() {
  return db.prepare(`
    SELECT
      t.id,
      u.name,
      u.email,
      t.instrument,
      t.bio,
      t.review_sla_hours,
      COUNT(DISTINCT s.id) AS student_count,
      SUM(CASE WHEN psnap.status IN ('amber', 'red') THEN 1 ELSE 0 END) AS attention_count,
      COUNT(DISTINCT CASE WHEN psub.review_status = 'pending' THEN psub.id END) AS pending_reviews,
      ROUND(AVG(CASE
        WHEN psub.reviewed_at IS NOT NULL
        THEN (julianday(psub.reviewed_at) - julianday(psub.uploaded_at)) * 24
      END), 1) AS review_turnaround_hours
    FROM teachers t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN students s ON s.assigned_teacher_id = t.id AND s.active = 1
    LEFT JOIN progress_snapshots psnap
      ON psnap.student_id = s.id
      AND psnap.snapshot_date = (
        SELECT MAX(snapshot_date) FROM progress_snapshots WHERE student_id = s.id
      )
    LEFT JOIN practice_submissions psub ON psub.teacher_id = t.id
    WHERE t.active = 1 AND u.active = 1
    GROUP BY t.id
    ORDER BY u.name
  `).all();
}

function getTeacherOverview(session) {
  const teacherId = getTeacherScope(session);
  if (teacherId < 0) return null;
  const teacher = db.prepare(`
    SELECT t.id, t.instrument, t.bio, t.review_sla_hours, u.name, u.email
    FROM teachers t
    JOIN users u ON u.id = t.user_id
    WHERE t.id = ?
  `).get(teacherId);
  const dashboard = getDashboard(session);
  const sessions = db.prepare(`
    SELECT ls.*, s.name AS student_name, s.instrument
    FROM live_sessions ls
    JOIN students s ON s.id = ls.student_id
    WHERE ls.teacher_id = ?
      AND julianday(ls.scheduled_at) >= julianday('now', '-14 days')
      AND julianday(ls.scheduled_at) <= julianday('now', '+30 days')
    ORDER BY ls.scheduled_at
  `).all(teacherId);
  const helpCalls = db.prepare(`
    SELECT hc.*, s.name AS student_name, s.instrument, s.current_week
    FROM help_calls hc
    JOIN students s ON s.id = hc.student_id
    WHERE hc.teacher_id = ?
    ORDER BY
      CASE hc.status WHEN 'scheduled' THEN 1 WHEN 'requested' THEN 2 ELSE 3 END,
      hc.scheduled_at
  `).all(teacherId);
  const today = new Date().toISOString().slice(0, 10);
  return {
    teacher,
    summary: dashboard.summary,
    attentionStudents: dashboard.attentionStudents,
    todaySessions: sessions.filter((item) => item.scheduled_at.slice(0, 10) === today),
    upcomingSessions: sessions.filter((item) => new Date(item.scheduled_at) >= new Date()).slice(0, 12),
    sessions,
    helpCalls,
    pendingReviews: getReviewQueue(new URL("http://local/api/reviews?status=pending"), session)
  };
}

async function handleApi(request, response, url) {
  const pathname = url.pathname;

  if (pathname === "/api/health" && request.method === "GET") {
    return sendJson(response, 200, {
      status: "ok",
      database: "sqlite",
      emailDelivery: process.env.CLOUDFLARE_EMAIL_WORKER_URL && process.env.OTP_FROM_EMAIL ? "cloudflare" : "development",
      time: new Date().toISOString()
    });
  }

  if (pathname === "/api/student-auth/request-otp" && request.method === "POST") {
    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) return sendJson(response, 400, { error: "Enter a valid email address" });

    const account = db.prepare(`
      SELECT account.*, s.name AS student_name
      FROM student_accounts account
      JOIN students s ON s.id = account.student_id
      WHERE account.email = ? AND account.active = 1 AND s.active = 1
    `).get(email);

    const genericMessage = "If this email is registered, a login code has been sent.";
    if (!account) return sendJson(response, 200, { ok: true, message: genericMessage });

    const recentRequests = db.prepare(`
      SELECT COUNT(*) AS count
      FROM otp_challenges
      WHERE student_account_id = ?
        AND julianday(created_at) >= julianday('now', '-10 minutes')
    `).get(account.id).count;
    if (recentRequests >= 3) {
      return sendJson(response, 429, { error: "Too many codes requested. Please wait 10 minutes." });
    }

    db.prepare(`
      UPDATE otp_challenges
      SET consumed_at = ?
      WHERE student_account_id = ? AND consumed_at IS NULL
    `).run(new Date().toISOString(), account.id);

    const code = String(randomInt(100000, 1_000_000));
    const salt = randomBytes(16).toString("hex");
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + OTP_EXPIRY_MINUTES * 60_000);
    const challengeResult = db.prepare(`
      INSERT INTO otp_challenges (
        student_account_id, code_hash, code_salt, expires_at,
        attempts, max_attempts, delivery_status, created_at
      ) VALUES (?, ?, ?, ?, 0, 5, 'pending', ?)
    `).run(account.id, hashOtp(code, salt), salt, expiresAt.toISOString(), createdAt.toISOString());
    const challengeId = Number(challengeResult.lastInsertRowid);

    try {
      const delivery = await deliverOtpEmail({
        email,
        studentName: account.student_name,
        code,
        challengeId
      });
      db.prepare("UPDATE otp_challenges SET delivery_status = 'sent' WHERE id = ?").run(challengeId);
      return sendJson(response, 200, {
        ok: true,
        message: delivery.mode === "cloudflare" ? "Login code sent to your email." : "Development login code generated.",
        expiresInSeconds: OTP_EXPIRY_MINUTES * 60,
        developmentOtp: delivery.developmentOtp
      });
    } catch (error) {
      db.prepare("UPDATE otp_challenges SET delivery_status = 'failed' WHERE id = ?").run(challengeId);
      console.error(error);
      return sendJson(response, 503, { error: "The login email could not be sent. Please contact OTS support." });
    }
  }

  if (pathname === "/api/student-auth/verify-otp" && request.method === "POST") {
    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    const code = String(body.otp || "").trim();
    if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
      return sendJson(response, 400, { error: "Enter the six-digit login code" });
    }

    const account = db.prepare(`
      SELECT account.*, s.name AS student_name
      FROM student_accounts account
      JOIN students s ON s.id = account.student_id
      WHERE account.email = ? AND account.active = 1 AND s.active = 1
    `).get(email);
    if (!account) return sendJson(response, 401, { error: "Invalid or expired login code" });

    const challenge = db.prepare(`
      SELECT *
      FROM otp_challenges
      WHERE student_account_id = ? AND consumed_at IS NULL AND delivery_status = 'sent'
      ORDER BY id DESC
      LIMIT 1
    `).get(account.id);
    if (
      !challenge ||
      new Date(challenge.expires_at) <= new Date() ||
      challenge.attempts >= challenge.max_attempts
    ) {
      return sendJson(response, 401, { error: "Invalid or expired login code" });
    }

    if (!otpMatches(code, challenge.code_salt, challenge.code_hash)) {
      db.prepare("UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?").run(challenge.id);
      return sendJson(response, 401, { error: "Invalid or expired login code" });
    }

    const now = new Date().toISOString();
    db.exec("BEGIN");
    try {
      db.prepare("UPDATE otp_challenges SET consumed_at = ? WHERE id = ?").run(now, challenge.id);
      db.prepare(`
        UPDATE student_accounts
        SET email_verified_at = COALESCE(email_verified_at, ?)
        WHERE id = ?
      `).run(now, account.id);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    const auth = createAuthSession({
      principalType: "student",
      studentId: account.student_id,
      role: "student",
      ttlMilliseconds: STUDENT_SESSION_DAYS * 24 * 60 * 60 * 1000
    });
    logAudit(db, null, "student_login", "student", account.student_id, { email });
    return sendJson(response, 200, {
      token: auth.token,
      expiresAt: auth.expiresAt,
      student: {
        id: account.student_id,
        name: account.student_name,
        email
      }
    });
  }

  if (pathname === "/api/student-auth/me" && request.method === "GET") {
    const session = requireStudentAuth(request, response);
    if (!session) return;
    return sendJson(response, 200, {
      student: {
        id: session.studentId,
        name: session.name,
        email: session.email
      },
      expiresAt: session.expiresAt
    });
  }

  if (pathname === "/api/student-auth/logout" && request.method === "POST") {
    const session = requireStudentAuth(request, response);
    if (!session) return;
    db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE id = ?").run(new Date().toISOString(), session.sessionId);
    return sendJson(response, 200, { ok: true });
  }

  if (pathname === "/api/auth/login" && request.method === "POST") {
    const body = await readJson(request);
    const user = db.prepare("SELECT * FROM users WHERE email = ? AND active = 1").get(String(body.email || "").toLowerCase());
    if (!user || !verifyPassword(String(body.password || ""), user.password_hash)) {
      return sendJson(response, 401, { error: "Invalid email or password" });
    }
    const auth = createAuthSession({
      principalType: "staff",
      userId: user.id,
      role: user.role,
      ttlMilliseconds: STAFF_SESSION_HOURS * 60 * 60 * 1000
    });
    const session = {
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      expiresAt: auth.expiresAt
    };
    logAudit(db, user.id, "login", "user", user.id);
    return sendJson(response, 200, { token: auth.token, user: session });
  }

  if (pathname === "/api/auth/me" && request.method === "GET") {
    const session = requireAuth(request, response);
    if (!session) return;
    return sendJson(response, 200, { user: session });
  }

  if (pathname === "/api/auth/logout" && request.method === "POST") {
    const session = requireAuth(request, response);
    if (!session) return;
    db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE id = ?").run(new Date().toISOString(), session.sessionId);
    return sendJson(response, 200, { ok: true });
  }

  if (pathname === "/api/dashboard" && request.method === "GET") {
    const session = requireAuth(request, response, ["super_admin", "academic_head", "teacher", "operations"]);
    if (!session) return;
    return sendJson(response, 200, getDashboard(session));
  }

  if (pathname === "/api/teachers" && request.method === "GET") {
    const session = requireAuth(request, response, ["super_admin", "academic_head", "operations"]);
    if (!session) return;
    return sendJson(response, 200, { teachers: getTeachersOverview() });
  }

  if (pathname === "/api/teacher/overview" && request.method === "GET") {
    const session = requireAuth(request, response, ["teacher"]);
    if (!session) return;
    const overview = getTeacherOverview(session);
    return overview ? sendJson(response, 200, overview) : sendJson(response, 404, { error: "Teacher profile not found" });
  }

  if (pathname === "/api/students" && request.method === "GET") {
    const session = requireAuth(request, response, ["super_admin", "academic_head", "teacher", "operations"]);
    if (!session) return;
    return sendJson(response, 200, { students: getStudents(url, session) });
  }

  if (pathname === "/api/students" && request.method === "POST") {
    const session = requireAuth(request, response, ["super_admin", "academic_head", "operations"]);
    if (!session) return;
    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    const name = String(body.name || "").trim();
    const instrument = String(body.instrument || "").trim();
    const goal = String(body.goal || "").trim();
    const ageGroup = String(body.ageGroup || "").trim();
    const teacherId = Number(body.teacherId);
    const parentEmail = normalizeEmail(body.parentEmail);
    if (name.length < 2 || !isValidEmail(email) || !instrument || !goal || !ageGroup || !teacherId) {
      return sendJson(response, 400, { error: "Name, email, age group, instrument, goal and teacher are required" });
    }
    if (parentEmail && !isValidEmail(parentEmail)) {
      return sendJson(response, 400, { error: "Enter a valid parent email address" });
    }
    if (db.prepare("SELECT id FROM student_accounts WHERE email = ?").get(email)) {
      return sendJson(response, 409, { error: "A student account already uses this email" });
    }
    const teacher = db.prepare("SELECT id, instrument FROM teachers WHERE id = ? AND active = 1").get(teacherId);
    if (!teacher) return sendJson(response, 400, { error: "Assigned teacher was not found" });
    if (teacher.instrument !== instrument) {
      return sendJson(response, 400, { error: `Choose a ${instrument} teacher for this student` });
    }
    const course = db.prepare("SELECT id FROM courses WHERE instrument = ? AND active = 1 ORDER BY id LIMIT 1").get(instrument);
    if (!course) return sendJson(response, 400, { error: "No active course exists for this instrument" });

    const createdAt = new Date().toISOString();
    db.exec("BEGIN");
    try {
      const studentResult = db.prepare(`
        INSERT INTO students (
          name, age_group, instrument, goal, assigned_teacher_id, current_week,
          course_start_date, parent_name, parent_email, active, created_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, 1, ?)
      `).run(
        name,
        ageGroup,
        instrument,
        goal,
        teacherId,
        String(body.courseStartDate || createdAt.slice(0, 10)),
        String(body.parentName || "").trim() || null,
        parentEmail || null,
        createdAt
      );
      const studentId = Number(studentResult.lastInsertRowid);
      db.prepare(`
        INSERT INTO student_accounts (student_id, email, active, created_at)
        VALUES (?, ?, 1, ?)
      `).run(studentId, email, createdAt);
      db.prepare(`
        INSERT INTO student_preferences (
          student_id, morning_reminder, evening_reminder, parent_updates, updated_at
        ) VALUES (?, 1, 1, 1, ?)
      `).run(studentId, createdAt);
      db.prepare(`
        INSERT INTO enrollments (student_id, course_id, status, enrolled_at)
        VALUES (?, ?, 'active', ?)
      `).run(studentId, course.id, createdAt);
      db.exec("COMMIT");
      recalculateStudent(db, studentId);
      logAudit(db, session.userId, "create_student", "student", studentId, { email, teacherId });
      return sendJson(response, 201, { student: getStudentAnalysis(db, studentId) });
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  const studentMatch = pathname.match(/^\/api\/students\/(\d+)$/);
  if (studentMatch && request.method === "GET") {
    const session = requireAuth(request, response, ["super_admin", "academic_head", "teacher", "operations"]);
    if (!session) return;
    const studentId = Number(studentMatch[1]);
    if (!canAccessStudent(session, studentId)) return sendJson(response, 403, { error: "Student is outside your assigned roster" });
    const analysis = getStudentAnalysis(db, studentId);
    return analysis ? sendJson(response, 200, analysis) : sendJson(response, 404, { error: "Student not found" });
  }

  if (pathname === "/api/reviews" && request.method === "GET") {
    const session = requireAuth(request, response, ["super_admin", "academic_head", "teacher"]);
    if (!session) return;
    return sendJson(response, 200, { submissions: getReviewQueue(url, session) });
  }

  const reviewMatch = pathname.match(/^\/api\/reviews\/(\d+)$/);
  if (reviewMatch && request.method === "POST") {
    const session = requireAuth(request, response, ["super_admin", "academic_head", "teacher"]);
    if (!session) return;
    const submissionId = Number(reviewMatch[1]);
    const submission = db.prepare("SELECT * FROM practice_submissions WHERE id = ?").get(submissionId);
    if (!submission) return sendJson(response, 404, { error: "Submission not found" });
    const scopedTeacherId = getTeacherScope(session);
    if (scopedTeacherId !== null && submission.teacher_id !== scopedTeacherId) {
      return sendJson(response, 403, { error: "Submission is outside your assigned review queue" });
    }
    if (submission.review_status === "reviewed") return sendJson(response, 409, { error: "Submission already reviewed" });

    const body = await readJson(request);
    const ratings = normalizeSkillPayload(body.ratings || {});
    const reviewedAt = new Date().toISOString();
    db.exec("BEGIN");
    try {
      const reviewResult = db.prepare(`
        INSERT INTO teacher_reviews (
          submission_id, teacher_id, positive_observation, main_correction,
          next_practice_focus, requires_help_call, reviewed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        submissionId,
        submission.teacher_id,
        String(body.positiveObservation || "Good focused practice."),
        String(body.mainCorrection || "Continue with slow, controlled repetition."),
        String(body.nextPracticeFocus || "Repeat the assigned exercise three times."),
        body.requiresHelpCall ? 1 : 0,
        reviewedAt
      );
      db.prepare(`
        INSERT INTO skill_ratings (
          review_id, student_id, course_week, rhythm, accuracy, technique, posture,
          musicality, confidence, feedback_application, rated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        reviewResult.lastInsertRowid,
        submission.student_id,
        submission.course_week,
        ratings.rhythm,
        ratings.accuracy,
        ratings.technique,
        ratings.posture,
        ratings.musicality,
        ratings.confidence,
        ratings.feedback_application,
        reviewedAt
      );
      db.prepare(`
        UPDATE practice_submissions
        SET review_status = 'reviewed', reviewed_at = ?
        WHERE id = ?
      `).run(reviewedAt, submissionId);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    recalculateStudent(db, submission.student_id);
    logAudit(db, session.userId, "review_submission", "practice_submission", submissionId, { studentId: submission.student_id });
    return sendJson(response, 201, { ok: true, student: getStudentAnalysis(db, submission.student_id) });
  }

  const reviewVideoMatch = pathname.match(/^\/api\/reviews\/(\d+)\/video-access$/);
  if (reviewVideoMatch && request.method === "GET") {
    const session = requireAuth(request, response, ["super_admin", "academic_head", "teacher"]);
    if (!session) return;
    const submission = db.prepare("SELECT * FROM practice_submissions WHERE id = ?").get(Number(reviewVideoMatch[1]));
    if (!submission) return sendJson(response, 404, { error: "Submission not found" });
    const scopedTeacherId = getTeacherScope(session);
    if (scopedTeacherId !== null && submission.teacher_id !== scopedTeacherId) {
      return sendJson(response, 403, { error: "Submission is outside your assigned review queue" });
    }
    if (!cloudinaryIsConfigured() || !IS_PRODUCTION) {
      return sendJson(response, 200, { playbackUrl: null, storageMode: "metadata-only" });
    }
    const playbackUrl = createCloudinaryPrivateDownloadUrl(submission.storage_key);
    if (!playbackUrl) return sendJson(response, 422, { error: "The stored video reference is invalid" });
    return sendJson(response, 200, {
      playbackUrl,
      storageMode: "cloudinary-private",
      expiresInSeconds: 900
    });
  }

  if (pathname === "/api/alerts" && request.method === "GET") {
    const session = requireAuth(request, response, ["super_admin", "academic_head", "teacher", "operations"]);
    if (!session) return;
    const teacherId = getTeacherScope(session);
    const alerts = db.prepare(`
      SELECT sa.*, s.name AS student_name, s.instrument, u.name AS teacher_name
      FROM student_alerts sa
      JOIN students s ON s.id = sa.student_id
      JOIN teachers t ON t.id = s.assigned_teacher_id
      JOIN users u ON u.id = t.user_id
      WHERE sa.resolved = 0
        AND (? IS NULL OR s.assigned_teacher_id = ?)
      ORDER BY CASE sa.severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, sa.created_at DESC
    `).all(teacherId, teacherId);
    return sendJson(response, 200, { alerts });
  }

  const alertMatch = pathname.match(/^\/api\/alerts\/(\d+)\/resolve$/);
  if (alertMatch && request.method === "POST") {
    const session = requireAuth(request, response, ["super_admin", "academic_head", "teacher", "operations"]);
    if (!session) return;
    const alertId = Number(alertMatch[1]);
    const alert = db.prepare(`
      SELECT sa.*, s.assigned_teacher_id
      FROM student_alerts sa
      JOIN students s ON s.id = sa.student_id
      WHERE sa.id = ?
    `).get(alertId);
    if (!alert) return sendJson(response, 404, { error: "Alert not found" });
    const scopedTeacherId = getTeacherScope(session);
    if (scopedTeacherId !== null && alert.assigned_teacher_id !== scopedTeacherId) {
      return sendJson(response, 403, { error: "Alert is outside your assigned roster" });
    }
    db.prepare("UPDATE student_alerts SET resolved = 1, resolved_at = ? WHERE id = ?").run(new Date().toISOString(), alertId);
    logAudit(db, session.userId, "resolve_alert", "student_alert", alertId);
    return sendJson(response, 200, { ok: true });
  }

  const attendanceMatch = pathname.match(/^\/api\/sessions\/(\d+)\/attendance$/);
  if (attendanceMatch && request.method === "POST") {
    const session = requireAuth(request, response, ["super_admin", "academic_head", "teacher", "operations"]);
    if (!session) return;
    const body = await readJson(request);
    if (!["attended", "missed", "cancelled"].includes(body.status)) {
      return sendJson(response, 400, { error: "Invalid attendance status" });
    }
    const sessionRow = db.prepare("SELECT * FROM live_sessions WHERE id = ?").get(Number(attendanceMatch[1]));
    if (!sessionRow) return sendJson(response, 404, { error: "Session not found" });
    const scopedTeacherId = getTeacherScope(session);
    if (scopedTeacherId !== null && sessionRow.teacher_id !== scopedTeacherId) {
      return sendJson(response, 403, { error: "Session is outside your assigned schedule" });
    }
    db.prepare("UPDATE live_sessions SET status = ? WHERE id = ?").run(body.status, sessionRow.id);
    recalculateStudent(db, sessionRow.student_id);
    logAudit(db, session.userId, "update_attendance", "live_session", sessionRow.id, { status: body.status });
    return sendJson(response, 200, { ok: true });
  }

  const helpCallStatusMatch = pathname.match(/^\/api\/help-calls\/(\d+)\/status$/);
  if (helpCallStatusMatch && request.method === "POST") {
    const session = requireAuth(request, response, ["teacher", "academic_head"]);
    if (!session) return;
    const body = await readJson(request);
    if (!["scheduled", "completed", "cancelled"].includes(body.status)) {
      return sendJson(response, 400, { error: "Invalid help-call status" });
    }
    const call = db.prepare("SELECT * FROM help_calls WHERE id = ?").get(Number(helpCallStatusMatch[1]));
    if (!call) return sendJson(response, 404, { error: "Help call not found" });
    const scopedTeacherId = getTeacherScope(session);
    if (scopedTeacherId !== null && call.teacher_id !== scopedTeacherId) {
      return sendJson(response, 403, { error: "Help call is outside your assigned roster" });
    }
    db.prepare("UPDATE help_calls SET status = ? WHERE id = ?").run(body.status, call.id);
    logAudit(db, session.userId, "update_help_call", "help_call", call.id, { status: body.status });
    return sendJson(response, 200, { ok: true });
  }

  if (pathname === "/api/student/me" && request.method === "GET") {
    const session = requireStudentAuth(request, response);
    if (!session) return;
    const analysis = getStudentAnalysis(db, session.studentId);
    if (!analysis) return sendJson(response, 404, { error: "Student not found" });
    const todaySubmissions = todayPracticeSubmissions(session.studentId);
    const practiceGate = getPracticeGate(session.studentId, todaySubmissions);
    const preferences = db.prepare(`
      SELECT morning_reminder, evening_reminder, parent_updates
      FROM student_preferences
      WHERE student_id = ?
    `).get(session.studentId) || {
      morning_reminder: 1,
      evening_reminder: 1,
      parent_updates: 1
    };
    return sendJson(response, 200, {
      profile: analysis.student,
      preferences: {
        morningReminder: Boolean(preferences.morning_reminder),
        eveningReminder: Boolean(preferences.evening_reminder),
        parentUpdates: Boolean(preferences.parent_updates)
      },
      practiceGate,
      latestSkills: analysis.latestSkills,
      todaySubmissions,
      feedback: analysis.submissions.filter((submission) => submission.review_status === "reviewed").slice(0, 5),
      upcomingSessions: analysis.sessions
        .filter((session) => session.status === "scheduled" && new Date(session.scheduled_at) >= new Date())
        .sort((left, right) => new Date(left.scheduled_at) - new Date(right.scheduled_at))
        .slice(0, 4),
      recentSubmissions: analysis.submissions.slice(0, 14),
      helpCalls: analysis.helpCalls.filter((call) => call.status === "scheduled")
    });
  }

  if (pathname === "/api/student/me/video-upload-config" && request.method === "POST") {
    const session = requireStudentAuth(request, response);
    if (!session) return;
    const body = await readJson(request);
    const period = String(body.period || "");
    const contentType = String(body.contentType || "");
    if (!["morning", "evening"].includes(period)) {
      return sendJson(response, 400, { error: "Invalid practice period" });
    }
    if (!contentType.startsWith("video/")) {
      return sendJson(response, 400, { error: "Only video uploads are allowed" });
    }
    const fileSize = Math.round(Number(body.fileSize) || 0);
    if (fileSize <= 0 || fileSize > MAX_PRACTICE_VIDEO_BYTES) {
      return sendJson(response, 400, { error: "Practice videos must be 100 MB or smaller for the MVP." });
    }
    if (!cloudinaryIsConfigured() && IS_PRODUCTION) {
      return sendJson(response, 503, { error: "Cloud video storage is not configured" });
    }
    if (!cloudinaryIsConfigured()) {
      return sendJson(response, 200, {
        uploadUrl: null,
        storageMode: "metadata-only",
        maxFileBytes: MAX_PRACTICE_VIDEO_BYTES
      });
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = `music-school-ots/students/${session.studentId}/${period}-${timestamp}-${randomUUID()}`;
    const uploadParameters = {
      public_id: publicId,
      timestamp,
      type: "private"
    };
    return sendJson(response, 200, {
      uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUDINARY_CLOUD_NAME)}/video/upload`,
      cloudName: CLOUDINARY_CLOUD_NAME,
      apiKey: CLOUDINARY_API_KEY,
      timestamp,
      publicId,
      deliveryType: "private",
      signature: signCloudinaryParameters(uploadParameters),
      uploadReceipt: createPracticeUploadReceipt({ studentId: session.studentId, period, publicId }),
      storageMode: "cloudinary-private",
      maxFileBytes: MAX_PRACTICE_VIDEO_BYTES
    });
  }

  if (pathname === "/api/student/me/practice-submissions" && request.method === "POST") {
    const session = requireStudentAuth(request, response);
    if (!session) return;
    const studentId = session.studentId;
    const student = db.prepare("SELECT * FROM students WHERE id = ?").get(studentId);
    if (!student) return sendJson(response, 404, { error: "Student not found" });
    const body = await readJson(request);
    if (!["morning", "evening"].includes(body.period)) return sendJson(response, 400, { error: "Invalid practice period" });
    const durationSeconds = Math.round(Number(body.durationSeconds) || 0);
    if (durationSeconds < MIN_PRACTICE_SECONDS) {
      return sendJson(response, 400, { error: `Practice video must be at least ${Math.round(MIN_PRACTICE_SECONDS / 60)} minutes.` });
    }
    const existingSubmission = db.prepare(`
      SELECT id
      FROM practice_submissions
      WHERE student_id = ? AND period = ?
        AND date(uploaded_at, '+5 hours', '+30 minutes') = date('now', '+5 hours', '+30 minutes')
    `).get(studentId, body.period);
    if (existingSubmission) return sendJson(response, 409, { error: `${body.period} practice was already submitted today` });
    const uploadedAt = new Date().toISOString();
    const fileName = String(body.fileName || `${body.period}-practice.mp4`);
    const storageKey = String(body.storageKey || "") ||
      `students/${studentId}/week-${student.current_week}/${randomUUID()}-${fileName.replaceAll(/[^a-zA-Z0-9._-]/g, "-")}`;
    if (IS_PRODUCTION && (!String(body.storageKey || "") ||
      !verifyPracticeUploadReceipt(body.uploadReceipt, {
        studentId,
        period: body.period,
        storageKey
      }))) {
      return sendJson(response, 400, { error: "The practice video must finish uploading before submission" });
    }
    const result = db.prepare(`
      INSERT INTO practice_submissions (
        student_id, teacher_id, course_week, period, duration_seconds,
        file_name, storage_key, uploaded_at, review_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      studentId,
      student.assigned_teacher_id,
      student.current_week,
      body.period,
      durationSeconds,
      fileName,
      storageKey,
      uploadedAt
    );
    recalculateStudent(db, studentId);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), storageKey, uploadedAt, reviewStatus: "pending" });
  }

  if (pathname === "/api/student/me/help-calls" && request.method === "POST") {
    const session = requireStudentAuth(request, response);
    if (!session) return;
    const studentId = session.studentId;
    const student = db.prepare("SELECT * FROM students WHERE id = ?").get(studentId);
    if (!student) return sendJson(response, 404, { error: "Student not found" });
    const body = await readJson(request);
    const scheduledAt = String(body.scheduledAt || new Date(Date.now() + 86_400_000).toISOString());
    const result = db.prepare(`
      INSERT INTO help_calls (student_id, teacher_id, topic, scheduled_at, status, created_at)
      VALUES (?, ?, ?, ?, 'scheduled', ?)
    `).run(studentId, student.assigned_teacher_id, String(body.topic || "Student requested support"), scheduledAt, new Date().toISOString());
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), scheduledAt, status: "scheduled" });
  }

  const cancelHelpCallMatch = pathname.match(/^\/api\/student\/me\/help-calls\/(\d+)\/cancel$/);
  if (cancelHelpCallMatch && request.method === "POST") {
    const session = requireStudentAuth(request, response);
    if (!session) return;
    const studentId = session.studentId;
    const helpCallId = Number(cancelHelpCallMatch[1]);
    const result = db.prepare(`
      UPDATE help_calls
      SET status = 'cancelled'
      WHERE id = ? AND student_id = ? AND status = 'scheduled'
    `).run(helpCallId, studentId);
    if (!result.changes) return sendJson(response, 404, { error: "Scheduled help call not found" });
    return sendJson(response, 200, { ok: true });
  }

  if (pathname === "/api/student/me/progress" && request.method === "POST") {
    const session = requireStudentAuth(request, response);
    if (!session) return;
    const studentId = session.studentId;
    const body = await readJson(request);
    const week = Math.max(1, Math.min(12, Number(body.currentWeek) || 1));
    db.prepare("UPDATE students SET current_week = ? WHERE id = ?").run(week, studentId);
    recalculateStudent(db, studentId);
    return sendJson(response, 200, { ok: true, currentWeek: week });
  }

  if (pathname === "/api/student/me/profile" && request.method === "PATCH") {
    const session = requireStudentAuth(request, response);
    if (!session) return;
    const body = await readJson(request);
    const name = String(body.name || "").trim();
    const goal = String(body.goal || "").trim();
    if (name.length < 2 || goal.length < 3) {
      return sendJson(response, 400, { error: "Name and learning goal are required" });
    }
    db.prepare("UPDATE students SET name = ?, goal = ? WHERE id = ?").run(name, goal, session.studentId);
    logAudit(db, null, "update_student_profile", "student", session.studentId);
    return sendJson(response, 200, { ok: true, profile: getStudentAnalysis(db, session.studentId).student });
  }

  if (pathname === "/api/student/me/preferences" && request.method === "PATCH") {
    const session = requireStudentAuth(request, response);
    if (!session) return;
    const body = await readJson(request);
    const values = {
      morningReminder: body.morningReminder ? 1 : 0,
      eveningReminder: body.eveningReminder ? 1 : 0,
      parentUpdates: body.parentUpdates ? 1 : 0
    };
    db.prepare(`
      INSERT INTO student_preferences (
        student_id, morning_reminder, evening_reminder, parent_updates, updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(student_id) DO UPDATE SET
        morning_reminder = excluded.morning_reminder,
        evening_reminder = excluded.evening_reminder,
        parent_updates = excluded.parent_updates,
        updated_at = excluded.updated_at
    `).run(
      session.studentId,
      values.morningReminder,
      values.eveningReminder,
      values.parentUpdates,
      new Date().toISOString()
    );
    return sendJson(response, 200, { ok: true });
  }

  return sendJson(response, 404, { error: "API route not found" });
}

function serveStatic(request, response, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  if (pathname === "/admin") pathname = "/admin.html";
  if (pathname === "/teacher") pathname = "/teacher.html";

  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = resolve(join(ROOT, safePath.replace(/^[/\\]/, "")));
  if (!filePath.startsWith(ROOT) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
    "Cache-Control": filePath.endsWith("service-worker.js") ? "no-cache" : "public, max-age=60",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin"
  });
  createReadStream(filePath).pipe(response);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      if (USE_NEON) await neonApi(request, response, url);
      else await handleApi(request, response, url);
    } else {
      serveStatic(request, response, url);
    }
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendJson(response, 500, { error: "Internal server error", detail: error.message });
    else response.end();
  }
});

const neonApi = USE_NEON
  ? await createNeonApi({
      sendJson,
      readJson,
      getToken,
      deliverOtpEmail,
      createPracticeUploadReceipt,
      verifyPracticeUploadReceipt,
      cloudinaryIsConfigured,
      createCloudinaryPrivateDownloadUrl,
      cloudinaryUploadConfig,
      minPracticeSeconds: MIN_PRACTICE_SECONDS,
      maxPracticeVideoBytes: MAX_PRACTICE_VIDEO_BYTES,
      otpSecret: OTP_SECRET
    })
  : null;

server.listen(PORT, HOST, () => {
  console.log(`MUSIC SCHOOL OTS running at http://${HOST}:${PORT}`);
  console.log(`Admin portal: http://${HOST}:${PORT}/admin`);
  console.log(`Teacher portal: http://${HOST}:${PORT}/teacher`);
});
