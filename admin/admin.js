const ADMIN_TOKEN_KEY = "otsAdminToken";
const WORKER_API_ORIGIN = window.OTS_API_ORIGIN || "https://music-school-ots.sharoncornerstone56.workers.dev";
const API_ORIGIN = (() => {
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".workers.dev")) return "";
  return WORKER_API_ORIGIN;
})();
const GOOGLE_MEET_CREATE_URL = "https://meet.google.com/new";
const GOOGLE_MEET_NICKNAME_PREFIX = "ots-music-school-student";

let adminToken = localStorage.getItem(ADMIN_TOKEN_KEY) || "";
let adminUser = null;
let dashboardData = null;
let toastTimer;
let enrollmentTeachers = [];
let adminStudents = [];
let adminSessions = [];
let activeCoursePlan = null;
let pendingCoursePlanFocus = null;
let journeyStudents = [];
let journeyApprovalData = { students: [], summary: {} };
let activeJourneyStudentId = 0;
let activeJourneyWeek = 0;
let adminActivityEntries = [];

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

function standardGoogleMeetLink(studentId) {
  const id = Number(studentId || 0);
  if (!id) return "";
  return `https://meet.google.com/lookup/${GOOGLE_MEET_NICKNAME_PREFIX}-${id}`;
}

function liveClassroomUrl(meetingValue, studentId = 0) {
  const value = String(meetingValue || "").trim();
  if (!value) return standardGoogleMeetLink(studentId) || GOOGLE_MEET_CREATE_URL;
  if (/^https?:\/\//i.test(value)) return value;
  const code = value
    .replace(/^meet\.google\.com\//i, "")
    .split(/[?#]/)[0]
    .trim()
    .toLowerCase();
  if (/^[a-z]{3}-?[a-z]{4}-?[a-z]{3}$/.test(code)) {
    return `https://meet.google.com/${code}`;
  }
  return standardGoogleMeetLink(studentId) || GOOGLE_MEET_CREATE_URL;
}

function sessionRoomName(session) {
  return session.meeting_room || "";
}

function defaultSessionMeetLink() {
  return standardGoogleMeetLink(document.querySelector("#session-student")?.value);
}

function assetUrl(path) {
  const adminPath = window.location.pathname.includes("/admin");
  return new URL(adminPath ? `../${path}` : path, window.location.href).href;
}

function showToast(message) {
  const toast = document.querySelector("#admin-toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 3200);
}

function updateModalLock() {
  document.body.classList.toggle("admin-modal-open", Boolean(document.querySelector(".admin-modal[open]")));
}

function openAdminModal(selector) {
  const modal = document.querySelector(selector);
  if (!modal) return;
  modal.showModal();
  updateModalLock();
}

function closeAdminModal(selector) {
  const modal = document.querySelector(selector);
  if (!modal) return;
  modal.close();
  updateModalLock();
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

async function loadBackendHealth() {
  const statusLine = document.querySelector("#admin-backend-status");
  if (!statusLine) return;
  try {
    const response = await fetch(`${API_ORIGIN}/api/health`);
    const health = await response.json();
    const database = health.database === "cloudflare-d1" ? "Cloudflare D1" : health.database || "database";
    const storage = health.videoStorage === "google-drive" ? "Google Drive active" : "metadata only";
    statusLine.textContent = `${database} / Video storage: ${storage}`;
  } catch {
    statusLine.textContent = "Backend reachable / storage check pending";
  }
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
  document.body.classList.remove("admin-modal-open");
  const navView = viewName === "student-detail" ? "students" : viewName === "review-detail" ? "reviews" : viewName;
  document.querySelectorAll(".admin-view").forEach((view) => {
    view.classList.toggle("is-active", view.id === `admin-view-${viewName}`);
  });
  document.querySelectorAll(".admin-nav-item").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.adminView === navView);
  });
  const activeView = document.querySelector(`#admin-view-${viewName}`);
  document.querySelector("#admin-page-title").textContent = activeView?.dataset.title || "THE OTS MUSIC SCHOOL Admin";
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (viewName === "students") loadStudents();
  if (viewName === "staff" && adminUser?.role === "super_admin") loadStaff();
  if (viewName === "sessions") loadSessions();
  if (viewName === "courses") loadCoursePlanStudents();
  if (viewName === "journey") loadJourneyControl();
  if (viewName === "reviews") loadReviews();
  if (viewName === "activity") loadActivityLog();
  if (viewName === "alerts") loadAlerts();
}

function statusBadge(status, score) {
  return `<span class="score-badge ${escapeHtml(status)}">${escapeHtml(status)} · ${Math.round(score || 0)}</span>`;
}

function initials(name) {
  return String(name || "OTS").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function teacherIdListFromValue(value) {
  if (Array.isArray(value)) return value.map(Number).filter(Boolean);
  return String(value || "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter(Boolean);
}

function selectedTeacherIds(select) {
  return [...select.selectedOptions].map((option) => Number(option.value)).filter(Boolean).slice(0, 3);
}

function limitTeacherSelection(select) {
  const selected = [...select.selectedOptions];
  if (selected.length <= 3) return;
  selected.slice(3).forEach((option) => {
    option.selected = false;
  });
  showToast("A student can have a maximum of 3 teachers.");
}

async function ensureEnrollmentTeachers() {
  if (!enrollmentTeachers.length) {
    const data = await api("/api/teachers");
    enrollmentTeachers = data.teachers;
  }
  return enrollmentTeachers;
}

function renderTeacherOptions(select, teachers, selectedIds = []) {
  const selected = new Set(selectedIds.map(Number));
  select.innerHTML = teachers.map((teacher) => (
    `<option value="${teacher.id}" ${selected.has(Number(teacher.id)) ? "selected" : ""}>${escapeHtml(teacher.name)} - ${escapeHtml(teacher.instrument)}</option>`
  )).join("");
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
        <a class="row-action" href="${liveClassroomUrl(sessionRoomName(session), session.student_id)}" target="_blank" rel="noopener">Join Google Meet</a>
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
        <td class="row-actions">
          <button class="row-action open-student" data-student-id="${student.id}">Open 360°</button>
          ${canRemoveStudents() ? `
            <button
              class="row-action danger remove-student"
              data-student-id="${student.id}"
              data-student-name="${escapeHtml(student.name)}"
            >Remove</button>
          ` : ""}
        </td>
      </tr>
    `).join("")
    : '<tr><td colspan="8"><div class="empty-state">No students match these filters.</div></td></tr>';
}

async function removeStudent(button) {
  if (!canRemoveStudents()) return;
  const studentId = Number(button.dataset.studentId);
  const name = button.dataset.studentName || "this student";
  const confirmed = window.confirm(`Remove ${name}?\n\nThis will stop student login and hide the student from active lists. Practice history stays saved for records.`);
  if (!confirmed) return;
  button.disabled = true;
  try {
    await api(`/api/students/${studentId}`, {
      method: "DELETE",
      body: "{}"
    });
    adminStudents = [];
    await Promise.all([loadStudents(), loadDashboard()]);
    if (document.querySelector("#admin-view-student-detail")?.classList.contains("is-active")) {
      navigateAdmin("students");
    }
    showToast(`${name} removed from active students.`);
  } catch (error) {
    showToast(error.message);
    button.disabled = false;
  }
}

async function openCreateStudent() {
  const error = document.querySelector("#create-student-error");
  error.hidden = true;
  await ensureEnrollmentTeachers();
  if (!enrollmentTeachers.length) {
    showToast("A Super Admin must create a teacher before adding students.");
    return;
  }
  renderEnrollmentTeachers();
  document.querySelector("#create-student-start").value = new Date().toISOString().slice(0, 10);
  openAdminModal("#create-student-modal");
}

function renderEnrollmentTeachers() {
  const instrument = document.querySelector("#create-student-instrument").value;
  const matchingTeachers = enrollmentTeachers.filter((teacher) => teacher.instrument === instrument);
  const select = document.querySelector("#create-student-teacher");
  renderTeacherOptions(select, matchingTeachers);
  if (select.options[0]) select.options[0].selected = true;
}

async function createStudent(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = document.querySelector("#create-student-error");
  const submitButton = form.querySelector("button[type='submit']");
  error.hidden = true;
  submitButton.disabled = true;
  try {
    const teacherIds = selectedTeacherIds(document.querySelector("#create-student-teacher"));
    await api("/api/students", {
      method: "POST",
      body: JSON.stringify({
        name: document.querySelector("#create-student-name").value.trim(),
        email: document.querySelector("#create-student-email").value.trim(),
        ageGroup: document.querySelector("#create-student-age").value,
        instrument: document.querySelector("#create-student-instrument").value,
        goal: document.querySelector("#create-student-goal").value.trim(),
        teacherId: teacherIds[0],
        teacherIds,
        courseStartDate: document.querySelector("#create-student-start").value,
        parentName: document.querySelector("#create-parent-name").value.trim(),
        parentEmail: document.querySelector("#create-parent-email").value.trim()
      })
    });
    form.reset();
    closeAdminModal("#create-student-modal");
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

function canRemoveStudents() {
  return ["super_admin", "academic_head"].includes(adminUser?.role);
}

function canManageTeacherAssignments() {
  return ["super_admin", "academic_head"].includes(adminUser?.role);
}

function canRemoveStaff() {
  return adminUser?.role === "super_admin";
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
          ${canRemoveStaff() && Number(member.id) !== Number(adminUser?.userId) ? `
            <button
              class="row-action danger remove-staff"
              data-staff-id="${member.id}"
              data-staff-name="${escapeHtml(member.name)}"
              data-staff-role="${escapeHtml(roleLabel(member.role))}"
            >Remove</button>
          ` : ""}
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
  openAdminModal("#create-staff-modal");
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
    closeAdminModal("#create-staff-modal");
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

async function removeStaff(button) {
  if (!canRemoveStaff()) return;
  const staffId = Number(button.dataset.staffId);
  const name = button.dataset.staffName || "this staff account";
  const role = button.dataset.staffRole || "staff";
  const confirmed = window.confirm(`Remove ${name} (${role})?\n\nThis will remove portal access and sign them out. Teachers must have zero assigned active students before removal.`);
  if (!confirmed) return;
  button.disabled = true;
  try {
    await api(`/api/staff/${staffId}`, {
      method: "DELETE",
      body: "{}"
    });
    await loadStaff();
    enrollmentTeachers = [];
    adminStudents = [];
    showToast(`${name} removed from staff access.`);
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
        <td>
          <div class="session-actions">
            <a class="row-action" href="${liveClassroomUrl(sessionRoomName(session), session.student_id)}" target="_blank" rel="noopener">Join Google Meet</a>
            ${adminUser?.role === "operations" ? "" : `<button class="row-action edit-session" data-session-id="${session.id}">Edit</button>`}
          </div>
        </td>
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
  document.querySelector("#session-room").value = session?.meeting_room || defaultSessionMeetLink();
  document.querySelector("#session-notes").value = session?.notes || "";
  openAdminModal("#session-modal");
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
    closeAdminModal("#session-modal");
    await Promise.all([loadSessions(), loadDashboard()]);
    showToast(sessionId ? "Live session updated." : "Live session added.");
  } catch (saveError) {
    error.textContent = saveError.message;
    error.hidden = false;
  } finally {
    submitButton.disabled = false;
  }
}

async function loadCoursePlanStudents(preferredStudentId = 0) {
  const students = await loadEditorStudents();
  const select = document.querySelector("#course-student-select");
  const previousId = Number(select.value || 0);
  const desiredId = Number(preferredStudentId || pendingCoursePlanFocus?.studentId || previousId || 0);
  select.innerHTML = students.map((student) => (
    `<option value="${student.id}">${escapeHtml(student.name)} - ${escapeHtml(student.instrument)}</option>`
  )).join("");
  if (!students.length) {
    document.querySelector("#course-plan-form").hidden = true;
    return;
  }
  document.querySelector("#course-plan-form").hidden = false;
  select.value = students.some((student) => Number(student.id) === desiredId) ? desiredId : students[0].id;
  await loadCoursePlan(Number(select.value));
}

async function loadCoursePlan(studentId) {
  const data = await api(`/api/students/${studentId}/course-plan`);
  activeCoursePlan = data.coursePlan;
  document.querySelector("#course-title").value = activeCoursePlan.course_title;
  document.querySelector("#course-total-weeks").value = activeCoursePlan.total_weeks;
  document.querySelector("#course-practice-minutes").value = activeCoursePlan.practice_minutes;
  document.querySelector("#course-morning-required").checked = true;
  document.querySelector("#course-evening-required").checked = false;
  renderCourseWeekEditor();
  focusPendingCoursePlanField();
}

function currentCourseWeek(student, coursePlan) {
  const totalWeeks = Number(coursePlan?.total_weeks || coursePlan?.totalWeeks || 12);
  return Math.max(1, Math.min(totalWeeks, Number(student.current_week || 1)));
}

function courseWeekByNumber(coursePlan, weekNumber) {
  const weeks = coursePlan?.weeks || [];
  return weeks.find((week) => Number(week.week_number || week.weekNumber) === Number(weekNumber)) ||
    weeks[weekNumber - 1] ||
    {};
}

function studentWeekNotesSummary(student, coursePlan) {
  const weekNumber = currentCourseWeek(student, coursePlan);
  const week = courseWeekByNumber(coursePlan, weekNumber);
  return {
    weekNumber,
    goal: week.weekly_goal || week.weeklyGoal || week.milestone || week.title || "No weekly goal added yet.",
    notes: week.teacher_notes || week.teacherNotes || ""
  };
}

function focusPendingCoursePlanField() {
  if (!pendingCoursePlanFocus) return;
  const selectedStudentId = Number(document.querySelector("#course-student-select")?.value || 0);
  if (selectedStudentId !== Number(pendingCoursePlanFocus.studentId)) return;
  const weekNumber = Number(pendingCoursePlanFocus.weekNumber || 1);
  const card = document.querySelector(`[data-course-week="${weekNumber}"]`);
  const field = card?.querySelector('[data-week-field="teacherNotes"]');
  if (!field) return;
  card.classList.add("is-highlighted");
  field.focus();
  field.scrollIntoView({ behavior: "smooth", block: "center" });
  showToast(`Add notes for Week ${weekNumber}, then save the student course plan.`);
  window.setTimeout(() => card.classList.remove("is-highlighted"), 3600);
  pendingCoursePlanFocus = null;
}

function openCourseNotesEditor(studentId, weekNumber) {
  pendingCoursePlanFocus = { studentId, weekNumber };
  navigateAdmin("courses");
}

function renderCourseWeekEditor() {
  if (!activeCoursePlan) return;
  const totalWeeks = Math.max(1, Math.min(24, Number(document.querySelector("#course-total-weeks").value || 12)));
  const weeks = Array.from({ length: totalWeeks }, (_, index) => activeCoursePlan.weeks?.[index] || {
    title: `Week ${index + 1}`,
    focus: "",
    weekly_goal: "",
    target_pods: 4,
    milestone: "",
    lessons: [],
    practice_instructions: "",
    teacher_notes: ""
  });
  document.querySelector("#course-week-editor").innerHTML = weeks.map((week, index) => `
    <article class="course-week-card" data-course-week="${index + 1}">
      <strong>Week ${index + 1}</strong>
      <label>
        Week title
        <input data-week-field="title" value="${escapeHtml(week.title || "")}" required>
      </label>
      <label>
        Week goal shown on student dashboard
        <textarea data-week-field="weeklyGoal" rows="2">${escapeHtml(week.weekly_goal || week.weeklyGoal || week.milestone || "")}</textarea>
      </label>
      <label>
        Target daily check-ins this week
        <input data-week-field="targetPods" type="number" min="1" max="28" value="${escapeHtml(week.target_pods || week.targetPods || 4)}">
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
      <label>
        Notes box for student
        <textarea data-week-field="teacherNotes" rows="3" placeholder="Example: Slow chord changes today. Keep wrist relaxed.">${escapeHtml(week.teacher_notes || week.teacherNotes || "")}</textarea>
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
    weeklyGoal: card.querySelector('[data-week-field="weeklyGoal"]').value.trim(),
    targetPods: Number(card.querySelector('[data-week-field="targetPods"]').value || 4),
    focus: card.querySelector('[data-week-field="focus"]').value.trim(),
    milestone: card.querySelector('[data-week-field="milestone"]').value.trim(),
    lessons: card.querySelector('[data-week-field="lessons"]').value.split("\n").map((item) => item.trim()).filter(Boolean),
    practiceInstructions: card.querySelector('[data-week-field="practiceInstructions"]').value.trim(),
    teacherNotes: card.querySelector('[data-week-field="teacherNotes"]').value.trim()
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
  openAdminModal("#reset-password-modal");
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
    closeAdminModal("#reset-password-modal");
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
  if (canManageTeacherAssignments()) await ensureEnrollmentTeachers();
  const student = data.student;
  const assignedTeacherIds = teacherIdListFromValue(student.teacher_ids || student.teacher_id);
  const notesSummary = studentWeekNotesSummary(student, data.coursePlan);
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

  document.querySelector("#student-page-content").innerHTML = `
    <header class="student-modal-header">
      <div class="student-modal-heading">
        <span class="table-avatar">${initials(student.name)}</span>
        <div>
          <h2>${escapeHtml(student.name)}</h2>
          <p>${escapeHtml(student.instrument)} · Week ${student.current_week} of 12 · Teacher ${escapeHtml(student.teacher_name)}</p>
        </div>
      </div>
      <div class="student-header-actions">
        <div class="large-score ${escapeHtml(student.analysis_status)}">${Math.round(student.overall_score || 0)}</div>
        ${canRemoveStudents() ? `
          <button
            class="admin-button danger remove-student"
            data-student-id="${student.id}"
            data-student-name="${escapeHtml(student.name)}"
            type="button"
          >Remove student</button>
        ` : ""}
      </div>
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
          <div class="detail-list-row"><span>Teachers</span><strong>${escapeHtml(student.teacher_name || "Not assigned")}</strong></div>
          <div class="detail-list-row"><span>Age group</span><strong>${escapeHtml(student.age_group)}</strong></div>
          <div class="detail-list-row"><span>Parent</span><strong>${escapeHtml(student.parent_name || "Not linked")}</strong></div>
          <div class="detail-list-row"><span>Course start</span><strong>${escapeHtml(student.course_start_date)}</strong></div>
        </div>
      </section>
      <section class="detail-block teacher-notes-detail">
        <div class="detail-block-header">
          <div>
            <h3>Teacher notes for student</h3>
            <p class="field-hint">This note appears on the student's dashboard for Week ${notesSummary.weekNumber}.</p>
          </div>
          ${adminUser?.role === "operations" ? "" : `<button
            class="admin-button primary edit-student-notes"
            data-student-id="${student.id}"
            data-week-number="${notesSummary.weekNumber}"
            type="button"
          >Edit week goal and notes</button>`}
        </div>
        <div class="teacher-notes-preview">
          <span>Week ${notesSummary.weekNumber} goal</span>
          <strong>${escapeHtml(notesSummary.goal)}</strong>
          <span>Visible student note</span>
          <p>${escapeHtml(notesSummary.notes || "No teacher note added yet. Click edit to add one for this student.")}</p>
        </div>
      </section>
      ${canManageTeacherAssignments() ? `<section class="detail-block teacher-assignment-block">
        <h3>Teacher assignment</h3>
        <p class="field-hint">Choose up to 3 teachers. The first selected teacher stays primary for reviews and live sessions.</p>
        <select class="teacher-assignment-select" data-student-teacher-select="${student.id}" multiple size="5">
          ${enrollmentTeachers.map((teacher) => `
            <option value="${teacher.id}" ${assignedTeacherIds.includes(Number(teacher.id)) ? "selected" : ""}>${escapeHtml(teacher.name)} - ${escapeHtml(teacher.instrument)}</option>
          `).join("")}
        </select>
        <button class="admin-button primary save-student-teachers" data-student-id="${student.id}" type="button">Save teachers</button>
      </section>` : ""}
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
  navigateAdmin("student-detail");
}

async function saveStudentTeachers(studentId) {
  const select = document.querySelector(`[data-student-teacher-select="${studentId}"]`);
  if (!select) return;
  limitTeacherSelection(select);
  const teacherIds = selectedTeacherIds(select);
  if (!teacherIds.length) {
    showToast("Choose at least one teacher.");
    return;
  }
  try {
    await api(`/api/students/${studentId}/teachers`, {
      method: "PATCH",
      body: JSON.stringify({
        primaryTeacherId: teacherIds[0],
        teacherIds
      })
    });
    adminStudents = [];
    await Promise.all([loadStudents(), loadDashboard()]);
    await openStudent(studentId);
    showToast("Teacher assignment saved.");
  } catch (error) {
    showToast(error.message);
  }
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

function activityLabel(type) {
  return {
    practice_review: "Review",
    journey: "Journey",
    milestone: "Milestone",
    attendance: "Attendance",
    live_session: "Live session"
  }[type] || "Activity";
}

function renderActivityLog() {
  const type = document.querySelector("#activity-type-filter")?.value || "all";
  const search = document.querySelector("#activity-search")?.value.trim().toLowerCase() || "";
  const entries = adminActivityEntries.filter((entry) => {
    if (type !== "all" && entry.activity_type !== type) return false;
    if (!search) return true;
    return [entry.actor_name, entry.student_name, entry.action, entry.detail, entry.actor_role]
      .some((value) => String(value || "").toLowerCase().includes(search));
  });
  document.querySelector("#activity-log-list").innerHTML = entries.length
    ? entries.map((entry) => `
      <article class="activity-log-card">
        <span class="activity-type-icon ${escapeHtml(entry.activity_type)}">${escapeHtml(activityLabel(entry.activity_type).slice(0, 1))}</span>
        <div class="activity-log-copy">
          <div class="activity-log-heading">
            <strong>${escapeHtml(entry.action)}</strong>
            <span>${escapeHtml(activityLabel(entry.activity_type))}</span>
          </div>
          <p><b>${escapeHtml(entry.actor_name || "System")}</b> (${escapeHtml(String(entry.actor_role || "system").replaceAll("_", " "))}) · ${escapeHtml(entry.student_name || "School-wide")}${entry.week_number ? ` · Week ${Number(entry.week_number)}` : ""}</p>
          ${entry.detail ? `<small>${escapeHtml(entry.detail)}</small>` : ""}
        </div>
        <time datetime="${escapeHtml(entry.created_at)}">${formatDateTime(entry.created_at)}</time>
      </article>
    `).join("")
    : '<div class="empty-state">No activity matches these filters.</div>';
}

async function loadActivityLog() {
  const data = await api("/api/admin/activity-log?limit=150");
  adminActivityEntries = data.entries || [];
  document.querySelector("#activity-total").textContent = data.summary?.total || 0;
  document.querySelector("#activity-reviews").textContent = data.summary?.reviews || 0;
  document.querySelector("#activity-teachers").textContent = data.summary?.teachers || 0;
  document.querySelector("#activity-students").textContent = data.summary?.students || 0;
  renderActivityLog();
}

async function openReview(button) {
  document.querySelector("#review-submission-id").value = button.dataset.submissionId;
  document.querySelector("#review-modal-title").textContent = `${button.dataset.studentName}'s ${button.dataset.period} practice`;
  document.querySelector("#review-modal-subtitle").textContent = `Week ${button.dataset.week} submission`;
  document.querySelector("#review-file-name").textContent = button.dataset.fileName;
  const player = document.querySelector("#review-video-player");
  const frame = document.querySelector("#review-video-frame");
  const icon = document.querySelector(".review-video-placeholder > span");
  const message = document.querySelector("#review-video-message");
  if (player) {
    player.hidden = true;
    player.removeAttribute("src");
  }
  if (frame) {
    frame.hidden = true;
    frame.removeAttribute("src");
  }
  if (icon) icon.hidden = false;
  message.textContent = "Loading private practice video...";
  document.querySelector("#review-help-call").checked = false;
  navigateAdmin("review-detail");
  try {
    const access = await api(`/api/reviews/${button.dataset.submissionId}/video-access`);
    if (access.embedUrl && frame) {
      frame.src = access.embedUrl;
      frame.hidden = false;
      if (icon) icon.hidden = true;
      message.textContent = "Google Drive preview is available inside this review.";
    } else if (access.embedUrl) {
      message.textContent = `Video preview is ready. Open this Drive preview link in a new tab: ${access.embedUrl}`;
    } else if (access.playbackUrl && player) {
      player.src = access.playbackUrl;
      player.hidden = false;
      if (icon) icon.hidden = true;
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
  showToast("Review submitted and student analysis updated.");
  await Promise.all([loadReviews(), loadDashboard()]);
  navigateAdmin("reviews");
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
          ${adminUser?.role === "operations" ? "" : `<button class="row-action resolve-alert" data-alert-id="${alert.id}">Resolve</button>`}
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

function journeyCanAdmin() {
  return ["super_admin", "academic_head"].includes(adminUser?.role);
}

function journeyCanEdit() {
  return ["super_admin", "academic_head", "teacher"].includes(adminUser?.role);
}

function weekdayOptions(selected = 1) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    .map((day, index) => `<option value="${index}" ${Number(selected) === index ? "selected" : ""}>${day}</option>`).join("");
}

function milestoneStatusOptions(selected = "not_started") {
  return [
    ["not_started", "Not started"], ["learning", "Learning"], ["developing", "Developing"],
    ["achieved", "Achieved"], ["teacher_approved", "Teacher approved"]
  ].map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`).join("");
}

function liveStatusOptions(selected = "upcoming") {
  return ["upcoming", "present", "partial", "absent", "excused", "cancelled", "rescheduled"]
    .map((value) => `<option value="${value}" ${selected === value ? "selected" : ""}>${value.replaceAll("_", " ")}</option>`).join("");
}

function practiceStatusOptions(selected = "pending") {
  return ["pending", "present", "late", "absent", "excused", "not_scheduled", "processing", "upload_issue"]
    .map((value) => `<option value="${value}" ${selected === value ? "selected" : ""}>${value.replaceAll("_", " ")}</option>`).join("");
}

function journeyTeacherOptions(selectedId = 0) {
  return enrollmentTeachers.map((teacher) => `<option value="${teacher.id}" ${Number(selectedId) === Number(teacher.id) ? "selected" : ""}>${escapeHtml(teacher.name)} - ${escapeHtml(teacher.instrument)}</option>`).join("");
}

function renderConfirmationBuilders(student) {
  document.querySelector("#journey-confirmation-slots").innerHTML = [
    { weekday: 1, time: "17:00" }, { weekday: 3, time: "17:00" }, { weekday: 5, time: "17:00" }
  ].map((slot, index) => `
    <article class="journey-slot-card" data-confirmation-slot>
      <strong>Session ${index + 1}</strong>
      <label>Teacher<select data-field="teacherId">${journeyTeacherOptions(student.assigned_teacher_id)}</select></label>
      <label>Weekday<select data-field="weekday">${weekdayOptions(slot.weekday)}</select></label>
      <label>Start time<input data-field="startTime" type="time" value="${slot.time}" required></label>
      <label>Duration<input data-field="durationMinutes" type="number" min="15" max="180" value="45" required></label>
      <label>Google Meet link<input data-field="meetingLink" type="url" value="${standardGoogleMeetLink(student.id)}" required></label>
    </article>
  `).join("");
  const defaults = [
    ["Rhythm", 35], ["Technique", 35], ["Performance confidence", 30]
  ];
  document.querySelector("#journey-confirmation-milestones").innerHTML = defaults.map(([name, weight]) => `
    <article class="journey-milestone-card" data-confirmation-milestone>
      <label>Milestone<input data-field="name" value="${escapeHtml(name)}" required></label>
      <label>Weight<input data-field="weight" type="number" min="1" max="100" value="${weight}" required></label>
      <label>Status<select data-field="status">${milestoneStatusOptions()}</select></label>
      <label>Teacher score<input data-field="score" type="number" min="0" max="100" value="0" required></label>
      <label>Existing progress note<textarea data-field="feedback" rows="2">Pending baseline assessment</textarea></label>
    </article>
  `).join("");
}

function updateConfirmationTargetDate() {
  const start = document.querySelector("#journey-start-date").value;
  const durationValue = document.querySelector("#journey-duration").value;
  const duration = durationValue === "custom"
    ? Number(document.querySelector("#journey-custom-duration").value)
    : Number(durationValue);
  if (!start || !duration) return;
  const target = new Date(`${start}T00:00:00Z`);
  target.setUTCDate(target.getUTCDate() + duration - 1);
  document.querySelector("#journey-target-date").value = target.toISOString().slice(0, 10);
}

async function loadJourneyControl(selectedStudentId = activeJourneyStudentId) {
  const [confirmations, approvals] = await Promise.all([
    api("/api/journey/confirmations?status=all"), api("/api/week-approvals")
  ]);
  journeyStudents = confirmations.students;
  journeyApprovalData = approvals;
  const summary = approvals.summary || {};
  const pending = journeyStudents.filter((student) => student.confirmation_status === "pending_confirmation").length;
  document.querySelector("#journey-pending-count").textContent = pending;
  document.querySelector("#journey-waiting-count").textContent = summary.waiting || 0;
  document.querySelector("#journey-risk-count").textContent = summary.atRisk || 0;
  document.querySelector("#journey-overdue-count").textContent = summary.overdue || 0;
  document.querySelector("#nav-journey-count").textContent = pending + Number(summary.waiting || 0);
  const selector = document.querySelector("#journey-student-select");
  selector.innerHTML = '<option value="">Choose a student</option>' + journeyStudents.map((student) => `
    <option value="${student.id}" ${Number(selectedStudentId) === Number(student.id) ? "selected" : ""}>
      ${escapeHtml(student.name)} - ${student.confirmation_status === "confirmed" ? `Week ${student.current_week}` : "Pending confirmation"}
    </option>
  `).join("");
  document.querySelector("#journey-role-note").textContent = adminUser?.role === "operations"
    ? "Operations view is read-only. Academic changes remain locked."
    : adminUser?.role === "teacher" ? "You can manage only students assigned to you." : "Admin controls include confirmation, program dates and manual overrides.";
  renderJourneyApprovalQueue(approvals.students || []);
  if (selectedStudentId) await openJourneyStudent(Number(selectedStudentId));
}

function renderJourneyApprovalQueue(rows) {
  const list = document.querySelector("#journey-approval-list");
  list.innerHTML = rows.length ? rows.map((row) => `
    <button class="journey-queue-card open-journey-workspace" data-student-id="${row.student_id}" data-week="${row.week_number}" type="button">
      <span class="journey-queue-status ${escapeHtml(row.status)}">${escapeHtml(row.status.replaceAll("_", " "))}</span>
      <strong>${escapeHtml(row.student_name)} - Week ${row.week_number}</strong>
      <small>${Math.round(row.readiness || 0)}% ready / ${escapeHtml(row.countdown?.message || "Target pending")}</small>
      <span>${row.days_waiting || 0} days waiting${row.risk ? " / needs attention" : ""}</span>
    </button>
  `).join("") : '<div class="empty-state">No students are waiting for weekly action.</div>';
}

async function openJourneyStudent(studentId, requestedWeek = 0) {
  activeJourneyStudentId = studentId;
  const student = journeyStudents.find((item) => Number(item.id) === studentId);
  if (!student) return;
  document.querySelector("#journey-student-select").value = String(studentId);
  const confirmationPanel = document.querySelector("#journey-confirmation-panel");
  const workspacePanel = document.querySelector("#journey-workspace-panel");
  if (student.confirmation_status !== "confirmed") {
    workspacePanel.hidden = true;
    confirmationPanel.hidden = !journeyCanAdmin();
    if (!journeyCanAdmin()) {
      document.querySelector("#journey-role-note").textContent = "This student is pending admin confirmation. Teacher actions remain locked.";
      return;
    }
    await loadTeachers();
    document.querySelector("#journey-primary-teacher").innerHTML = journeyTeacherOptions(student.assigned_teacher_id);
    document.querySelector("#journey-course-template").value = `${student.instrument} performance plan`;
    document.querySelector("#journey-start-date").value = student.course_start_date || new Date().toISOString().slice(0, 10);
    document.querySelector("#journey-active-week").value = student.proposed_current_week || student.current_week || 1;
    document.querySelector("#journey-completed-weeks").value = student.current_week > 1
      ? Array.from({ length: student.current_week - 1 }, (_, index) => index + 1).join(", ") : "";
    renderConfirmationBuilders(student);
    updateConfirmationTargetDate();
    return;
  }
  confirmationPanel.hidden = true;
  const week = requestedWeek || student.current_week || student.proposed_current_week || 1;
  activeJourneyWeek = week;
  const workspace = await api(`/api/students/${studentId}/weeks/${week}/workspace`);
  workspacePanel.hidden = false;
  await renderJourneyWorkspace(workspace);
}

async function submitJourneyConfirmation(event) {
  event.preventDefault();
  const error = document.querySelector("#journey-confirmation-error");
  error.hidden = true;
  const durationSelection = document.querySelector("#journey-duration").value;
  const durationDays = durationSelection === "custom"
    ? Number(document.querySelector("#journey-custom-duration").value) : Number(durationSelection);
  const completedWeeks = document.querySelector("#journey-completed-weeks").value.split(",")
    .map((value) => Number(value.trim())).filter(Boolean);
  const sessionSlots = [...document.querySelectorAll("[data-confirmation-slot]")].map((card) => ({
    teacherId: Number(card.querySelector('[data-field="teacherId"]').value),
    weekday: Number(card.querySelector('[data-field="weekday"]').value),
    startTime: card.querySelector('[data-field="startTime"]').value,
    durationMinutes: Number(card.querySelector('[data-field="durationMinutes"]').value),
    meetingLink: card.querySelector('[data-field="meetingLink"]').value.trim()
  }));
  const existingMilestones = [...document.querySelectorAll("[data-confirmation-milestone]")].map((card) => ({
    name: card.querySelector('[data-field="name"]').value.trim(),
    weight: Number(card.querySelector('[data-field="weight"]').value),
    status: card.querySelector('[data-field="status"]').value,
    score: Number(card.querySelector('[data-field="score"]').value),
    feedback: card.querySelector('[data-field="feedback"]').value.trim()
  }));
  try {
    await api(`/api/students/${activeJourneyStudentId}/journey/confirm`, {
      method: "POST",
      body: JSON.stringify({
        teacherId: Number(document.querySelector("#journey-primary-teacher").value),
        courseTemplateName: document.querySelector("#journey-course-template").value.trim(),
        programStartDate: document.querySelector("#journey-start-date").value,
        durationDays,
        customDuration: durationSelection === "custom",
        targetPerformanceDate: document.querySelector("#journey-target-date").value,
        activeWeek: Number(document.querySelector("#journey-active-week").value),
        completedWeeks,
        historicalCompletionReason: document.querySelector("#journey-history-reason").value.trim(),
        existingMilestones,
        sessionSlots,
        dailyPracticeDeadline: document.querySelector("#journey-practice-deadline").value,
        weeklyRestDay: Number(document.querySelector("#journey-rest-day").value),
        bufferMinutes: Number(document.querySelector("#journey-buffer").value),
        courseState: document.querySelector("#journey-course-state").value,
        pauseReason: document.querySelector("#journey-pause-reason").value.trim(),
        confirmationNotes: document.querySelector("#journey-confirmation-notes").value.trim()
      })
    });
    showToast("Student journey confirmed. Teacher controls are now active.");
    await loadJourneyControl(activeJourneyStudentId);
  } catch (submitError) {
    error.textContent = submitError.message;
    error.hidden = false;
  }
}

async function renderJourneyWorkspace(data) {
  const content = document.querySelector("#journey-workspace-content");
  const readOnly = !journeyCanEdit() || data.permissions?.canEdit === false;
  const disabled = readOnly ? "disabled" : "";
  const requirements = data.requirements || [];
  const slotsData = await api(`/api/students/${data.student.id}/recurring-sessions`);
  const combinedAudit = [
    ...(data.audit || []).map((entry) => ({ ...entry, label: entry.action, detail: entry.reason })),
    ...(data.attendanceAudit || []).map((entry) => ({ ...entry, label: `${entry.attendance_type} attendance: ${entry.previous_status || "new"} to ${entry.new_status}`, detail: entry.reason })),
    ...(data.scheduleAudit || []).map((entry) => ({ ...entry, label: entry.change_type, detail: entry.reason })),
    ...(data.milestoneAudit || []).map((entry) => ({ ...entry, label: `${entry.milestone_name}: ${entry.previous_status || "new"} to ${entry.new_status}`, detail: entry.feedback }))
  ].sort((first, second) => new Date(second.created_at) - new Date(first.created_at));
  if (journeyCanAdmin() && !enrollmentTeachers.length) await loadTeachers();
  content.innerHTML = `
    <div class="journey-workspace-hero">
      <div><p class="eyebrow">WEEKLY APPROVAL WORKSPACE</p><h1>${escapeHtml(data.student.name)} - Week ${data.progress?.week_number || activeJourneyWeek}</h1><p>${escapeHtml(data.countdown?.message || "Performance date pending")}</p></div>
      <div class="readiness-orb"><strong>${Math.round(data.readiness?.readiness || 0)}%</strong><span>performance readiness</span></div>
    </div>
    ${readOnly ? '<div class="journey-readonly-banner">View-only access. Academic controls are disabled.</div>' : ""}
    <div class="journey-summary-grid">
      <article><span>Status</span><strong>${escapeHtml((data.progress?.status || "pending").replaceAll("_", " "))}</strong></article>
      <article><span>Days waiting</span><strong>${data.daysWaiting || 0}</strong></article>
      <article><span>Live classes</span><strong>${data.liveSessions.filter((session) => ["present", "partial"].includes(session.attendance_status)).length}/3</strong></article>
      <article><span>Practice days</span><strong>${data.practiceAttendance.filter((day) => ["present", "late"].includes(day.status)).length}/${requirements.find((item) => item.requirement_type === "practice_mission")?.required_count || 6}</strong></article>
    </div>
    <div class="journey-two-column">
      <section class="journey-subpanel"><div class="panel-heading"><div><p class="eyebrow">REQUIREMENTS</p><h2>Week evidence</h2></div></div>
        <div class="journey-requirement-list">${requirements.map((item) => `
          <article><div><strong>${escapeHtml(item.label)}</strong><small>${item.completed_count}/${item.required_count}${item.excused_at ? " / excused" : ""}</small></div>
          ${!readOnly && !item.excused_at ? `<button class="row-action excuse-journey-requirement" data-id="${item.id}">Excuse</button>` : ""}</article>
        `).join("") || '<div class="empty-state">No requirements configured.</div>'}</div>
      </section>
      <section class="journey-subpanel"><div class="panel-heading"><div><p class="eyebrow">MISSIONS</p><h2>Assigned work</h2></div></div>
        ${(data.missions || []).map((mission) => `<article class="journey-note-card"><strong>${escapeHtml(mission.title)}</strong><p>${escapeHtml(mission.instruction)}</p></article>`).join("") || '<div class="empty-state">No extra missions assigned.</div>'}
      </section>
    </div>
    <section class="journey-subpanel"><div class="panel-heading"><div><p class="eyebrow">ONE-TO-ONE SESSIONS</p><h2>Live-class attendance</h2></div></div>
      <div class="journey-card-grid">${(data.liveSessions || []).map((session) => `
        <form class="journey-action-card live-attendance-form" data-session-id="${session.id}">
          <strong>${escapeHtml(session.topic)}</strong><small>${formatDateTime(session.scheduled_at)} / ${escapeHtml(session.teacher_name)}</small>
          <label>Status<select name="status" ${disabled}>${liveStatusOptions(session.attendance_status || "upcoming")}</select></label>
          <label>Attended minutes<input name="attendedMinutes" type="number" min="0" max="${session.duration_minutes}" value="${session.attended_minutes || 0}" ${disabled}></label>
          <label>Reason<input name="reason" value="${escapeHtml(session.attendance_reason || "Attendance checked by teacher")}" ${disabled}></label>
          ${readOnly ? "" : '<button class="admin-button secondary" type="submit">Save attendance</button>'}
          ${readOnly ? "" : `<div class="journey-card-actions"><button class="row-action journey-session-action" data-session-action="reschedule" data-session-id="${session.id}" data-duration="${session.duration_minutes}" type="button">One-time reschedule</button><button class="row-action journey-session-action" data-session-action="makeup" data-session-id="${session.id}" data-duration="${session.duration_minutes}" type="button">Makeup</button><button class="row-action danger journey-session-action" data-session-action="cancel" data-session-id="${session.id}" type="button">Cancel</button></div>`}
        </form>`).join("") || '<div class="empty-state">No individual sessions linked to this course week yet.</div>'}</div>
    </section>
    <section class="journey-subpanel"><div class="panel-heading"><div><p class="eyebrow">PRACTICE EVIDENCE</p><h2>Videos and teacher feedback</h2></div></div>
      <div class="journey-card-grid">${(data.submissions || []).map((submission) => `<article class="journey-action-card"><strong>${escapeHtml(submission.period)} practice</strong><small>${escapeHtml(submission.file_name)} / ${formatDateTime(submission.uploaded_at)}</small><span class="journey-queue-status ${escapeHtml(submission.review_status)}">${escapeHtml(submission.review_status)}${submission.feedback_id ? " / feedback saved" : ""}</span>${submission.review_status === "pending" && adminUser?.role !== "operations" ? `<button class="admin-button primary open-review" data-submission-id="${submission.id}" data-student-name="${escapeHtml(data.student.name)}" data-period="${escapeHtml(submission.period)}" data-file-name="${escapeHtml(submission.file_name)}" data-week="${submission.course_week}" type="button">Open video review</button>` : ""}</article>`).join("") || '<div class="empty-state">No videos submitted for this week.</div>'}</div>
    </section>
    <section class="journey-subpanel"><div class="panel-heading"><div><p class="eyebrow">DAILY PRACTICE</p><h2>Practice attendance</h2></div></div>
      <div class="journey-card-grid">${(data.practiceAttendance || []).map((day) => `
        <form class="journey-action-card practice-attendance-form" data-date="${day.attendance_date}">
          <strong>${escapeHtml(day.attendance_date)}</strong><label>Status<select name="status" ${disabled}>${practiceStatusOptions(day.status)}</select></label>
          <label>Reason<input name="reason" value="${escapeHtml(day.reason || "Attendance checked by teacher")}" ${disabled}></label>
          ${readOnly ? "" : '<button class="admin-button secondary" type="submit">Save attendance</button>'}
        </form>`).join("") || '<div class="empty-state">No daily practice records for this week.</div>'}</div>
      ${readOnly ? "" : `<form class="journey-inline-form" id="journey-new-practice-attendance"><label>Date<input name="date" type="date" required></label><label>Status<select name="status">${practiceStatusOptions()}</select></label><label>Reason<input name="reason" value="Manual attendance review" required></label><button class="admin-button secondary">Add attendance</button></form>`}
    </section>
    <section class="journey-subpanel"><div class="panel-heading"><div><p class="eyebrow">TEACHER-ASSESSED</p><h2>Performance milestones</h2></div><strong>${Math.round(data.readiness?.calculated || 0)}% calculated</strong></div>
      <div class="journey-milestone-grid">${(data.readiness?.milestones || []).map((milestone) => `
        <form class="journey-milestone-card milestone-assessment-form" data-milestone-id="${milestone.id}">
          <strong>${escapeHtml(milestone.name)}</strong><small>${milestone.weight}% weight / ${milestone.weighted_contribution}% contribution</small>
          <label>Status<select name="status" ${disabled}>${milestoneStatusOptions(milestone.milestone_status || "not_started")}</select></label>
          <label>Teacher score<input name="score" type="number" min="0" max="100" value="${milestone.teacher_score || 0}" ${disabled}></label>
          <label>Feedback<textarea name="feedback" rows="2" ${disabled}>${escapeHtml(milestone.teacher_feedback || "Add an assessment note")}</textarea></label>
          <small>Assessed by ${escapeHtml(milestone.assessed_by_name || "Not assessed")} ${milestone.approved_at ? `/ approved ${formatDateTime(milestone.approved_at)}` : ""}</small>
          ${readOnly ? "" : '<button class="admin-button secondary" type="submit">Save assessment</button>'}
        </form>`).join("") || '<div class="empty-state">No milestones configured.</div>'}</div>
    </section>
    <section class="journey-subpanel"><div class="panel-heading"><div><p class="eyebrow">RECURRING SCHEDULE</p><h2>Three weekly class slots</h2></div></div>
      <form id="journey-recurring-form"><div class="journey-slot-grid">${(slotsData.slots || []).map((slot, index) => `
        <article class="journey-slot-card" data-recurring-slot><strong>Session ${index + 1}</strong>
          <label>Teacher${journeyCanAdmin() ? `<select name="teacherId" ${disabled}>${journeyTeacherOptions(slot.teacher_id)}</select>` : `<input name="teacherId" value="${slot.teacher_id}" type="hidden"><input value="${escapeHtml(slot.teacher_name)}" disabled>`}</label>
          <label>Weekday<select name="weekday" ${disabled}>${weekdayOptions(slot.weekday)}</select></label><label>Start<input name="startTime" type="time" value="${slot.start_time}" ${disabled}></label>
          <label>Minutes<input name="durationMinutes" type="number" min="15" max="180" value="${slot.duration_minutes}" ${disabled}></label><label>Google Meet<input name="meetingLink" value="${escapeHtml(slot.meeting_link)}" ${disabled}></label>
        </article>`).join("")}</div>
        ${readOnly ? "" : '<div class="journey-inline-form"><label>Effective from<input name="effectiveFrom" type="date" required></label><label>Reason<input name="reason" value="Permanent schedule updated with student" required></label><button class="admin-button primary">Save permanent schedule</button></div>'}
      </form>
      <div class="journey-conflicts">${(slotsData.conflicts || []).map((conflict) => `<span>${escapeHtml(conflict.message)}</span>`).join("")}</div>
      ${readOnly ? "" : `<form id="journey-unavailable-form" class="journey-inline-form"><label>Teacher${journeyCanAdmin() ? `<select name="teacherId">${journeyTeacherOptions(slotsData.slots?.[0]?.teacher_id)}</select>` : `<input name="teacherId" type="hidden" value="${slotsData.slots?.[0]?.teacher_id || ""}"><input value="${escapeHtml(slotsData.slots?.[0]?.teacher_name || "Assigned teacher")}" disabled>`}</label><label>Unavailable from<input name="unavailableFrom" type="datetime-local" required></label><label>Unavailable until<input name="unavailableUntil" type="datetime-local" required></label><label>Reason<input name="reason" value="Teacher unavailable period" required></label><button class="admin-button secondary">Add unavailable dates</button></form>`}
    </section>
    <div class="journey-two-column">
      <section class="journey-subpanel"><div class="panel-heading"><div><p class="eyebrow">WEEK SUPPORT</p><h2>Notes and recovery</h2></div></div>
        <form id="journey-support-form" class="stack-form"><label>Extension until<input name="extensionUntil" type="date" value="${escapeHtml(data.progress?.extension_until || "")}" ${disabled}></label>
          <label>Recovery mission<textarea name="recoveryMission" ${disabled}>${escapeHtml(data.progress?.recovery_mission || "")}</textarea></label><label>Private notes<textarea name="privateNotes" ${disabled}>${escapeHtml(data.progress?.teacher_private_notes || "")}</textarea></label>
          <label>Student-visible feedback<textarea name="studentFeedback" ${disabled}>${escapeHtml(data.progress?.student_visible_feedback || "")}</textarea></label><label>Reason<input name="reason" value="Weekly support plan updated" ${disabled}></label>
          ${readOnly ? "" : '<button class="admin-button secondary">Save support plan</button>'}</form>
      </section>
      <section class="journey-subpanel"><div class="panel-heading"><div><p class="eyebrow">WEEK DECISION</p><h2>Teacher approval</h2></div></div>
        <form id="journey-decision-form" class="stack-form"><label>Skills achieved<textarea name="skillsAchieved" ${disabled}></textarea></label><label>Skills developing<textarea name="skillsDeveloping" ${disabled}></textarea></label>
          <label>Next focus / student feedback<textarea name="nextFocus" ${disabled}></textarea></label><label>Private notes<textarea name="privateNotes" ${disabled}></textarea></label><label>Decision reason<input name="reason" ${disabled}></label>
          ${readOnly ? "" : '<div class="journey-decision-actions"><button class="admin-button primary" data-week-action="approve" type="button">Approve and unlock next week</button><button class="admin-button secondary" data-week-action="request_revision" type="button">Request another attempt</button><button class="admin-button secondary" data-week-action="keep_in_progress" type="button">Keep in progress</button></div>'}
        </form>
      </section>
    </div>
    ${journeyCanAdmin() ? `<section class="journey-subpanel"><div class="panel-heading"><div><p class="eyebrow">PROGRAM CONTROLS</p><h2>Dates, pause and readiness override</h2></div></div>
      <div class="journey-three-column"><form id="journey-program-form" class="stack-form"><label>Start date<input name="programStartDate" type="date" value="${escapeHtml(data.program?.program_start_date || "")}"></label><label>Duration days<input name="durationDays" type="number" min="1" max="730" value="${data.program?.duration_days || 45}"></label><label>Target date<input name="targetPerformanceDate" type="date" value="${escapeHtml(data.program?.target_performance_date || "")}"></label><label>Confirmed show date<input name="confirmedPerformanceDate" type="date" value="${escapeHtml(data.program?.confirmed_performance_date || "")}"></label><label>Reason<input name="reason" value="Program date reviewed by admin"></label><button class="admin-button secondary">Save program dates</button></form>
      <form id="journey-pause-form" class="stack-form"><label>Action date<input name="actionDate" type="date" required></label><label>Reason<input name="reason" value="Approved course schedule change"></label><button class="admin-button secondary" data-program-action="${data.program?.program_status === "paused" ? "resume" : "pause"}" type="button">${data.program?.program_status === "paused" ? "Resume course" : "Pause course"}</button></form>
      <form id="journey-override-form" class="stack-form"><label>Manual readiness value<input name="newValue" type="number" min="0" max="100" value="${Math.round(data.readiness?.readiness || 0)}"></label><label>Written reason<input name="reason" value="Readiness verified through an in-person assessment"></label><button class="admin-button secondary">Save authorized override</button></form></div></section>` : ""}
    <section class="journey-subpanel"><div class="panel-heading"><div><p class="eyebrow">AUDIT HISTORY</p><h2>Who changed what and why</h2></div></div><div class="journey-audit-list">${combinedAudit.map((entry) => `<article><span>${formatDateTime(entry.created_at)}</span><strong>${escapeHtml(String(entry.label || "change").replaceAll("_", " "))}</strong><small>${escapeHtml(entry.actor_name || entry.actor_role)} / ${escapeHtml(entry.detail || "No reason recorded")}</small></article>`).join("") || '<div class="empty-state">No journey audit records yet.</div>'}</div></section>
  `;
}

async function refreshJourneyWorkspace(message = "Journey workspace updated.") {
  await loadJourneyControl(activeJourneyStudentId);
  showToast(message);
}

async function submitWorkspaceForm(form) {
  const studentId = activeJourneyStudentId;
  const week = activeJourneyWeek;
  if (form.matches(".live-attendance-form")) {
    const values = new FormData(form);
    await api(`/api/sessions/${form.dataset.sessionId}/attendance`, { method: "PATCH", body: JSON.stringify(Object.fromEntries(values)) });
  } else if (form.matches(".practice-attendance-form")) {
    const values = Object.fromEntries(new FormData(form));
    values.weekNumber = week;
    await api(`/api/students/${studentId}/practice-attendance/${form.dataset.date}`, { method: "PATCH", body: JSON.stringify(values) });
  } else if (form.id === "journey-new-practice-attendance") {
    const values = Object.fromEntries(new FormData(form));
    await api(`/api/students/${studentId}/practice-attendance/${values.date}`, { method: "PATCH", body: JSON.stringify({ ...values, weekNumber: week }) });
  } else if (form.matches(".milestone-assessment-form")) {
    await api(`/api/students/${studentId}/milestones/${form.dataset.milestoneId}/assessment`, { method: "PATCH", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
  } else if (form.id === "journey-support-form") {
    await api(`/api/students/${studentId}/weeks/${week}/support`, { method: "PATCH", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
  } else if (form.id === "journey-recurring-form") {
    const values = Object.fromEntries(new FormData(form));
    const slots = [...form.querySelectorAll("[data-recurring-slot]")].map((card) => ({
      teacherId: Number(card.querySelector('[name="teacherId"]').value), weekday: Number(card.querySelector('[name="weekday"]').value),
      startTime: card.querySelector('[name="startTime"]').value, durationMinutes: Number(card.querySelector('[name="durationMinutes"]').value), meetingLink: card.querySelector('[name="meetingLink"]').value
    }));
    await api(`/api/students/${studentId}/recurring-sessions`, { method: "PATCH", body: JSON.stringify({ sessionSlots: slots, effectiveFrom: values.effectiveFrom, reason: values.reason }) });
  } else if (form.id === "journey-unavailable-form") {
    const values = Object.fromEntries(new FormData(form));
    values.unavailableFrom = new Date(values.unavailableFrom).toISOString();
    values.unavailableUntil = new Date(values.unavailableUntil).toISOString();
    await api(`/api/teachers/${values.teacherId}/unavailable-periods`, { method: "POST", body: JSON.stringify(values) });
  } else if (form.id === "journey-program-form") {
    const values = Object.fromEntries(new FormData(form));
    values.durationDays = Number(values.durationDays); values.customDuration = ![45, 60, 90].includes(values.durationDays);
    await api(`/api/students/${studentId}/performance-program`, { method: "PATCH", body: JSON.stringify(values) });
  } else if (form.id === "journey-override-form") {
    const values = Object.fromEntries(new FormData(form)); values.newValue = Number(values.newValue);
    await api(`/api/students/${studentId}/readiness-override`, { method: "POST", body: JSON.stringify(values) });
  }
  await refreshJourneyWorkspace();
}

async function submitWeekDecision(action) {
  const values = Object.fromEntries(new FormData(document.querySelector("#journey-decision-form")));
  const body = { action, ...values, studentFeedback: values.nextFocus };
  await api(`/api/students/${activeJourneyStudentId}/weeks/${activeJourneyWeek}/decision`, { method: "POST", body: JSON.stringify(body) });
  await refreshJourneyWorkspace(action === "approve" ? `Great work! Week ${activeJourneyWeek + 1} is now unlocked.` : "Week decision saved.");
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
      await Promise.all([loadBackendHealth(), loadDashboard()]);
    } catch (loginError) {
      error.textContent = loginError.message;
      error.hidden = false;
    }
  });

  document.querySelectorAll("[data-admin-view]").forEach((button) => {
    button.addEventListener("click", () => navigateAdmin(button.dataset.adminView));
  });

  document.querySelector("#admin-brand-home")?.addEventListener("click", () => navigateAdmin("dashboard"));
  document.querySelector("#admin-avatar")?.addEventListener("click", () => navigateAdmin("dashboard"));

  document.querySelector("#refresh-dashboard").addEventListener("click", async () => {
    await loadDashboard();
    showToast("Dashboard refreshed.");
  });
  document.querySelector("#refresh-activity")?.addEventListener("click", async () => {
    await loadActivityLog();
    showToast("Activity log refreshed.");
  });
  document.querySelector("#activity-type-filter")?.addEventListener("change", renderActivityLog);
  document.querySelector("#activity-search")?.addEventListener("input", renderActivityLog);
  document.querySelector("#apply-student-filters").addEventListener("click", loadStudents);
  document.querySelector("#student-search").addEventListener("keydown", (event) => {
    if (event.key === "Enter") loadStudents();
  });
  document.querySelector("#logout-button").addEventListener("click", () => logout());
  document.querySelector("#open-create-student").addEventListener("click", openCreateStudent);
  document.querySelector("#create-student-form").addEventListener("submit", createStudent);
  document.querySelector("#create-student-instrument").addEventListener("change", renderEnrollmentTeachers);
  document.querySelector("#create-student-teacher").addEventListener("change", (event) => limitTeacherSelection(event.currentTarget));
  document.querySelector("#open-create-staff").addEventListener("click", openCreateStaff);
  document.querySelector("#create-staff-form").addEventListener("submit", createStaff);
  document.querySelector("#create-staff-role").addEventListener("change", updateStaffInstrumentField);
  document.querySelector("#open-create-session").addEventListener("click", () => openSessionEditor());
  document.querySelector("#session-student").addEventListener("change", () => {
    const roomInput = document.querySelector("#session-room");
    const current = roomInput.value.trim();
    if (!current || current.includes("/lookup/ots-music-school-student-")) {
      roomInput.value = defaultSessionMeetLink();
    }
  });
  document.querySelector("#session-form").addEventListener("submit", saveSession);
  document.querySelector("#course-student-select").addEventListener("change", (event) => loadCoursePlan(Number(event.target.value)));
  document.querySelector("#course-total-weeks").addEventListener("change", renderCourseWeekEditor);
  document.querySelector("#course-plan-form").addEventListener("submit", saveCoursePlan);
  document.querySelector("#change-password-form").addEventListener("submit", changePassword);
  document.querySelector("#reset-password-form").addEventListener("submit", resetStaffPassword);
  document.querySelector("#review-form").addEventListener("submit", submitReview);
  document.querySelector("#refresh-journey")?.addEventListener("click", () => loadJourneyControl(activeJourneyStudentId));
  document.querySelector("#journey-student-select")?.addEventListener("change", (event) => openJourneyStudent(Number(event.target.value)));
  document.querySelector("#journey-confirmation-form")?.addEventListener("submit", submitJourneyConfirmation);
  document.querySelector("#journey-duration")?.addEventListener("change", (event) => {
    document.querySelector("#journey-custom-duration-label").hidden = event.target.value !== "custom";
    updateConfirmationTargetDate();
  });
  document.querySelector("#journey-start-date")?.addEventListener("change", updateConfirmationTargetDate);
  document.querySelector("#journey-custom-duration")?.addEventListener("input", updateConfirmationTargetDate);
  document.querySelector("#journey-course-state")?.addEventListener("change", (event) => {
    document.querySelector("#journey-pause-reason-label").hidden = event.target.value !== "paused";
  });

  document.querySelectorAll("[data-rating]").forEach((input) => {
    input.addEventListener("input", () => {
      input.parentElement.querySelector("output").textContent = input.value;
    });
  });

  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => closeAdminModal(`#${button.dataset.closeModal}`));
  });

  document.querySelectorAll(".admin-modal").forEach((modal) => {
    modal.addEventListener("close", updateModalLock);
  });

  document.addEventListener("change", (event) => {
    const teacherSelect = event.target.closest(".teacher-assignment-select");
    if (teacherSelect) limitTeacherSelection(teacherSelect);
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target.closest("#journey-workspace-content form");
    if (!form || form.id === "journey-decision-form" || form.id === "journey-pause-form") return;
    event.preventDefault();
    try { await submitWorkspaceForm(form); } catch (error) { showToast(error.message); }
  });

  document.addEventListener("click", async (event) => {
    const studentButton = event.target.closest(".open-student");
    if (studentButton) await openStudent(Number(studentButton.dataset.studentId));

    const saveTeachersButton = event.target.closest(".save-student-teachers");
    if (saveTeachersButton) await saveStudentTeachers(Number(saveTeachersButton.dataset.studentId));

    const notesButton = event.target.closest(".edit-student-notes");
    if (notesButton) openCourseNotesEditor(Number(notesButton.dataset.studentId), Number(notesButton.dataset.weekNumber));

    const removeStudentButton = event.target.closest(".remove-student");
    if (removeStudentButton) await removeStudent(removeStudentButton);

    const reviewButton = event.target.closest(".open-review");
    if (reviewButton) await openReview(reviewButton);

    const resolveButton = event.target.closest(".resolve-alert");
    if (resolveButton) await resolveAlert(Number(resolveButton.dataset.alertId));

    const staffStatusButton = event.target.closest(".toggle-staff-status");
    if (staffStatusButton) await toggleStaffStatus(staffStatusButton);

    const staffPasswordButton = event.target.closest(".reset-staff-password");
    if (staffPasswordButton) openResetPassword(staffPasswordButton);

    const removeStaffButton = event.target.closest(".remove-staff");
    if (removeStaffButton) await removeStaff(removeStaffButton);

    const sessionButton = event.target.closest(".edit-session");
    if (sessionButton) {
      const session = adminSessions.find((item) => Number(item.id) === Number(sessionButton.dataset.sessionId));
      if (session) await openSessionEditor(session);
    }

    const journeyQueueButton = event.target.closest(".open-journey-workspace");
    if (journeyQueueButton) await openJourneyStudent(Number(journeyQueueButton.dataset.studentId), Number(journeyQueueButton.dataset.week));

    const excuseButton = event.target.closest(".excuse-journey-requirement");
    if (excuseButton) {
      const reason = window.prompt("Why is this requirement being excused?");
      if (reason) {
        try {
          await api(`/api/students/${activeJourneyStudentId}/weeks/${activeJourneyWeek}/requirements/${excuseButton.dataset.id}/excuse`, {
            method: "POST", body: JSON.stringify({ reason })
          });
          await refreshJourneyWorkspace("Requirement excused with an audit record.");
        } catch (error) { showToast(error.message); }
      }
    }

    const weekAction = event.target.closest("[data-week-action]");
    if (weekAction) {
      try { await submitWeekDecision(weekAction.dataset.weekAction); } catch (error) { showToast(error.message); }
    }

    const programAction = event.target.closest("[data-program-action]");
    if (programAction) {
      const form = document.querySelector("#journey-pause-form");
      const values = Object.fromEntries(new FormData(form));
      const action = programAction.dataset.programAction;
      try {
        await api(`/api/students/${activeJourneyStudentId}/performance-program/${action}`, {
          method: "POST",
          body: JSON.stringify(action === "pause"
            ? { pauseDate: values.actionDate, reason: values.reason }
            : { resumeDate: values.actionDate, reason: values.reason })
        });
        await refreshJourneyWorkspace(action === "pause" ? "Course paused." : "Course resumed and target date extended.");
      } catch (error) { showToast(error.message); }
    }

    const sessionAction = event.target.closest(".journey-session-action");
    if (sessionAction) {
      const action = sessionAction.dataset.sessionAction;
      const reason = window.prompt(`Reason for ${action.replaceAll("_", " ")}:`);
      if (!reason) return;
      try {
        if (action === "cancel") {
          await api(`/api/sessions/${sessionAction.dataset.sessionId}/cancel`, {
            method: "POST", body: JSON.stringify({ reason })
          });
        } else {
          const value = window.prompt("New date and time (example: 2026-08-04T17:00):");
          if (!value) return;
          const scheduledAt = new Date(value).toISOString();
          await api(`/api/sessions/${sessionAction.dataset.sessionId}/${action}`, {
            method: "POST",
            body: JSON.stringify({ scheduledAt, durationMinutes: Number(sessionAction.dataset.duration || 45), reason })
          });
        }
        await refreshJourneyWorkspace(action === "cancel" ? "Session cancelled." : "Session schedule updated.");
      } catch (error) { showToast(error.message); }
    }
  });
}

function renderAdminUser() {
  if (!adminUser) return;
  document.querySelector("#admin-user-name").textContent = adminUser.name;
  document.querySelector("#admin-user-role").textContent = adminUser.role.replaceAll("_", " ");
  const avatar = document.querySelector("#admin-avatar");
  avatar.innerHTML = `<img src="${assetUrl("brand-logo-transparent.png")}" alt="On The Streets">`;
  avatar.title = `${initials(adminUser.name)} - go to Dashboard`;
  avatar.classList.add("has-logo");
  document.querySelector("#open-create-student").hidden = ["teacher", "operations"].includes(adminUser.role);
  document.querySelector("#open-create-session").hidden = adminUser.role === "operations";
  document.querySelector('[data-admin-view="reviews"]').hidden = adminUser.role === "operations";
  document.querySelectorAll("#course-plan-form input, #course-plan-form textarea, #course-plan-form select, #course-plan-form button")
    .forEach((field) => { field.disabled = adminUser.role === "operations"; });
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
    await Promise.all([loadBackendHealth(), loadDashboard()]);
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
  await loadBackendHealth();
  clearLegacyDemoAutofill();
  window.setTimeout(clearLegacyDemoAutofill, 500);
  await restoreSession();
}

init();
