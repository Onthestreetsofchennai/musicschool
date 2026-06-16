const STORAGE_KEY = "musicSchoolOTSStateV1";
const STUDENT_TOKEN_KEY = "otsStudentToken";

const courseWeeks = [
  {
    title: "Setup, posture and first sound",
    focus: "Instrument setup, relaxed posture and clean first notes.",
    milestone: "Hold the instrument correctly and produce five clean notes.",
    lessons: ["Instrument care and setup", "Posture and hand position", "Your first clean sound"]
  },
  {
    title: "Pulse and rhythm foundations",
    focus: "Count steady beats and follow a simple rhythmic pattern.",
    milestone: "Maintain a steady four-count for one full minute.",
    lessons: ["Understanding pulse", "Quarter and half notes", "Clapping with a metronome"]
  },
  {
    title: "First chord shapes",
    focus: "Build clean G, C and D shapes without unnecessary tension.",
    milestone: "Play three chord shapes clearly at a slow tempo.",
    lessons: ["Finger placement", "G, C and D shapes", "Reducing string buzz"]
  },
  {
    title: "Clean chord transitions",
    focus: "Move between the first three chords smoothly.",
    milestone: "Complete ten G-to-C changes in one minute.",
    lessons: ["Anchor fingers", "Slow transition loops", "One-minute change exercise"]
  },
  {
    title: "Strumming patterns",
    focus: "Connect rhythm to the chord shapes learned so far.",
    milestone: "Play a four-bar strumming loop without stopping.",
    lessons: ["Down-strum control", "Down-up motion", "Two essential patterns"]
  },
  {
    title: "Your first complete song",
    focus: "Combine chords and rhythm into a complete arrangement.",
    milestone: "Play one full song from beginning to end.",
    lessons: ["Song structure", "Verse and chorus practice", "Complete play-through"]
  },
  {
    title: "Timing with a metronome",
    focus: "Strengthen consistency and recover without stopping.",
    milestone: "Perform the song at 70 BPM with steady timing.",
    lessons: ["Using the click", "Tempo ladders", "Recovering from mistakes"]
  },
  {
    title: "Faster, cleaner transitions",
    focus: "Increase speed while preserving clarity.",
    milestone: "Reach 25 clean chord changes per minute.",
    lessons: ["Economy of movement", "Transition pairs", "Speed without tension"]
  },
  {
    title: "Dynamics and expression",
    focus: "Make the performance sound musical, not mechanical.",
    milestone: "Perform with clear soft and strong sections.",
    lessons: ["Volume control", "Accents and phrasing", "Expressive play-through"]
  },
  {
    title: "Performance preparation",
    focus: "Develop a reliable start, finish and recovery plan.",
    milestone: "Record a complete performance without restarting.",
    lessons: ["Performance routine", "Managing nerves", "Camera practice"]
  },
  {
    title: "Mock performance week",
    focus: "Use teacher feedback to polish the final details.",
    milestone: "Complete a reviewed mock performance.",
    lessons: ["Mock performance one", "Teacher corrections", "Mock performance two"]
  },
  {
    title: "Final performance",
    focus: "Demonstrate the skills and consistency built over 12 weeks.",
    milestone: "Submit the final performance and earn the course certificate.",
    lessons: ["Final preparation", "Performance upload", "Reflection and next path"]
  }
];

const defaultState = {
  onboarded: false,
  profile: {
    name: "Student",
    email: "",
    instrument: "Guitar",
    goal: "Play complete songs confidently",
    teacherName: "Your teacher"
  },
  currentWeek: 3,
  completedWeeks: [1, 2],
  streak: 6,
  reviews: 9,
  checkins: {
    morning: {
      status: "reviewed",
      fileName: "morning-practice.mp4",
      time: "7:18 AM"
    },
    evening: {
      status: "pending",
      fileName: "",
      time: ""
    }
  },
  settings: {
    morningReminder: true,
    eveningReminder: true,
    parentUpdates: true
  },
  helpCall: null
};

