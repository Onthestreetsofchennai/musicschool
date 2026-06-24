      if (scope !== null && number(submission.teacher_id) !== scope) return sendJson(response, 403, { error: "Submission is outside your queue" });
      const playbackUrl = createCloudinaryPrivateDownloadUrl(submission.storage_key);
      return playbackUrl
        ? sendJson(response, 200, { playbackUrl, storageMode: "cloudinary-private", expiresInSeconds: 900 })
        : sendJson(response, 422, { error: "The stored video reference is invalid" });
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

    if (pathname === "/api/student/me/video-upload-config" && request.method === "POST") {
      const session = await requireStudent(request, response);
      if (!session) return;
      const body = await readJson(request);
      const period = String(body.period || "");
      const fileSize = number(body.fileSize);
      if (!["morning", "evening"].includes(period)) return sendJson(response, 400, { error: "Invalid practice period" });
      if (!String(body.contentType || "").startsWith("video/")) return sendJson(response, 400, { error: "Only video uploads are allowed" });
      if (fileSize <= 0 || fileSize > maxPracticeVideoBytes) return sendJson(response, 400, { error: "Practice videos must be 100 MB or smaller." });
      if (!cloudinaryIsConfigured()) return sendJson(response, 503, { error: "Cloud video storage is not configured" });
      const config = cloudinaryUploadConfig({ studentId: session.studentId, period });
      return sendJson(response, 200, {
        ...config,
        uploadReceipt: createPracticeUploadReceipt({ studentId: session.studentId, period, publicId: config.publicId }),
        maxFileBytes: maxPracticeVideoBytes
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
      if (!verifyPracticeUploadReceipt(body.uploadReceipt, {
        studentId: session.studentId, period: body.period, storageKey: body.storageKey
      })) return sendJson(response, 400, { error: "The practice video must finish uploading before submission" });
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
        durationSeconds, body.fileName || `${body.period}-practice.mp4`, body.storageKey
      ]);
      await recalculateStudent(session.studentId);
      return sendJson(response, 201, {
        id: number(submission.id), storageKey: body.storageKey,
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
