const ADMIN_TOKEN_KEY = "otsAdminToken";
const API_ORIGIN = "https://music-school-ots.sharoncornerstone56.workers.dev";

let adminToken = localStorage.getItem(ADMIN_TOKEN_KEY) || "";
let adminUser = null;
let dashboardData = null;
let toastTimer;
let enrollmentTeachers = [];
let adminStudents = [];
let adminSessions = [];
let activeCoursePlan = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateTime(value) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function showToast(message) {
  const toast = document.querySelector("#admin-toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 3200);
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (adminToken) headers.Authorization = `Bearer ${adminToken}`;
  const response = await fetch(`${API_ORIGIN}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== "/api/auth/login") logout(false);
    throw new Error(payload.error || `Request failed with status ${response.status}`);
  }
  return payload;
}

function setLoggedIn(loggedIn) {
  document.querySelector("#admin-login").hidden = loggedIn;
  document.querySelector("#admin-shell").hidden = !loggedIn;
}

async function logout(showMessage = true) {
  const tokenToRevoke = adminToken;
  if (tokenToRevoke) {
    fetch(`${API_ORIGIN}/api/auth/logout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenToRevoke}`,
        "Content-Type": "application/json"
      },
      body: "{}"
    }).catch(() => {});
  }
  adminToken = "";
  adminUser = null;
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  setLoggedIn(false);
  if (showMessage) showToast("Signed out.");
}

function navigateAdmin(viewName) {
  document.querySelectorAll(".admin-view").forEach((view) => {
    view.classList.toggle("is-active", view.id === `admin-view-${viewName}`);
  });
  document.querySelectorAll(".admin-nav-item").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.adminView === viewName);
  });
  const activeView = document.querySelector(`#admin-view-${viewName}`);
  document.querySelector("#admin-page-title").textContent = activeView?.dataset.title || "OTS Admin";
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (viewName === "students") loadStudents();
  if (viewName === "staff" && adminUser?.role === "super_admin") loadStaff();
  if (viewName === "sessions") loadSessions();
  if (viewName === "courses") loadCoursePlanStudents();
  if (viewName === "reviews") loadReviews();
  if (viewName === "alerts") loadAlerts();
}

function statusBadge(status, score) {
  return `<span class="score-badge ${escapeHtml(status)}">${escapeHtml(status)} · ${Math.round(score || 0)}</span>`;
}

function initials(name) {
  return String(name || "OTS").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

async function loadDashboard() {
  dashboardData = await api("/api/dashboard");
  const summary = dashboardData.summary;
  const attention = Number(summary.amber_students || 0) + Number(summary.red_students || 0);
  const active = Number(summary.active_students || 0);

  document.querySelector("#metric-active-students").textContent = active;
  document.querySelector("#metric-attention-students").textContent = attention;
  document.querySelector("#metric-pending-reviews").textContent = summary.pending_reviews;
  document.querySelector("#metric-average-score").textContent = Math.round(summary.average_score || 0);
  document.querySelector("#nav-review-count").textContent = summary.pending_reviews;
  document.querySelector("#nav-alert-count").textContent = summary.open_alerts;
  document.querySelector("#service-open-alerts").textContent = summary.open_alerts;
  document.querySelector("#service-today-sessions").textContent = summary.todays_sessions;
  document.querySelector("#service-review-hours").textContent = `${summary.review_turnaround_hours || 0}h`;

  const distribution = [
    ["green", Number(summary.green_students || 0)],
    ["amber", Number(summary.amber_students || 0)],
    ["red", Number(summary.red_students || 0)]
  ];
  distribution.forEach(([status, count]) => {
    document.querySelector(`#${status}-count`).textContent = count;
    document.querySelector(`#${status}-distribution`).style.width = `${active ? (count / active) * 100 : 0}%`;
  });

  document.querySelector("#attention-students-body").innerHTML = dashboardData.attentionStudents.map((student) => `
    <tr>
      <td>
        <div class="student-cell">
          <span class="table-avatar">${initials(student.name)}</span>
          <span><strong>${escapeHtml(student.name)}</strong><small>${escapeHtml(student.instrument)}</small></span>
        </div>
      </td>
      <td>Week ${student.current_week} of 12</td>
      <td>${escapeHtml(student.teacher_name)}</td>
      <td>${statusBadge(student.status, student.overall_score)}</td>
      <td>${student.alert_count}</td>
      <td><button class="row-action open-student" data-student-id="${student.id}">Open</button></td>
    </tr>
  `).join("");

  document.querySelector("#upcoming-session-grid").innerHTML = dashboardData.upcomingSessions.length
    ? dashboardData.upcomingSessions.map((session) => `
      <article class="upcoming-card">
        <span>${formatDateTime(session.scheduled_at)}</span>
        <strong>${escapeHtml(session.student_name)}</strong>
        <small>${escapeHtml(session.topic)} · ${escapeHtml(session.teacher_name)}</small>
      </article>
    `).join("")
    : '<div class="empty-state">No upcoming sessions.</div>';
}

async function loadStudents() {
  const search = document.querySelector("#student-search").value.trim();
  const status = document.querySelector("#student-status-filter").value;
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (status) params.set("status", status);
  const data = await api(`/api/students?${params.toString()}`);
  if (!search && !status) adminStudents = data.students;

  document.querySelector("#students-table-body").innerHTML = data.students.length
    ? data.students.map((student) => `
      <tr>
        <td>
          <div class="student-cell">
            <span class="table-avatar">${initials(student.name)}</span>
            <span><strong>${escapeHtml(student.name)}</strong><small>${escapeHtml(student.instrument)}</small></span>
          </div>
        </td>
        <td>${escapeHtml(student.teacher_name)}</td>
        <td>${student.current_week}/12</td>
        <td>${scoreBar(student.practice_score)}</td>
        <td>${scoreBar(student.attendance_score)}</td>
        <td>${scoreBar(student.skill_score)}</td>
        <td>${statusBadge(student.status, student.overall_score)}</td>
        <td><button class="row-action open-student" data-student-id="${student.id}">Open 360°</button></td>
      </tr>
    `).join("")
    : '<tr><td colspan="8"><div class="empty-state">No students match these filters.</div></td></tr>';
}

async function openCreateStudent() {
  const error = document.querySelector("#create-student-error");
  error.hidden = true;
  if (!enrollmentTeachers.length) {
    const data = await api("/api/teachers");
    enrollmentTeachers = data.teachers;
  }
  if (!enrollmentTeachers.length) {
    showToast("A Super Admin must create a teacher before adding students.");
    return;
  }
  renderEnrollmentTeachers();
  document.querySelector("#create-student-start").value = new Date().toISOString().slice(0, 10);
  document.querySelector("#create-student-modal").showModal();
}

function renderEnrollmentTeachers() {
  const instrument = document.querySelector("#create-student-instrument").value;
  const matchingTeachers = enrollmentTeachers.filter((teacher) => teacher.instrument === instrument);
  document.querySelector("#create-student-teacher").innerHTML = matchingTeachers.map((teacher) => (
    `<option value="${teacher.id}">${escapeHtml(teacher.name)} - ${escapeHtml(teacher.instrument)}</option>`
  )).join("");
}

async function createStudent(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = document.querySelector("#create-student-error");
  const submitButton = form.querySelector("button[type='submit']");
  error.hidden = true;
  submitButton.disabled = true;
  try {
    await api("/api/students", {
      method: "POST",
      body: JSON.stringify({
        name: document.querySelector("#create-student-name").value.trim(),
        email: document.querySelector("#create-student-email").value.trim(),
        ageGroup: document.querySelector("#create-student-age").value,
        instrument: document.querySelector("#create-student-instrument").value,
        goal: document.querySelector("#create-student-goal").value.trim(),
        teacherId: Number(document.querySelector("#create-student-teacher").value),
        courseStartDate: document.querySelector("#create-student-start").value,
        parentName: document.querySelector("#create-parent-name").value.trim(),
        parentEmail: document.querySelector("#create-parent-email").value.trim()
      })
    });
    form.reset();
    document.querySelector("#create-student-modal").close();
    await Promise.all([loadStudents(), loadDashboard()]);
    showToast("Student account created. OTP login is ready.");
  } catch (createError) {
    error.textContent = createError.message;
    error.hidden = false;
  } finally {
    submitButton.disabled = false;
  }
}

function roleLabel(role) {
  return String(role || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function loadStaff() {
  const data = await api("/api/staff");
  document.querySelector("#staff-table-body").innerHTML = data.staff.length
    ? data.staff.map((member) => `
      <tr>
        <td>
          <div class="student-cell">
            <span class="table-avatar">${initials(member.name)}</span>
            <span><strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(member.email)}</small></span>
          </div>
        </td>
        <td>${escapeHtml(roleLabel(member.role))}</td>
        <td>${escapeHtml(member.instrument || "-")}</td>
        <td>${Number(member.student_count || 0)}</td>
        <td><span class="status-pill ${member.active ? "green" : "red"}">${member.active ? "Active" : "Inactive"}</span></td>
        <td class="row-actions">
          <button
            class="row-action reset-staff-password"
            data-staff-id="${member.id}"
            data-staff-name="${escapeHtml(member.name)}"
          >Reset password</button>
          <button
            class="row-action toggle-staff-status"
            data-staff-id="${member.id}"
            data-next-active="${member.active ? "false" : "true"}"
          >${member.active ? "Deactivate" : "Activate"}</button>
        </td>
      </tr>
    `).join("")
    : '<tr><td colspan="6"><div class="empty-state">No staff accounts found.</div></td></tr>';
}

function updateStaffInstrumentField() {
  const isTeacher = document.querySelector("#create-staff-role").value === "teacher";
  document.querySelector("#create-staff-instrument-row").hidden = !isTeacher;
  document.querySelector("#create-staff-instrument").required = isTeacher;
}

function openCreateStaff() {
  document.querySelector("#create-staff-error").hidden = true;
  updateStaffInstrumentField();
  document.querySelector("#create-staff-modal").showModal();
}

async function createStaff(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = document.querySelector("#create-staff-error");
  const submitButton = form.querySelector("button[type='submit']");
  const role = document.querySelector("#create-staff-role").value;
  error.hidden = true;
  submitButton.disabled = true;
  try {
    await api("/api/staff", {
      method: "POST",
      body: JSON.stringify({
        name: document.querySelector("#create-staff-name").value.trim(),
        email: document.querySelector("#create-staff-email").value.trim(),
        password: document.querySelector("#create-staff-password").value,
        role,
        instrument: role === "teacher" ? document.querySelector("#create-staff-instrument").value : ""
      })
    });
    form.reset();
    updateStaffInstrumentField();
    document.querySelector("#create-staff-modal").close();
    await loadStaff();
    enrollmentTeachers = [];
    showToast("Staff account created.");
  } catch (createError) {
    error.textContent = createError.message;
    error.hidden = false;
  } finally {
    submitButton.disabled = false;
  }
}

async function toggleStaffStatus(button) {
  const staffId = Number(button.dataset.staffId);
  const active = button.dataset.nextActive === "true";
  button.disabled = true;
  try {
    await api(`/api/staff/${staffId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ active })
    });
    await loadStaff();
    enrollmentTeachers = [];
    showToast(active ? "Staff account activated." : "Staff account deactivated.");
  } catch (error) {
    showToast(error.message);
    button.disabled = false;
  }
}

async function loadEditorStudents() {
  if (!adminStudents.length) {
    const data = await api("/api/students");
    adminStudents = data.students;
  }
  return adminStudents;
}

function toDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

async function loadSessions() {
  const data = await api("/api/sessions");
  adminSessions = data.sessions;
  document.querySelector("#sessions-table-body").innerHTML = adminSessions.length
    ? adminSessions.map((session) => `
      <tr>
        <td>
          <div class="student-cell">
            <span class="table-avatar">${initials(session.student_name)}</span>
            <span><strong>${escapeHtml(session.student_name)}</strong><small>${escapeHtml(session.instrument)}</small></span>
          </div>
        </td>
        <td>${escapeHtml(session.teacher_name)}</td>
        <td>${escapeHtml(session.topic)}</td>
        <td>${formatDateTime(session.scheduled_at)}</td>
        <td><span class="status-pill ${session.status === "scheduled" || session.status === "attended" ? "green" : "amber"}">${escapeHtml(session.status)}</span></td>
        <td><button class="row-action edit-session" data-session-id="${session.id}">Edit</button></td>
      </tr>
    `).join("")
    : '<tr><td colspan="6"><div class="empty-state">No live sessions have been scheduled.</div></td></tr>';
}

async function openSessionEditor(session = null) {
  const students = await loadEditorStudents();
  if (!students.length) {
    showToast("Add a student before creating a live session.");
    return;
  }
  const form = document.querySelector("#session-form");
  form.reset();
  document.querySelector("#session-error").hidden = true;
  document.querySelector("#session-student").innerHTML = students.map((student) => (
    `<option value="${student.id}">${escapeHtml(student.name)} - ${escapeHtml(student.instrument)}</option>`
  )).join("");
  document.querySelector("#session-id").value = session?.id || "";
  document.querySelector("#session-modal-title").textContent = session ? "Edit live session" : "Add a live session";
  document.querySelector("#session-student").disabled = Boolean(session);
  document.querySelector("#session-student").value = session?.student_id || students[0].id;
  document.querySelector("#session-scheduled-at").value = session
    ? toDateTimeLocal(session.scheduled_at)
    : toDateTimeLocal(new Date(Date.now() + 24 * 60 * 60 * 1000));
  document.querySelector("#session-topic").value = session?.topic || "";
  document.querySelector("#session-duration").value = session?.duration_minutes || 45;
  document.querySelector("#session-status").value = session?.status || "scheduled";
  document.querySelector("#session-room").value = session?.meeting_room || "";
  document.querySelector("#session-notes").value = session?.notes || "";
  document.querySelector("#session-modal").showModal();
}

async function saveSession(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const sessionId = Number(document.querySelector("#session-id").value || 0);
  const error = document.querySelector("#session-error");
  const submitButton = form.querySelector("button[type='submit']");
  const scheduledAt = document.querySelector("#session-scheduled-at").value;
  error.hidden = true;
  submitButton.disabled = true;
  try {
    const payload = {
      studentId: Number(document.querySelector("#session-student").value),
      scheduledAt: new Date(scheduledAt).toISOString(),
      topic: document.querySelector("#session-topic").value.trim(),
      durationMinutes: Number(document.querySelector("#session-duration").value),
      status: document.querySelector("#session-status").value,
      meetingRoom: document.querySelector("#session-room").value.trim(),
      notes: document.querySelector("#session-notes").value.trim()
    };
    await api(sessionId ? `/api/sessions/${sessionId}` : "/api/sessions", {
      method: sessionId ? "PATCH" : "POST",
      body: JSON.stringify(payload)
    });
    document.querySelector("#session-modal").close();
    await Promise.all([loadSessions(), loadDashboard()]);
    showToast(sessionId ? "Live session updated." : "Live session added.");
  } catch (saveError) {
    error.textContent = saveError.message;
    error.hidden = false;
  } finally {
    submitButton.disabled = false;
  }
}

async function loadCoursePlanStudents() {
  const students = await loadEditorStudents();
  const select = document.querySelector("#course-student-select");
  const previousId = Number(select.value || 0);
  select.innerHTML = students.map((student) => (
    `<option value="${student.id}">${escapeHtml(student.name)} - ${escapeHtml(student.instrument)}</option>`
  )).join("");
  if (!students.length) {
    document.querySelector("#course-plan-form").hidden = true;
    return;
  }
  document.querySelector("#course-plan-form").hidden = false;
  select.value = students.some((student) => student.id === previousId) ? previousId : students[0].id;
  await loadCoursePlan(Number(select.value));
}

async function loadCoursePlan(studentId) {
  const data = await api(`/api/students/${studentId}/course-plan`);
  activeCoursePlan = data.coursePlan;
  document.querySelector("#course-title").value = activeCoursePlan.course_title;
  document.querySelector("#course-total-weeks").value = activeCoursePlan.total_weeks;
  document.querySelector("#course-practice-minutes").value = activeCoursePlan.practice_minutes;
  document.querySelector("#course-morning-required").checked = activeCoursePlan.morning_required;
  document.querySelector("#course-evening-required").checked = activeCoursePlan.evening_required;
  renderCourseWeekEditor();
}

function renderCourseWeekEditor() {
  if (!activeCoursePlan) return;
  const totalWeeks = Math.max(1, Math.min(24, Number(document.querySelector("#course-total-weeks").value || 12)));
  const weeks = Array.from({ length: totalWeeks }, (_, index) => activeCoursePlan.weeks?.[index] || {
    title: `Week ${index + 1}`,
    focus: "",
    milestone: "",
    lessons: [],
    practice_instructions: ""
  });
  document.querySelector("#course-week-editor").innerHTML = weeks.map((week, index) => `
    <article class="course-week-card" data-course-week="${index + 1}">
      <strong>Week ${index + 1}</strong>
      <label>
        Week title
        <input data-week-field="title" value="${escapeHtml(week.title || "")}" required>
      </label>
      <label>
        Focus
        <textarea data-week-field="focus" rows="2">${escapeHtml(week.focus || "")}</textarea>
      </label>
      <label>
        Milestone
        <textarea data-week-field="milestone" rows="2">${escapeHtml(week.milestone || "")}</textarea>
      </label>
      <label>
        Lessons, one per line
        <textarea data-week-field="lessons" rows="3">${escapeHtml((week.lessons || []).join("\n"))}</textarea>
      </label>
      <label>
        Daily practice instruction
        <textarea data-week-field="practiceInstructions" rows="2">${escapeHtml(week.practice_instructions || week.practiceInstructions || "")}</textarea>
      </label>
    </article>
  `).join("");
}

async function saveCoursePlan(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = document.querySelector("#course-plan-error");
  const submitButton = form.querySelector("button[type='submit']");
  const studentId = Number(document.querySelector("#course-student-select").value);
  const weeks = [...document.querySelectorAll("[data-course-week]")].map((card) => ({
    title: card.querySelector('[data-week-field="title"]').value.trim(),
    focus: card.querySelector('[data-week-field="focus"]').value.trim(),
    milestone: card.querySelector('[data-week-field="milestone"]').value.trim(),
    lessons: card.querySelector('[data-week-field="lessons"]').value.split("\n").map((item) => item.trim()).filter(Boolean),
    practiceInstructions: card.querySelector('[data-week-field="practiceInstructions"]').value.trim()
  }));
  error.hidden = true;
  submitButton.disabled = true;
  try {
    const data = await api(`/api/students/${studentId}/course-plan`, {
      method: "PATCH",
      body: JSON.stringify({
        courseTitle: document.querySelector("#course-title").value.trim(),
        totalWeeks: Number(document.querySelector("#course-total-weeks").value),
        practiceMinutes: Number(document.querySelector("#course-practice-minutes").value),
        morningRequired: document.querySelector("#course-morning-required").checked,
        eveningRequired: document.querySelector("#course-evening-required").checked,
        weeks
      })
    });
    activeCoursePlan = data.coursePlan;
    renderCourseWeekEditor();
    showToast("Student course and practice plan saved.");
  } catch (saveError) {
    error.textContent = saveError.message;
    error.hidden = false;
  } finally {
    submitButton.disabled = false;
  }
}

async function changePassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = document.querySelector("#change-password-error");
  const newPassword = document.querySelector("#new-password").value;
  const confirmation = document.querySelector("#confirm-new-password").value;
  error.hidden = true;
  if (newPassword !== confirmation) {
    error.textContent = "The new passwords do not match.";
    error.hidden = false;
    return;
  }
  const submitButton = form.querySelector("button[type='submit']");
  submitButton.disabled = true;
  try {
    await api("/api/auth/password", {
      method: "PATCH",
      body: JSON.stringify({
        currentPassword: document.querySelector("#current-password").value,
        newPassword
      })
    });
    form.reset();
    showToast("Your password has been changed.");
  } catch (changeError) {
    error.textContent = changeError.message;
    error.hidden = false;
  } finally {
    submitButton.disabled = false;
  }
}

function openResetPassword(button) {
  document.querySelector("#reset-password-form").reset();
  document.querySelector("#reset-password-error").hidden = true;
  document.querySelector("#reset-password-staff-id").value = button.dataset.staffId;
  document.querySelector("#reset-password-member").textContent = `Set a new temporary password for ${button.dataset.staffName}.`;
  document.querySelector("#reset-password-modal").showModal();
}

async function resetStaffPassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = document.querySelector("#reset-password-error");
  const submitButton = form.querySelector("button[type='submit']");
  error.hidden = true;
  submitButton.disabled = true;
  try {
    await api(`/api/staff/${Number(document.querySelector("#reset-password-staff-id").value)}/password`, {
      method: "PATCH",
      body: JSON.stringify({ newPassword: document.querySelector("#reset-staff-password").value })
    });
    document.querySelector("#reset-password-modal").close();
    showToast("Staff password reset.");
  } catch (resetError) {
    error.textContent = resetError.message;
    error.hidden = false;
  } finally {
    submitButton.disabled = false;
  }
}

function scoreBar(score) {
  const value = Math.round(score || 0);
  return `<div class="score-cell"><div class="mini-track"><span style="width:${value}%"></span></div><strong>${value}</strong></div>`;
}

async function openStudent(studentId) {
  const data = await api(`/api/students/${studentId}`);
  const student = data.student;
  const skills = data.latestSkills || {};
  const scoreCards = [
    ["Practice consistency", student.practice_score],
    ["Session attendance", student.attendance_score],
    ["Skill improvement", student.skill_score],
    ["Feedback applied", student.feedback_score]
  ];

  const skillNames = ["rhythm", "accuracy", "technique", "posture", "musicality", "confidence"];
  const alertsHtml = data.alerts.length
    ? data.alerts.map((alert) => `<div class="detail-list-row"><span>${escapeHtml(alert.title)}</span><strong>${escapeHtml(alert.severity)}</strong></div>`).join("")
    : '<p class="empty-state">No active alerts.</p>';

  const submissionsHtml = data.submissions.slice(0, 6).map((submission) => `
    <div class="detail-list-row">
      <span>${escapeHtml(submission.period)} · ${formatDateTime(submission.uploaded_at)}</span>
      <strong>${escapeHtml(submission.review_status)}</strong>
    </div>
  `).join("");

  const sessionsHtml = data.sessions.slice(0, 6).map((session) => `
    <div class="detail-list-row">
      <span>${formatDateTime(session.scheduled_at)}</span>
      <strong>${escapeHtml(session.status)}</strong>
    </div>
  `).join("");

  document.querySelector("#student-modal-content").innerHTML = `
    <header class="student-modal-header">
      <div class="student-modal-heading">
        <span class="table-avatar">${initials(student.name)}</span>
        <div>
          <h2>${escapeHtml(student.name)}</h2>
          <p>${escapeHtml(student.instrument)} · Week ${student.current_week} of 12 · Teacher ${escapeHtml(student.teacher_name)}</p>
        </div>
      </div>
      <div class="large-score ${escapeHtml(student.analysis_status)}">${Math.round(student.overall_score || 0)}</div>
    </header>
    <div class="analysis-score-grid">
      ${scoreCards.map(([label, score]) => `
        <div class="analysis-score-card">
          <span>${label}</span>
          <strong>${Math.round(score || 0)}</strong>
          <div class="mini-track"><span style="width:${Math.round(score || 0)}%"></span></div>
        </div>
      `).join("")}
    </div>
    <div class="student-detail-grid">
      <section class="detail-block">
        <h3>Latest skill ratings</h3>
        <div class="skill-list">
          ${skillNames.map((skill) => {
            const value = Number(skills[skill] || 0);
            return `<div class="skill-row"><span>${skill}</span><div class="skill-track"><span style="width:${value * 20}%"></span></div><strong>${value || "-"}</strong></div>`;
          }).join("")}
        </div>
      </section>
      <section class="detail-block">
        <h3>Student details</h3>
        <div class="detail-list">
          <div class="detail-list-row"><span>Goal</span><strong>${escapeHtml(student.goal)}</strong></div>
          <div class="detail-list-row"><span>Login email</span><strong>${escapeHtml(student.email || "Not linked")}</strong></div>
          <div class="detail-list-row"><span>Age group</span><strong>${escapeHtml(student.age_group)}</strong></div>
          <div class="detail-list-row"><span>Parent</span><strong>${escapeHtml(student.parent_name || "Not linked")}</strong></div>
          <div class="detail-list-row"><span>Course start</span><strong>${escapeHtml(student.course_start_date)}</strong></div>
        </div>
      </section>
      <section class="detail-block">
        <h3>Active alerts</h3>
        <div class="detail-list">${alertsHtml}</div>
      </section>
      <section class="detail-block">
        <h3>Recent submissions</h3>
        <div class="detail-list">${submissionsHtml || '<p class="empty-state">No submissions.</p>'}</div>
      </section>
      <section class="detail-block">
        <h3>Session history</h3>
        <div class="detail-list">${sessionsHtml || '<p class="empty-state">No sessions.</p>'}</div>
      </section>
      <section class="detail-block">
        <h3>Help calls</h3>
        <div class="detail-list">
          ${data.helpCalls.length ? data.helpCalls.map((call) => `<div class="detail-list-row"><span>${formatDateTime(call.scheduled_at)}</span><strong>${escapeHtml(call.status)}</strong></div>`).join("") : '<p class="empty-state">No help calls.</p>'}
        </div>
      </section>
    </div>
  `;
  document.querySelector("#student-modal").showModal();
}

async function loadReviews() {
  const data = await api("/api/reviews?status=pending");
  document.querySelector("#nav-review-count").textContent = data.submissions.length;
  document.querySelector("#review-queue").innerHTML = data.submissions.length
    ? data.submissions.map((submission) => `
      <article class="review-card">
        <span class="video-icon">▶</span>
        <div class="review-main">
          <strong>${escapeHtml(submission.student_name)} · ${escapeHtml(submission.period)} practice</strong>
          <span>Week ${submission.course_week} · ${escapeHtml(submission.file_name)} · ${formatDateTime(submission.uploaded_at)}</span>
        </div>
        <div class="waiting-time">
          <strong>${submission.waiting_hours}h</strong>
          <small>waiting</small>
        </div>
        <button
          class="admin-button primary open-review"
          data-submission-id="${submission.id}"
          data-student-name="${escapeHtml(submission.student_name)}"
          data-period="${escapeHtml(submission.period)}"
          data-file-name="${escapeHtml(submission.file_name)}"
          data-week="${submission.course_week}"
        >Review</button>
      </article>
    `).join("")
    : '<div class="empty-state">The review queue is clear.</div>';
}

async function openReview(button) {
  document.querySelector("#review-submission-id").value = button.dataset.submissionId;
  document.querySelector("#review-modal-title").textContent = `${button.dataset.studentName}'s ${button.dataset.period} practice`;
  document.querySelector("#review-modal-subtitle").textContent = `Week ${button.dataset.week} submission`;
  document.querySelector("#review-file-name").textContent = button.dataset.fileName;
  const player = document.querySelector("#review-video-player");
  const icon = document.querySelector(".review-video-placeholder > span");
  const message = document.querySelector("#review-video-message");
  player.hidden = true;
  player.removeAttribute("src");
  icon.hidden = false;
  message.textContent = "Loading private practice video...";
  document.querySelector("#review-modal").showModal();
  try {
    const access = await api(`/api/reviews/${button.dataset.submissionId}/video-access`);
    if (access.playbackUrl) {
      player.src = access.playbackUrl;
      player.hidden = false;
      icon.hidden = true;
      message.textContent = "Private video access expires in 15 minutes.";
    } else {
      message.textContent = access.message || "This MVP currently stores the practice check-in details without the video file.";
    }
  } catch (error) {
    message.textContent = error.message;
  }
}

async function submitReview(event) {
  event.preventDefault();
  const submissionId = document.querySelector("#review-submission-id").value;
  const ratings = {};
  document.querySelectorAll("[data-rating]").forEach((input) => {
    ratings[input.dataset.rating] = Number(input.value);
  });

  await api(`/api/reviews/${submissionId}`, {
    method: "POST",
    body: JSON.stringify({
      positiveObservation: document.querySelector("#review-positive").value,
      mainCorrection: document.querySelector("#review-correction").value,
      nextPracticeFocus: document.querySelector("#review-next-focus").value,
      requiresHelpCall: document.querySelector("#review-help-call").checked,
      ratings
    })
  });
  document.querySelector("#review-modal").close();
  showToast("Review submitted and student analysis updated.");
  await Promise.all([loadReviews(), loadDashboard()]);
}

async function loadAlerts() {
  const data = await api("/api/alerts");
  document.querySelector("#nav-alert-count").textContent = data.alerts.length;
  document.querySelector("#alert-list").innerHTML = data.alerts.length
    ? data.alerts.map((alert) => `
      <article class="alert-card ${escapeHtml(alert.severity)}">
        <span class="alert-symbol">!</span>
        <div class="alert-copy">
          <h3>${escapeHtml(alert.title)}</h3>
          <p>${escapeHtml(alert.detail)}</p>
          <small>${escapeHtml(alert.student_name)} · ${escapeHtml(alert.instrument)} · Teacher ${escapeHtml(alert.teacher_name)}</small>
        </div>
        <div class="alert-actions">
          <button class="row-action open-student" data-student-id="${alert.student_id}">Open student</button>
          <button class="row-action resolve-alert" data-alert-id="${alert.id}">Resolve</button>
        </div>
      </article>
    `).join("")
    : '<div class="empty-state">No unresolved alerts.</div>';
}

async function resolveAlert(alertId) {
  await api(`/api/alerts/${alertId}/resolve`, { method: "POST", body: "{}" });
  showToast("Alert resolved.");
  await Promise.all([loadAlerts(), loadDashboard()]);
}

function bindEvents() {
  document.querySelector("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const error = document.querySelector("#login-error");
    error.hidden = true;
    try {
      const result = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: document.querySelector("#login-email").value.trim(),
          password: document.querySelector("#login-password").value
        })
      });
      adminToken = result.token;
      adminUser = result.user;
      localStorage.setItem(ADMIN_TOKEN_KEY, adminToken);
      setLoggedIn(true);
      renderAdminUser();
      await loadDashboard();
    } catch (loginError) {
      error.textContent = loginError.message;
      error.hidden = false;
    }
  });

  document.querySelectorAll("[data-admin-view]").forEach((button) => {
    button.addEventListener("click", () => navigateAdmin(button.dataset.adminView));
  });

  document.querySelector("#refresh-dashboard").addEventListener("click", async () => {
    await loadDashboard();
    showToast("Dashboard refreshed.");
  });
  document.querySelector("#apply-student-filters").addEventListener("click", loadStudents);
  document.querySelector("#student-search").addEventListener("keydown", (event) => {
    if (event.key === "Enter") loadStudents();
  });
  document.querySelector("#logout-button").addEventListener("click", () => logout());
  document.querySelector("#open-create-student").addEventListener("click", openCreateStudent);
  document.querySelector("#create-student-form").addEventListener("submit", createStudent);
  document.querySelector("#create-student-instrument").addEventListener("change", renderEnrollmentTeachers);
  document.querySelector("#open-create-staff").addEventListener("click", openCreateStaff);
  document.querySelector("#create-staff-form").addEventListener("submit", createStaff);
  document.querySelector("#create-staff-role").addEventListener("change", updateStaffInstrumentField);
  document.querySelector("#open-create-session").addEventListener("click", () => openSessionEditor());
  document.querySelector("#session-form").addEventListener("submit", saveSession);
  document.querySelector("#course-student-select").addEventListener("change", (event) => loadCoursePlan(Number(event.target.value)));
  document.querySelector("#course-total-weeks").addEventListener("change", renderCourseWeekEditor);
  document.querySelector("#course-plan-form").addEventListener("submit", saveCoursePlan);
  document.querySelector("#change-password-form").addEventListener("submit", changePassword);
  document.querySelector("#reset-password-form").addEventListener("submit", resetStaffPassword);
  document.querySelector("#review-form").addEventListener("submit", submitReview);

  document.querySelectorAll("[data-rating]").forEach((input) => {
    input.addEventListener("input", () => {
      input.parentElement.querySelector("output").textContent = input.value;
    });
  });

  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => document.querySelector(`#${button.dataset.closeModal}`).close());
  });

  document.addEventListener("click", async (event) => {
    const studentButton = event.target.closest(".open-student");
    if (studentButton) await openStudent(Number(studentButton.dataset.studentId));

    const reviewButton = event.target.closest(".open-review");
    if (reviewButton) await openReview(reviewButton);

    const resolveButton = event.target.closest(".resolve-alert");
    if (resolveButton) await resolveAlert(Number(resolveButton.dataset.alertId));

    const staffStatusButton = event.target.closest(".toggle-staff-status");
    if (staffStatusButton) await toggleStaffStatus(staffStatusButton);

    const staffPasswordButton = event.target.closest(".reset-staff-password");
    if (staffPasswordButton) openResetPassword(staffPasswordButton);

    const sessionButton = event.target.closest(".edit-session");
    if (sessionButton) {
      const session = adminSessions.find((item) => Number(item.id) === Number(sessionButton.dataset.sessionId));
      if (session) await openSessionEditor(session);
    }
  });
}