const feedbackItems = [
  {
    period: "Morning practice",
    time: "Today, 9:24 AM",
    title: "Cleaner chord shapes today",
    message: "Good timing. Your G and D shapes are much cleaner. Keep the same relaxed wrist position in the evening video.",
    inputs: [
      "Slow the G-to-C transition down.",
      "Keep your thumb behind the neck.",
      "Repeat bars 5-8 three times."
    ]
  },
  {
    period: "Evening practice",
    time: "Yesterday, 8:46 PM",
    title: "Rhythm is becoming steady",
    message: "You stayed with the beat even after a small mistake. That recovery is important. Tomorrow, use the metronome at 60 BPM.",
    inputs: [
      "Count aloud for the first two rounds.",
      "Keep the strumming motion continuous."
    ]
  },
  {
    period: "Weekly session",
    time: "Friday, 6:52 PM",
    title: "Week 2 completed",
    message: "You are ready for the first chord week. Your daily consistency is helping the live sessions move faster.",
    inputs: ["Review finger numbers before Tuesday.", "Bring your capo to the next session."]
  }
];

let state = loadState();
let studentToken = localStorage.getItem(STUDENT_TOKEN_KEY) || "";
let pendingLoginEmail = "";
let selectedHelpSlot = null;
let toastTimer;
const temporaryVideoUrls = {};
let backendFeedback = null;
let backendConnected = false;

async function apiRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (studentToken) headers.Authorization = `Bearer ${studentToken}`;
  const response = await fetch(path, {
    headers,
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401 && !path.startsWith("/api/student-auth/")) {
    clearStudentSession();
    setAuthVisible(true);
  }
  if (!response.ok) throw new Error(payload.error || "The server could not complete this request.");
  return payload;
}

function clearStudentSession() {
  studentToken = "";
  backendConnected = false;
  localStorage.removeItem(STUDENT_TOKEN_KEY);
  localStorage.removeItem(STORAGE_KEY);
}

function setAuthVisible(visible) {
  const auth = document.querySelector("#student-auth");
  const appShell = document.querySelector("#app-shell");
  auth.hidden = !visible;
  appShell.toggleAttribute("inert", visible);
  appShell.setAttribute("aria-hidden", String(visible));
}

function setAuthStep(step) {
  document.querySelector("#student-email-form").hidden = step !== "email";
  document.querySelector("#student-otp-form").hidden = step !== "otp";
  document.querySelector("#development-otp").hidden = true;
  document.querySelector("#student-auth-error").hidden = true;
}

function showAuthError(message) {
  const error = document.querySelector("#student-auth-error");
  error.textContent = message;
  error.hidden = false;
}

function formatBackendDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

