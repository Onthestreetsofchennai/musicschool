const ADMIN_TOKEN_KEY = "otsAdminToken";

let adminToken = localStorage.getItem(ADMIN_TOKEN_KEY) || "";
let adminUser = null;
let dashboardData = null;
let toastTimer;

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
  const response = await fetch(path, { ...options, headers });
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

function logout(showMessage = true) {
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

function openReview(button) {
  document.querySelector("#review-submission-id").value = button.dataset.submissionId;
  document.querySelector("#review-modal-title").textContent = `${button.dataset.studentName}'s ${button.dataset.period} practice`;
  document.querySelector("#review-modal-subtitle").textContent = `Week ${button.dataset.week} submission`;
  document.querySelector("#review-file-name").textContent = button.dataset.fileName;
  document.querySelector("#review-modal").showModal();
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
    if (reviewButton) openReview(reviewButton);

    const resolveButton = event.target.closest(".resolve-alert");
    if (resolveButton) await resolveAlert(Number(resolveButton.dataset.alertId));
  });
}

function renderAdminUser() {
  if (!adminUser) return;
  document.querySelector("#admin-user-name").textContent = adminUser.name;
  document.querySelector("#admin-user-role").textContent = adminUser.role.replaceAll("_", " ");
  document.querySelector("#admin-avatar").textContent = initials(adminUser.name);
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
  await restoreSession();
}

init();
