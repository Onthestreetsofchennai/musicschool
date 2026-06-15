import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import {
  createDatabase,
  getStudentAnalysis,
  logAudit,
  normalizeSkillPayload,
  recalculateStudent,
  verifyPassword
} from "./backend/database.mjs";

const ROOT = resolve(".");
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const db = createDatabase(join(ROOT, "data", "ots.db"));
const sessions = new Map();

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

function requireAuth(request, response, allowedRoles = []) {
  const session = sessions.get(getToken(request));
  if (!session) {
    sendJson(response, 401, { error: "Authentication required" });
    return null;
  }
  if (allowedRoles.length && !allowedRoles.includes(session.role)) {
    sendJson(response, 403, { error: "Insufficient permission" });
    return null;
  }
  return session;
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
      u.name AS teacher_name, t.id AS teacher_id,
      ps.practice_score, ps.attendance_score, ps.skill_score, ps.feedback_score,
      ps.overall_score, ps.status,
      COUNT(DISTINCT sa.id) AS alert_count,
      SUM(CASE WHEN psub.review_status = 'pending' THEN 1 ELSE 0 END) AS pending_reviews
    FROM students s
    JOIN teachers t ON t.id = s.assigned_teacher_id
    JOIN users u ON u.id = t.user_id
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

async function handleApi(request, response, url) {
  const pathname = url.pathname;

  if (pathname === "/api/health" && request.method === "GET") {
    return sendJson(response, 200, { status: "ok", database: "sqlite", time: new Date().toISOString() });
  }

  if (pathname === "/api/auth/login" && request.method === "POST") {
    const body = await readJson(request);
    const user = db.prepare("SELECT * FROM users WHERE email = ? AND active = 1").get(String(body.email || "").toLowerCase());
    if (!user || !verifyPassword(String(body.password || ""), user.password_hash)) {
      return sendJson(response, 401, { error: "Invalid email or password" });
    }
    const token = randomUUID();
    const session = { userId: user.id, name: user.name, email: user.email, role: user.role, createdAt: Date.now() };
    sessions.set(token, session);
    logAudit(db, user.id, "login", "user", user.id);
    return sendJson(response, 200, { token, user: session });
  }

  if (pathname === "/api/auth/me" && request.method === "GET") {
    const session = requireAuth(request, response);
    if (!session) return;
    return sendJson(response, 200, { user: session });
  }

  if (pathname === "/api/dashboard" && request.method === "GET") {
    const session = requireAuth(request, response, ["super_admin", "academic_head", "teacher", "operations"]);
    if (!session) return;
    return sendJson(response, 200, getDashboard(session));
  }

  if (pathname === "/api/students" && request.method === "GET") {
    const session = requireAuth(request, response, ["super_admin", "academic_head", "teacher", "operations"]);
    if (!session) return;
    return sendJson(response, 200, { students: getStudents(url, session) });
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

  const studentAppMatch = pathname.match(/^\/api\/student-app\/(\d+)$/);
  if (studentAppMatch && request.method === "GET") {
    const analysis = getStudentAnalysis(db, Number(studentAppMatch[1]));
    if (!analysis) return sendJson(response, 404, { error: "Student not found" });
    const todaySubmissions = db.prepare(`
      SELECT period, review_status, file_name, uploaded_at
      FROM practice_submissions
      WHERE student_id = ? AND date(uploaded_at) = date('now')
      ORDER BY uploaded_at DESC
    `).all(Number(studentAppMatch[1]));
    return sendJson(response, 200, {
      profile: analysis.student,
      latestSkills: analysis.latestSkills,
      todaySubmissions,
      feedback: analysis.submissions.filter((submission) => submission.review_status === "reviewed").slice(0, 5),
      upcomingSessions: analysis.sessions
        .filter((session) => session.status === "scheduled" && new Date(session.scheduled_at) >= new Date())
        .slice(0, 4),
      helpCalls: analysis.helpCalls.filter((call) => call.status === "scheduled")
    });
  }

  const submissionMatch = pathname.match(/^\/api\/student-app\/(\d+)\/practice-submissions$/);
  if (submissionMatch && request.method === "POST") {
    const studentId = Number(submissionMatch[1]);
    const student = db.prepare("SELECT * FROM students WHERE id = ?").get(studentId);
    if (!student) return sendJson(response, 404, { error: "Student not found" });
    const body = await readJson(request);
    if (!["morning", "evening"].includes(body.period)) return sendJson(response, 400, { error: "Invalid practice period" });
    const uploadedAt = new Date().toISOString();
    const fileName = String(body.fileName || `${body.period}-practice.mp4`);
    const storageKey = `students/${studentId}/week-${student.current_week}/${randomUUID()}-${fileName.replaceAll(/[^a-zA-Z0-9._-]/g, "-")}`;
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
      Number(body.durationSeconds) || 600,
      fileName,
      storageKey,
      uploadedAt
    );
    recalculateStudent(db, studentId);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), storageKey, uploadedAt, reviewStatus: "pending" });
  }

  const helpCallMatch = pathname.match(/^\/api\/student-app\/(\d+)\/help-calls$/);
  if (helpCallMatch && request.method === "POST") {
    const studentId = Number(helpCallMatch[1]);
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

  const cancelHelpCallMatch = pathname.match(/^\/api\/student-app\/(\d+)\/help-calls\/(\d+)\/cancel$/);
  if (cancelHelpCallMatch && request.method === "POST") {
    const studentId = Number(cancelHelpCallMatch[1]);
    const helpCallId = Number(cancelHelpCallMatch[2]);
    const result = db.prepare(`
      UPDATE help_calls
      SET status = 'cancelled'
      WHERE id = ? AND student_id = ? AND status = 'scheduled'
    `).run(helpCallId, studentId);
    if (!result.changes) return sendJson(response, 404, { error: "Scheduled help call not found" });
    return sendJson(response, 200, { ok: true });
  }

  const progressMatch = pathname.match(/^\/api\/student-app\/(\d+)\/progress$/);
  if (progressMatch && request.method === "POST") {
    const studentId = Number(progressMatch[1]);
    const body = await readJson(request);
    const week = Math.max(1, Math.min(12, Number(body.currentWeek) || 1));
    db.prepare("UPDATE students SET current_week = ? WHERE id = ?").run(week, studentId);
    recalculateStudent(db, studentId);
    return sendJson(response, 200, { ok: true, currentWeek: week });
  }

  return sendJson(response, 404, { error: "API route not found" });
}

function serveStatic(request, response, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  if (pathname === "/admin") pathname = "/admin.html";

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
      await handleApi(request, response, url);
    } else {
      serveStatic(request, response, url);
    }
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendJson(response, 500, { error: "Internal server error", detail: error.message });
    else response.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`MUSIC SCHOOL OTS running at http://${HOST}:${PORT}`);
  console.log(`Admin portal: http://${HOST}:${PORT}/admin`);
});