async function syncStudentFromBackend() {
  try {
    const data = await apiRequest("/api/student/me");
    backendConnected = true;
    state.onboarded = true;
    state.profile.name = data.profile.name;
    state.profile.email = data.profile.email;
    state.profile.instrument = data.profile.instrument;
    state.profile.goal = data.profile.goal;
    state.profile.teacherName = data.profile.teacher_name || "Your teacher";
    state.currentWeek = data.profile.current_week;
    state.completedWeeks = Array.from({ length: Math.max(0, state.currentWeek - 1) }, (_, index) => index + 1);
    state.reviews = data.feedback.length;
    state.settings = {
      morningReminder: data.preferences.morningReminder,
      eveningReminder: data.preferences.eveningReminder,
      parentUpdates: data.preferences.parentUpdates
    };
    state.checkins = {
      morning: { status: "pending", fileName: "", time: "" },
      evening: { status: "pending", fileName: "", time: "" }
    };

    for (const period of ["morning", "evening"]) {
      const submission = data.todaySubmissions.find((item) => item.period === period);
      if (submission) {
        state.checkins[period] = {
          status: submission.review_status === "reviewed" ? "reviewed" : "submitted",
          fileName: submission.file_name,
          time: new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(new Date(submission.uploaded_at))
        };
      }
    }

    backendFeedback = data.feedback.map((item) => ({
      period: `${item.period === "morning" ? "Morning" : "Evening"} practice`,
      time: formatBackendDate(item.reviewed_at),
      title: item.positive_observation || "Practice reviewed",
      message: item.main_correction || "Your teacher has reviewed this practice check-in.",
      inputs: [item.next_practice_focus].filter(Boolean)
    }));

    const scheduledCall = data.helpCalls[0];
    state.helpCall = scheduledCall ? {
      id: scheduledCall.id,
      slot: formatBackendDate(scheduledCall.scheduled_at),
      topic: scheduledCall.topic
    } : null;

    saveState();
    renderAll();
    setAuthVisible(false);
  } catch (error) {
    backendConnected = false;
    if (!studentToken) {
      setAuthVisible(true);
      setAuthStep("email");
    } else {
      showAuthError(error.message);
    }
  }
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? { ...defaultState, ...saved, profile: { ...defaultState.profile, ...saved.profile }, checkins: { ...defaultState.checkins, ...saved.checkins }, settings: { ...defaultState.settings, ...saved.settings } } : structuredClone(defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatToday() {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date()).toUpperCase();
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 3200);
}

function navigate(viewName) {
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("is-active", view.id === `view-${viewName}`);
  });

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === viewName);
  });

  const activeView = document.querySelector(`#view-${viewName}`);
  document.querySelector("#topbar-title").textContent = activeView?.dataset.title || "MUSIC SCHOOL OTS";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function calculateProgress() {
  return Math.round((state.completedWeeks.length / 12) * 100);
}

function teacherIdentity() {
  const fullName = state.profile.teacherName || "Your teacher";
  if (fullName === "Your teacher") {
    return {
      fullName,
      firstName: "Your teacher",
      displayName: "Your teacher",
      initials: "OT"
    };
  }
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    fullName,
    firstName: parts[0] || "Your teacher",
    displayName: parts.length > 1 ? `${parts[0]} ${parts[1].charAt(0)}.` : fullName,
    initials: parts.slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase() || "OT"
  };
}

function renderTeacherIdentity() {
  const teacher = teacherIdentity();
  document.querySelectorAll("[data-teacher-display-name]").forEach((element) => {
    element.textContent = teacher.displayName;
  });
  document.querySelectorAll("[data-teacher-first-name]").forEach((element) => {
    element.textContent = teacher.firstName;
  });
  document.querySelectorAll("[data-teacher-initials]").forEach((element) => {
    element.textContent = teacher.initials;
  });
}

function renderHome() {
  const progress = calculateProgress();
  const name = state.profile.name || "Student";
  const initial = name.trim().charAt(0).toUpperCase() || "S";
  const eveningSubmitted = ["submitted", "reviewed"].includes(state.checkins.evening.status);

  document.querySelector("#hero-instrument").textContent = state.profile.instrument.toUpperCase();
  document.querySelector("#hero-week").textContent = state.currentWeek;
  document.querySelector("#orbit-week").textContent = state.currentWeek;
  document.querySelector("#hero-progress-text").textContent = `${progress}%`;
  document.querySelector("#hero-progress-bar").style.width = `${progress}%`;
  document.querySelector("#streak-count").textContent = state.streak;
  document.querySelector("#review-count").textContent = `${state.reviews} received`;
  document.querySelector("#avatar-button").textContent = initial;
  document.querySelector("#home-evening-status").textContent = eveningSubmitted ? "Submitted for teacher review" : "Due by 8:00 PM";
  document.querySelector("#daily-ring").textContent = eveningSubmitted ? "2/2" : "1/2";

  const eveningItem = document.querySelector("#home-evening-item");
  eveningItem.classList.toggle("is-complete", eveningSubmitted);
  eveningItem.querySelector(".check-icon").textContent = eveningSubmitted ? "✓" : "2";
}