function renderAdminUser() {
  if (!adminUser) return;
  document.querySelector("#admin-user-name").textContent = adminUser.name;
  document.querySelector("#admin-user-role").textContent = adminUser.role.replaceAll("_", " ");
  document.querySelector("#admin-avatar").textContent = initials(adminUser.name);
  document.querySelector("#open-create-student").hidden = adminUser.role === "teacher";
  document.querySelector("#staff-nav-item").hidden = adminUser.role !== "super_admin";
  document.querySelector(".admin-brand small").textContent = adminUser.role === "teacher"
    ? "Teacher workspace"
    : "Academic operations";
}

function clearLegacyDemoAutofill() {
  if (["localhost", "127.0.0.1"].includes(window.location.hostname)) return;
  const emailInput = document.querySelector("#login-email");
  const passwordInput = document.querySelector("#login-password");
  if (emailInput.value.trim().toLowerCase() === "admin@ots.test") {
    emailInput.value = "";
    passwordInput.value = "";
  }
}

async function restoreSession() {
  if (!adminToken) {
    setLoggedIn(false);
    return;
  }
  try {
    const result = await api("/api/auth/me");
    adminUser = result.user;
    setLoggedIn(true);
    renderAdminUser();
    await loadDashboard();
  } catch {
    logout(false);
  }
}

async function init() {
  document.querySelector("#admin-date-label").textContent = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date()).toUpperCase();
  bindEvents();
  clearLegacyDemoAutofill();
  window.setTimeout(clearLegacyDemoAutofill, 500);
  await restoreSession();
}

init();