function renderCourse() {
  const weekList = document.querySelector("#week-list");
  const progress = calculateProgress();
  document.querySelector("#course-instrument").textContent = state.profile.instrument;
  document.querySelector("#course-progress-percent").textContent = `${progress}%`;

  weekList.innerHTML = courseWeeks.map((week, index) => {
    const weekNumber = index + 1;
    const completed = state.completedWeeks.includes(weekNumber);
    const current = weekNumber === state.currentWeek;
    const locked = weekNumber > state.currentWeek + 1;
    const stateLabel = completed ? "Completed" : current ? "Current week" : locked ? "Preview" : "Next";
    const action = current
      ? `<button class="button button-primary complete-week" data-week="${weekNumber}">Complete week</button>`
      : completed
        ? `<span class="tag tag-green">Milestone achieved</span>`
        : `<button class="button button-secondary preview-week" data-week="${weekNumber}">Preview</button>`;

    return `
      <article class="week-card ${completed ? "is-completed" : ""} ${current ? "is-current is-open" : ""} ${locked ? "is-locked" : ""}" data-week-card="${weekNumber}">
        <button class="week-toggle" data-week-toggle="${weekNumber}" aria-expanded="${current}">
          <span class="week-number">${completed ? "✓" : weekNumber}</span>
          <span class="week-title">
            <strong>Week ${weekNumber}: ${week.title}</strong>
            <small>${week.focus}</small>
          </span>
          <span class="week-state">${stateLabel}</span>
        </button>
        <div class="week-details">
          <ul>
            ${week.lessons.map((lesson) => `<li>${lesson}</li>`).join("")}
          </ul>
          <div class="week-milestone">
            <strong>Weekly milestone</strong>
            <p>${week.milestone}</p>
            ${action}
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function renderCheckins() {
  ["morning", "evening"].forEach((period) => {
    const checkin = state.checkins[period];
    const badge = document.querySelector(`#${period}-status-badge`);
    const fileLabel = document.querySelector(`#${period}-file-label`);
    const timeLabel = document.querySelector(`#${period}-upload-time`);
    const preview = document.querySelector(`#${period}-preview`);

    badge.className = "upload-status";
    if (checkin.status === "reviewed") {
      badge.textContent = "Reviewed";
      badge.classList.add("is-reviewed");
    } else if (checkin.status === "submitted") {
      badge.textContent = "Waiting for review";
      badge.classList.add("is-submitted");
    } else if (checkin.status === "selected") {
      badge.textContent = "Ready to submit";
    } else {
      badge.textContent = "Due today";
    }

    if (checkin.fileName) {
      fileLabel.textContent = checkin.fileName;
      timeLabel.textContent = checkin.time ? `Uploaded at ${checkin.time}` : "Video selected";
      preview.classList.remove("is-empty");
    } else {
      fileLabel.textContent = "Record or choose a video";
      timeLabel.textContent = period === "morning" ? "Due by 9:00 AM" : "Due by 8:00 PM";
      preview.classList.add("is-empty");
    }
  });

  document.querySelector("#checkin-streak").textContent = state.streak;
  renderHistory();
}

function renderHistory() {
  const rows = [
    ["Today", "Morning submitted", "Reviewed"],
    ["Yesterday", "Morning + evening", "Reviewed"],
    ["Saturday", "Morning + evening", "Reviewed"],
    ["Friday", "Morning + evening", "Reviewed"]
  ];

  if (["submitted", "reviewed"].includes(state.checkins.evening.status)) {
    rows[0] = ["Today", "Morning + evening", "Waiting review"];
  }

  document.querySelector("#history-list").innerHTML = rows.map(([day, detail, status]) => `
    <div class="history-row">
      <strong>${day}</strong>
      <span>${detail}</span>
      <span class="tag ${status === "Reviewed" ? "tag-green" : "tag-purple"}">${status}</span>
    </div>
  `).join("");
}

function renderFeedback() {
  const items = backendFeedback?.length ? backendFeedback : feedbackItems;
  const teacher = teacherIdentity();
  document.querySelector("#feedback-list").innerHTML = items.map((item) => `
    <article class="feedback-card">
      <div class="teacher-avatar small">${teacher.initials}</div>
      <div>
        <span class="tag tag-purple">${item.period}</span>
        <h3>${item.title}</h3>
        <p>${item.message}</p>
        <div class="feedback-inputs">
          ${item.inputs.map((input, index) => `<div class="feedback-input"><span>${index + 1}</span>${input}</div>`).join("")}
        </div>
        <p class="microcopy">${item.time}</p>
      </div>
    </article>
  `).join("");

  const banner = document.querySelector("#scheduled-call-banner");
  if (state.helpCall) {
    banner.hidden = false;
    document.querySelector("#scheduled-call-title").textContent = state.helpCall.slot;
  } else {
    banner.hidden = true;
  }
}

function renderProfile() {
  const name = state.profile.name || "Student";
  const initial = name.trim().charAt(0).toUpperCase() || "S";
  document.querySelector("#profile-avatar").textContent = initial;
  document.querySelector("#profile-display-name").textContent = name;
  document.querySelector("#profile-display-instrument").textContent = state.profile.instrument;
  document.querySelector("#profile-display-week").textContent = state.currentWeek;
  document.querySelector("#profile-email").value = state.profile.email || "";
  document.querySelector("#profile-name").value = name;
  document.querySelector("#profile-goal").value = state.profile.goal;

  Object.entries(state.settings).forEach(([key, value]) => {
    const checkbox = document.querySelector(`[data-setting="${key}"]`);
    if (checkbox) checkbox.checked = value;
  });
}

function renderAll() {
  document.querySelector("#today-label").textContent = formatToday();
  renderTeacherIdentity();
  renderHome();
  renderCourse();
  renderCheckins();
  renderFeedback();
  renderProfile();
}

function openHelpCallModal() {
  const modal = document.querySelector("#help-call-modal");
  const slotGrid = document.querySelector("#slot-grid");
  const date = new Date();
  const slots = [];

  for (let offset = 1; offset <= 3; offset += 1) {
    const next = new Date(date);
    next.setDate(date.getDate() + offset);
    const day = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short" }).format(next);
    [[18, 30, "6:30 PM"], [19, 0, "7:00 PM"]].forEach(([hour, minute, label]) => {
      const scheduledAt = new Date(next);
      scheduledAt.setHours(hour, minute, 0, 0);
      slots.push({ label: `${day} at ${label}`, iso: scheduledAt.toISOString() });
    });
  }

  selectedHelpSlot = slots[0];
  slotGrid.innerHTML = slots.map((slot, index) => `
    <label class="slot-option">
      <input type="radio" name="help-slot" value="${index}" ${index === 0 ? "checked" : ""}>
      <span>${slot.label}</span>
    </label>
  `).join("");

  slotGrid.querySelectorAll("input").forEach((radio) => {
    radio.addEventListener("change", () => {
      selectedHelpSlot = slots[Number(radio.value)];
    });
  });

  modal.showModal();
}

function handleUploadSelection(input) {
  const period = input.dataset.uploadInput;
  const file = input.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("video/")) {
    showToast("Please choose a video file.");
    input.value = "";
    return;
  }

  if (temporaryVideoUrls[period]) URL.revokeObjectURL(temporaryVideoUrls[period]);
  temporaryVideoUrls[period] = URL.createObjectURL(file);

  state.checkins[period] = {
    status: "selected",
    fileName: file.name,
    time: ""
  };

  const preview = document.querySelector(`#${period}-preview`);
  preview.innerHTML = `<video controls playsinline src="${temporaryVideoUrls[period]}"></video>`;
  preview.classList.remove("is-empty");
  document.querySelector(`[data-submit-upload="${period}"]`).hidden = false;
  renderCheckins();
}

async function submitUpload(period) {
  const button = document.querySelector(`[data-submit-upload="${period}"]`);
  button.disabled = true;
  try {
    if (backendConnected) {
      await apiRequest("/api/student/me/practice-submissions", {
        method: "POST",
        body: JSON.stringify({
          period,
          fileName: state.checkins[period].fileName,
          durationSeconds: 600
        })
      });
    }

    const now = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(new Date());
    state.checkins[period].status = "submitted";
    state.checkins[period].time = now;
    if (period === "evening") state.streak = Math.max(state.streak, 7);
    saveState();
    button.hidden = true;
    renderAll();
    showToast(`${period === "morning" ? "Morning" : "Evening"} video submitted to ${teacherIdentity().firstName} for review.`);
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
}

async function completeWeek(weekNumber) {
  if (!state.completedWeeks.includes(weekNumber)) {
    state.completedWeeks.push(weekNumber);
    state.completedWeeks.sort((a, b) => a - b);
  }
  if (weekNumber === state.currentWeek && state.currentWeek < 12) {
    state.currentWeek += 1;
  }
  saveState();
  renderAll();
  if (backendConnected) {
    try {
      await apiRequest("/api/student/me/progress", {
        method: "POST",
        body: JSON.stringify({ currentWeek: state.currentWeek })
      });
    } catch (error) {
      showToast(error.message);
      return;
    }
  }
  showToast(`Week ${weekNumber} completed. Week ${state.currentWeek} is now active.`);
}

async function requestStudentOtp(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");
  pendingLoginEmail = document.querySelector("#student-login-email").value.trim().toLowerCase();
  button.disabled = true;
  document.querySelector("#student-auth-error").hidden = true;
  try {
    const result = await apiRequest("/api/student-auth/request-otp", {
      method: "POST",
      body: JSON.stringify({ email: pendingLoginEmail })
    });
    document.querySelector("#student-otp-email").textContent = pendingLoginEmail;
    document.querySelector("#student-email-form").hidden = true;
    document.querySelector("#student-otp-form").hidden = false;
    if (result.developmentOtp) {
      document.querySelector("#development-otp-code").textContent = result.developmentOtp;
      document.querySelector("#development-otp").hidden = false;
    }
    document.querySelector("#student-login-otp").focus();
  } catch (error) {
    showAuthError(error.message);
  } finally {
    button.disabled = false;
  }
}

async function verifyStudentOtp(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");
  const otp = document.querySelector("#student-login-otp").value.trim();
  button.disabled = true;
  document.querySelector("#student-auth-error").hidden = true;
  try {
    const result = await apiRequest("/api/student-auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ email: pendingLoginEmail, otp })
    });
    studentToken = result.token;
    localStorage.setItem(STUDENT_TOKEN_KEY, studentToken);
    state = structuredClone(defaultState);
    backendFeedback = null;
    await syncStudentFromBackend();
    showToast(`Welcome back, ${result.student.name}.`);
  } catch (error) {
    showAuthError(error.message);
  } finally {
    button.disabled = false;
  }
}

async function logoutStudent() {
  try {
    if (studentToken) await apiRequest("/api/student-auth/logout", { method: "POST", body: "{}" });
  } catch {
    // Local logout must still complete if the session has already expired.
  }
  clearStudentSession();
  state = structuredClone(defaultState);
  backendFeedback = null;
  pendingLoginEmail = "";
  document.querySelector("#student-login-email").value = "";
  document.querySelector("#student-login-otp").value = "";
  setAuthStep("email");
  setAuthVisible(true);
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.view));
  });

  document.querySelector("#student-email-form").addEventListener("submit", requestStudentOtp);
  document.querySelector("#student-otp-form").addEventListener("submit", verifyStudentOtp);
  document.querySelector("#student-change-email").addEventListener("click", () => {
    pendingLoginEmail = "";
    document.querySelector("#student-login-otp").value = "";
    setAuthStep("email");
  });

  document.querySelectorAll("[data-upload-input]").forEach((input) => {
    input.addEventListener("change", () => handleUploadSelection(input));
  });

  document.querySelectorAll("[data-submit-upload]").forEach((button) => {
    button.addEventListener("click", () => submitUpload(button.dataset.submitUpload));
  });

  document.addEventListener("click", (event) => {
    const weekToggle = event.target.closest("[data-week-toggle]");
    if (weekToggle) {
      const card = document.querySelector(`[data-week-card="${weekToggle.dataset.weekToggle}"]`);
      const open = card.classList.toggle("is-open");
      weekToggle.setAttribute("aria-expanded", String(open));
    }

    const completeButton = event.target.closest(".complete-week");
    if (completeButton) completeWeek(Number(completeButton.dataset.week));

    const previewButton = event.target.closest(".preview-week");
    if (previewButton) showToast("This week unlocks after the current milestone is completed.");
  });

  document.querySelectorAll(".join-session").forEach((button) => {
    button.addEventListener("click", () => showToast("The class room opens 10 minutes before the session."));
  });

  document.querySelectorAll(".open-help-call").forEach((button) => {
    button.addEventListener("click", openHelpCallModal);
  });

  document.querySelector("#help-call-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const topic = document.querySelector("#help-topic").value.trim();
    try {
      if (backendConnected) {
        const result = await apiRequest("/api/student/me/help-calls", {
          method: "POST",
          body: JSON.stringify({ scheduledAt: selectedHelpSlot.iso, topic })
        });
        state.helpCall = { id: result.id, slot: selectedHelpSlot.label, topic };
      } else {
        state.helpCall = { slot: selectedHelpSlot.label, topic };
      }
      saveState();
      document.querySelector("#help-call-modal").close();
      document.querySelector("#help-topic").value = "";
      renderFeedback();
      navigate("feedback");
      showToast(`Your help call with ${teacherIdentity().firstName} is scheduled.`);
    } catch (error) {
      showToast(error.message);
    }
  });

  document.querySelector("#cancel-help-call").addEventListener("click", async () => {
    try {
      if (backendConnected && state.helpCall?.id) {
        await apiRequest(`/api/student/me/help-calls/${state.helpCall.id}/cancel`, {
          method: "POST"
        });
      }
      state.helpCall = null;
      saveState();
      renderFeedback();
      showToast("Help call cancelled.");
    } catch (error) {
      showToast(error.message);
    }
  });

  document.querySelector("#profile-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const result = await apiRequest("/api/student/me/profile", {
        method: "PATCH",
        body: JSON.stringify({
          name: document.querySelector("#profile-name").value.trim(),
          goal: document.querySelector("#profile-goal").value.trim()
        })
      });
      state.profile.name = result.profile.name;
      state.profile.goal = result.profile.goal;
      saveState();
      renderAll();
      showToast("Profile updated in the database.");
    } catch (error) {
      showToast(error.message);
    }
  });

  document.querySelectorAll("[data-setting]").forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      state.settings[checkbox.dataset.setting] = checkbox.checked;
      saveState();
      try {
        await apiRequest("/api/student/me/preferences", {
          method: "PATCH",
          body: JSON.stringify(state.settings)
        });
        showToast("Reminder preference saved.");
      } catch (error) {
        showToast(error.message);
      }
    });
  });

  document.querySelector("#notification-button").addEventListener("click", () => {
    showToast(`Evening practice is due by 8:00 PM. ${teacherIdentity().firstName} reviewed your morning upload.`);
  });

  document.querySelector("#student-logout").addEventListener("click", logoutStudent);
}

async function init() {
  bindEvents();
  renderAll();
  if (studentToken) {
    await syncStudentFromBackend();
  } else {
    setAuthStep("email");
    setAuthVisible(true);
  }

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
}

init();
