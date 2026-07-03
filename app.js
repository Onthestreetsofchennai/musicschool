const STORAGE_KEY = "musicSchoolOTSStateV1";
const STUDENT_TOKEN_KEY = "otsStudentToken";
const WELCOME_SEEN_PREFIX = "otsWelcomeSeen:";
const WORKER_API_ORIGIN = "https://music-school-ots.sharoncornerstone56.workers.dev";
const API_ORIGIN = (() => {
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".workers.dev")) return "";
  return WORKER_API_ORIGIN;
})();
const MIN_SUBMIT_PRACTICE_SECONDS = 60;
const LEADERBOARD_MIN_STUDENTS = 30;

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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

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
  practiceGate: {
    locked: false,
    activePeriod: null,
    missingPeriods: [],
    minDurationSeconds: 420,
    minSubmitSeconds: MIN_SUBMIT_PRACTICE_SECONDS,
    message: ""
  },
  coursePlan: {
    courseTitle: "12-week Guitar course",
    totalWeeks: 12,
    practiceMinutes: 7,
    morningRequired: true,
    eveningRequired: true,
    weeks: courseWeeks
  },
  upcomingSessions: [],
  recentSubmissions: [],
  helpCall: null,
  leaderboard: []
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
let pendingOtpSessionId = "";
let selectedHelpSlot = null;
let toastTimer;
const temporaryVideoUrls = {};
const selectedPracticeFiles = {};
let backendFeedback = null;
let backendConnected = false;
let classroomStream = null;
let classroomMicEnabled = true;
let classroomCameraEnabled = true;
let recorderStream = null;
let practiceRecorder = null;
let recorderChunks = [];
let recorderPeriod = null;
let recorderStartedAt = 0;
let recorderTimerId = 0;
let recordedPracticeBlob = null;
let recordedPracticeSeconds = 0;
let recordedPracticeUrl = "";

async function apiRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (studentToken) headers.Authorization = `Bearer ${studentToken}`;
  const response = await fetch(`${API_ORIGIN}${path}`, {
    headers,
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401 && !path.startsWith("/api/student-auth/")) {
    clearStudentSession();
    setAuthVisible(true);
  }
  if (!response.ok) {
    const error = new Error(payload.error || "The server could not complete this request.");
    error.code = payload.code || "";
    error.payload = payload;
    throw error;
  }
  return payload;
}

function apiEndpoint(path) {
  return /^https?:\/\//i.test(String(path || "")) ? path : `${API_ORIGIN}${path}`;
}

async function uploadPracticeVideoIfAvailable(period, file) {
  if (!file) return { storageMode: "metadata-only-mvp", storageKey: "" };
  let config;
  try {
    config = await apiRequest("/api/student/me/video-upload-config", {
      method: "POST",
      body: JSON.stringify({
        period,
        fileName: file.name,
        contentType: file.type || "video/webm"
      })
    });
  } catch (error) {
    if (!/not found|route not found/i.test(error.message)) throw error;
    return { storageMode: "metadata-only-mvp", storageKey: "" };
  }

  if (!config.uploadUrl) {
    return { storageMode: config.storageMode || "metadata-only-mvp", storageKey: "" };
  }
  if (config.maxFileSizeBytes && file.size > config.maxFileSizeBytes) {
    throw new Error(`This video is too large for upload. Please record a shorter practice clip under ${config.maxFileSizeMb || 95} MB.`);
  }

  let response;
  try {
    response = await fetch(apiEndpoint(config.uploadUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${studentToken}`,
        "Content-Type": file.type || "video/webm"
      },
      body: file
    });
  } catch (error) {
    throw new Error("Video upload could not reach the school server. Please try again with a shorter video or refresh the app once.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "The practice video could not be uploaded.");
  }
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
  document.querySelector("#student-admission-card").hidden = true;
}

function showAuthError(message) {
  const error = document.querySelector("#student-auth-error");
  error.textContent = message;
  error.hidden = false;
}

function showAdmissionInvite(email = "") {
  const card = document.querySelector("#student-admission-card");
  const applyLink = document.querySelector("#student-apply-whatsapp");
  const message = `Hi MUSIC SCHOOL OTS, I wanna apply for the music course. My email is ${email || "not added yet"}.`;
  applyLink.href = `https://wa.me/919841610111?text=${encodeURIComponent(message)}`;
  card.hidden = false;
  document.querySelector("#student-auth-error").hidden = true;
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
    state.practiceGate = data.practiceGate || structuredClone(defaultState.practiceGate);
    state.coursePlan = data.coursePlan ? {
      courseTitle: data.coursePlan.course_title,
      totalWeeks: data.coursePlan.total_weeks,
      practiceMinutes: data.coursePlan.practice_minutes,
      morningRequired: data.coursePlan.morning_required,
      eveningRequired: data.coursePlan.evening_required,
      weeks: data.coursePlan.weeks || courseWeeks
    } : structuredClone(defaultState.coursePlan);
    state.upcomingSessions = data.upcomingSessions || [];
    state.recentSubmissions = data.recentSubmissions || [];
    state.leaderboard = data.leaderboard || [];
    state.checkins = {
      morning: { status: "pending", fileName: "", time: "" },
      evening: { status: "pending", fileName: "", time: "" }
    };

    for (const period of ["morning", "evening"]) {
      const submission = data.todaySubmissions.find((item) => item.period === period);
      if (submission) {
        state.checkins[period] = {
          id: submission.id,
          status: submission.review_status === "reviewed" ? "reviewed" : "submitted",
          fileName: submission.file_name,
          time: new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(new Date(submission.uploaded_at)),
          durationSeconds: Number(submission.duration_seconds || 0)
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
      renderAll();
      setAuthVisible(false);
      showToast("Your saved session is open. Live data could not refresh yet.");
    }
  }
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? {
      ...defaultState,
      ...saved,
      profile: { ...defaultState.profile, ...saved.profile },
      checkins: { ...defaultState.checkins, ...saved.checkins },
      settings: { ...defaultState.settings, ...saved.settings },
      coursePlan: { ...defaultState.coursePlan, ...saved.coursePlan },
      leaderboard: saved.leaderboard || defaultState.leaderboard
    } : structuredClone(defaultState);
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

function formatPracticeDuration(seconds) {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = safeSeconds % 60;
  if (minutes && remaining) return `${minutes}m ${remaining}s`;
  if (minutes) return `${minutes} min`;
  return `${remaining}s`;
}

function practiceDurationNote(durationSeconds, targetSeconds) {
  const duration = Math.round(Number(durationSeconds) || 0);
  const target = Math.round(Number(targetSeconds) || 420);
  if (!duration || duration >= target) return "";
  const targetMinutes = Math.max(1, Math.round(target / 60));
  return `Short practice accepted: ${formatPracticeDuration(duration)} uploaded. Aim for ${targetMinutes} mins for full progress points.`;
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 3200);
}

function welcomeKey(email) {
  return `${WELCOME_SEEN_PREFIX}${String(email || "").toLowerCase()}`;
}

function showFirstLoginCelebration(studentName, email) {
  const key = welcomeKey(email);
  if (localStorage.getItem(key)) return;
  localStorage.setItem(key, "1");
  const firstName = (studentName || "Student").trim().split(/\s+/)[0] || "Student";
  document.querySelector("#welcome-modal-title").textContent =
    `${firstName}, congrats on choosing to learn a new skill.`;
  document.querySelector("#welcome-modal").showModal();
}

function navigate(viewName, bypassGate = false) {
  if (!bypassGate && state.practiceGate.locked && viewName === "course") {
    renderPracticeGate(true);
    showToast("Submit today's practice video to unlock the Course path.");
    return;
  }
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

function openCheckinPeriod(period) {
  navigate("checkin", true);
  window.setTimeout(() => {
    const card = document.querySelector(`.upload-card[data-period="${period}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("is-targeted");
    window.setTimeout(() => card.classList.remove("is-targeted"), 1600);
  }, 120);
}

function renderPracticeGate(forceVisible = false) {
  const gate = document.querySelector("#practice-gate");
  const appShell = document.querySelector("#app-shell");
  const snoozedUntil = Number(sessionStorage.getItem("otsPracticeGateSnoozedUntil") || 0);
  const snoozed = snoozedUntil > Date.now();
  const visible = state.practiceGate.locked && forceVisible && !snoozed;
  gate.hidden = !visible;
  appShell.classList.toggle("is-practice-locked", state.practiceGate.locked);
  if (!state.practiceGate.locked) sessionStorage.removeItem("otsPracticeGateSnoozedUntil");

  const periodLabel = state.practiceGate.activePeriod === "evening" ? "evening" : "morning";
  document.querySelector(".practice-gate-icon").textContent = Math.round(state.practiceGate.minDurationSeconds / 60);
  document.querySelector("#practice-gate-title").textContent = `Upload your ${periodLabel} practice`;
  document.querySelector("#practice-gate-message").textContent = state.practiceGate.message ||
    `Upload at least ${Math.round(state.practiceGate.minDurationSeconds / 60)} minutes to unlock the Course tab.`;
}

function calculateProgress() {
  const totalWeeks = Number(state.coursePlan?.totalWeeks || 12);
  const completedProgress = Math.round((state.completedWeeks.length / totalWeeks) * 100);
  const weekPositionProgress = Math.round((Math.max(0, Number(state.currentWeek || 1) - 1) / totalWeeks) * 100);
  return Math.min(100, Math.max(completedProgress, weekPositionProgress));
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
  const morningSubmitted = ["submitted", "reviewed"].includes(state.checkins.morning.status);
  const eveningSubmitted = ["submitted", "reviewed"].includes(state.checkins.evening.status);
  const requiredPeriods = [
    state.coursePlan?.morningRequired ? "morning" : null,
    state.coursePlan?.eveningRequired ? "evening" : null
  ].filter(Boolean);
  const submittedCount = requiredPeriods.filter((period) => ["submitted", "reviewed"].includes(state.checkins[period].status)).length;

  const heroInstrument = document.querySelector("#hero-instrument");
  if (heroInstrument) heroInstrument.textContent = state.profile.instrument.toUpperCase();
  document.querySelector("#hero-week").textContent = state.currentWeek;
  document.querySelector("#orbit-week").textContent = state.currentWeek;
  document.querySelector("#hero-progress-text").textContent = `${progress}%`;
  document.querySelector("#hero-progress-bar").style.width = `${progress}%`;
  document.querySelector("#streak-count").textContent = state.streak;
  document.querySelector("#review-count").textContent = `${state.reviews} received`;
  document.querySelector("#avatar-button").textContent = initial;
  document.querySelector("#home-morning-status").textContent = state.coursePlan?.morningRequired
    ? (morningSubmitted ? "Submitted for teacher review" : "Due by 9:00 AM")
    : "Not required in your plan";
  document.querySelector("#home-evening-status").textContent = state.coursePlan?.eveningRequired
    ? (eveningSubmitted ? "Submitted for teacher review" : "Due by 8:00 PM")
    : "Not required in your plan";
  document.querySelector("#daily-ring").textContent = `${submittedCount}/${requiredPeriods.length}`;

  const morningItem = document.querySelector("#home-morning-item");
  const eveningItem = document.querySelector("#home-evening-item");
  morningItem.classList.toggle("is-complete", morningSubmitted);
  eveningItem.classList.toggle("is-complete", eveningSubmitted);
  morningItem.querySelector(".check-icon").textContent = morningSubmitted ? "✓" : "1";
  const sessionList = document.querySelector(".session-list");
  const teacher = teacherIdentity();
  sessionList.innerHTML = state.upcomingSessions.length
    ? state.upcomingSessions.slice(0, 2).map((session, index) => {
      const date = new Date(session.scheduled_at);
      return `
        <article class="session-card">
          <div class="session-date">
            <strong>${new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(date).toUpperCase()}</strong>
            <span>${date.getDate()}</span>
          </div>
          <div class="session-copy">
            <span class="tag ${index === 0 ? "tag-purple" : "tag-yellow"}">Session ${session.session_number}</span>
            <h3>${session.topic}</h3>
            <p>${new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(date)} with ${teacher.displayName}</p>
          </div>
          <button class="button button-secondary join-session" data-room="session-${session.id}">Join classroom</button>
        </article>
      `;
    }).join("")
    : '<p class="empty-state">No upcoming live sessions.</p>';
  eveningItem.querySelector(".check-icon").textContent = eveningSubmitted ? "✓" : "2";
  renderGamification();
}

function renderGamification() {
  const firstName = (state.profile.name || "Student").trim().split(/\s+/)[0] || "Student";
  const practiceMinutes = Number(state.coursePlan?.practiceMinutes || Math.round(state.practiceGate.minDurationSeconds / 60) || 7);
  const submitted = {
    morning: ["submitted", "reviewed"].includes(state.checkins.morning.status),
    evening: ["submitted", "reviewed"].includes(state.checkins.evening.status)
  };
  const morningRequired = state.coursePlan?.morningRequired !== false;
  const eveningRequired = state.coursePlan?.eveningRequired !== false;

  document.querySelector("#welcome-quest-title").textContent = `${firstName}, your guitar journey has started.`;
  document.querySelector("#welcome-quest-copy").textContent = state.practiceGate.locked
    ? `Submit a practice pod to open today's riff gate. Aim for ${practiceMinutes} mins for full progress points.`
    : "Performer path unlocked. Tiny practice, repeated daily, becomes stage confidence.";

  [
    ["morning", morningRequired, "Morning riff pod complete", "Record or upload morning practice"],
    ["evening", eveningRequired, "Evening rhythm pod complete", "Record or upload evening practice"]
  ].forEach(([period, required, completeText, pendingText]) => {
    const pod = document.querySelector(`[data-quest-pod="${period}"]`);
    const status = document.querySelector(`#${period}-quest-status`);
    if (!required) {
      pod.classList.add("is-complete");
      status.textContent = "Not required today";
      return;
    }
    pod.classList.toggle("is-complete", submitted[period]);
    status.textContent = submitted[period] ? completeText : pendingText;
  });

  const weeklyActivityTarget = 4;
  const localPracticeCount = Number(submitted.morning) + Number(submitted.evening);
  const rawLeaderboard = Array.isArray(state.leaderboard) ? state.leaderboard : [];
  const leaderboardSource = rawLeaderboard.length ? rawLeaderboard : [
    {
      rank: 1,
      name: firstName,
      instrument: state.profile.instrument,
      current_week: state.currentWeek,
      weekly_submissions: localPracticeCount,
      is_current_student: true
    }
  ];
  const leaderboard = leaderboardSource.map((student, index) => ({
    ...student,
    rank: student.rank || index + 1,
    current_week: Number(student.current_week || student.currentWeek || 1),
    weekly_submissions: Number(student.weekly_submissions || 0)
  }));
  if (!leaderboard.some((student) => student.is_current_student)) {
    leaderboard.unshift({
      rank: 1,
      name: firstName,
      instrument: state.profile.instrument,
      current_week: state.currentWeek,
      weekly_submissions: localPracticeCount,
      is_current_student: true
    });
  }

  const initialFor = (student) => String(student.name || "S").trim().charAt(0).toUpperCase() || "S";
  const currentStudent = leaderboard.find((student) => student.is_current_student);
  const totalPods = leaderboard.reduce((sum, student) => sum + student.weekly_submissions, 0);
  const groupActive = leaderboard.filter((student) => student.weekly_submissions > 0).length || leaderboard.length;
  const leaderboardReady = leaderboard.length >= LEADERBOARD_MIN_STUDENTS;
  const performerPanel = document.querySelector(".performer-journey-panel");
  const hallPanel = document.querySelector(".hall-panel");
  const hallTitle = document.querySelector("#hall-title");
  const leaderboardButton = document.querySelector("#view-leaderboard-button");
  const performerTitle = document.querySelector("#performer-title");
  const performerCopy = document.querySelector("#performer-copy");
  const roadmapActionTitle = document.querySelector("#roadmap-action-title");
  if (performerPanel) {
    performerPanel.hidden = false;
    performerPanel.classList.toggle("is-personal-mode", !leaderboardReady);
  }
  if (hallPanel) hallPanel.hidden = !leaderboardReady;
  if (performerTitle) {
    performerTitle.textContent = leaderboardReady
      ? "Everyone is aiming to become a performer."
      : "Your week goal performer path.";
  }
  if (performerCopy) {
    performerCopy.textContent = leaderboardReady
      ? "Do not compete with others. See where you stand, celebrate the group progress, and keep moving one practice pod at a time."
      : "Move one practice pod forward at a time. This path shows your weekly activity and the next stage you are working toward.";
  }
  if (roadmapActionTitle) {
    roadmapActionTitle.textContent = leaderboardReady
      ? "Move your badge toward the final stage"
      : "Move your badge through this week's goal";
  }
  if (hallTitle) {
    hallTitle.textContent = "Recent performers from your batch";
  }
  if (leaderboardButton) {
    leaderboardButton.hidden = !leaderboardReady;
    leaderboardButton.dataset.leaderboardReady = leaderboardReady ? "true" : "false";
    leaderboardButton.classList.toggle("is-locked", !leaderboardReady);
    leaderboardButton.textContent = leaderboardReady ? "View leaderboard" : "";
    leaderboardButton.setAttribute("aria-disabled", leaderboardReady ? "false" : "true");
  }
  document.querySelector("#group-active-count").textContent = groupActive;
  document.querySelector("#your-journey-rank").textContent = currentStudent ? `#${currentStudent.rank}` : "--";
  document.querySelector("#group-pods-count").textContent = totalPods;
  if (leaderboardReady) {
    document.querySelector("#hall-week-copy").textContent = `${leaderboard.length} learners on the path`;
  }

  const currentWeeklySubmissions = currentStudent ? currentStudent.weekly_submissions : localPracticeCount;
  const weeklyActivityCount = Math.min(weeklyActivityTarget, Math.max(localPracticeCount, currentWeeklySubmissions));
  const weeklyActivityPercent = Math.round((weeklyActivityCount / weeklyActivityTarget) * 100);
  const weeklyArc = document.querySelector("#weekly-activity-arc");
  document.querySelector("#weekly-activity-count").textContent = weeklyActivityCount;
  document.querySelector("#weekly-activity-target").textContent = weeklyActivityTarget;
  if (weeklyArc) {
    weeklyArc.style.strokeDasharray = `${weeklyActivityPercent} 100`;
  }
  document.querySelector("#weekly-activity-message").textContent = weeklyActivityCount >= weeklyActivityTarget
    ? "Mission complete! You are a goal-crushing performer."
    : weeklyActivityCount === 0
      ? "Start with one practice pod today. Your performer path wakes up after the first upload."
      : `${weeklyActivityTarget - weeklyActivityCount} more activity ${weeklyActivityTarget - weeklyActivityCount === 1 ? "step" : "steps"} to finish this week's stage.`;
  document.querySelector("#activity-mini-track").innerHTML = Array.from({ length: weeklyActivityTarget }, (_, index) => `
    <span class="${index < weeklyActivityCount ? "is-complete" : ""} ${index === weeklyActivityCount ? "is-current" : ""}"></span>
  `).join("");

  const roadmapStudents = leaderboardReady
    ? leaderboard
    : [currentStudent || {
      rank: 1,
      name: firstName,
      instrument: state.profile.instrument,
      current_week: state.currentWeek,
      weekly_submissions: localPracticeCount,
      is_current_student: true
    }];
  const maxWeek = Math.max(4, ...roadmapStudents.map((student) => student.current_week));
  const roadmapEnd = Math.max(4, Math.min(12, Math.max(maxWeek, state.currentWeek)));
  const roadmapStart = Math.max(1, roadmapEnd - 3);
  const roadmapWeeks = Array.from({ length: Math.min(4, roadmapEnd - roadmapStart + 1) }, (_, index) => roadmapStart + index);
  const roadColors = ["is-orange", "is-blue", "is-pink", "is-green"];
  document.querySelector("#performer-map").innerHTML = roadmapWeeks.map((week, index) => {
    const students = roadmapStudents.filter((student) => student.current_week === week);
    const visible = students.slice(0, 3);
    const weekScore = students.reduce((sum, student) => sum + student.weekly_submissions, 0);
    return `
      <article class="roadmap-week roadmap-week-${index + 1} ${week === state.currentWeek ? "is-current" : ""}">
        <span class="roadmap-week-label">Week ${week}</span>
        <div class="roadmap-track">
          <span class="road-crystal"></span>
          <span class="road-stone"></span>
          <span class="road-stone"></span>
          <span class="road-stone"></span>
          <div class="road-avatar-stack">
            ${visible.map((student, avatarIndex) => `
              <span class="road-avatar ${student.is_current_student ? "is-you" : roadColors[avatarIndex % roadColors.length]}">${initialFor(student)}</span>
            `).join("")}
            ${students.length ? `<em>+${Math.max(weekScore, students.length)}</em>` : `<span class="road-avatar is-empty"></span>`}
          </div>
        </div>
      </article>
    `;
  }).join("");

  const fameList = document.querySelector("#hall-of-fame-list");
  const weeklyProgressList = document.querySelector("#weekly-progress-list");
  const leaderboardList = document.querySelector("#leaderboard-list");
  if (!leaderboardReady) {
    fameList.innerHTML = "";
    weeklyProgressList.innerHTML = "";
    leaderboardList.innerHTML = "";
    return;
  }

  fameList.innerHTML = leaderboard.slice(0, 3).map((student, index) => `
    <article class="fame-card ${student.is_current_student ? "is-you" : ""}">
      <span class="fame-ring">${initialFor(student)}</span>
      <strong>${escapeHtml(student.name)}${student.is_current_student ? " (You)" : ""}</strong>
      <small>Week ${student.current_week} - ${student.weekly_submissions}/14 pods</small>
      <em>${index === 0 ? "Lead performer" : index === 1 ? "Steady mover" : "Rising player"}</em>
    </article>
  `).join("");

  weeklyProgressList.innerHTML = Array.from({ length: Math.min(maxWeek, 8) }, (_, index) => {
    const week = Math.min(maxWeek, 8) - index;
    const students = leaderboard.filter((student) => student.current_week === week);
    const visible = students.slice(0, 3);
    return `
      <article class="weekly-progress-row">
        <strong>Week ${week}</strong>
        <div class="weekly-avatar-stack">
          ${visible.map((student) => `<span class="${student.is_current_student ? "is-you" : ""}">${initialFor(student)}</span>`).join("")}
          <em>+${Math.max(0, students.length - visible.length)}</em>
        </div>
      </article>
    `;
  }).join("");

  leaderboardList.innerHTML = leaderboard.slice(0, 10).map((student) => `
    <article class="leaderboard-row ${student.is_current_student ? "is-you" : ""}">
      <span class="leaderboard-rank">${student.rank}</span>
      <div>
        <strong>${escapeHtml(student.name)}${student.is_current_student ? " (You)" : ""}</strong>
        <small>${escapeHtml(student.instrument || "Guitar")} - Week ${student.current_week || 1}</small>
      </div>
      <span class="leaderboard-score">${student.weekly_submissions || 0}/14 pods</span>
    </article>
  `).join("");
}

function renderCourse() {
  const weekList = document.querySelector("#week-list");
  const progress = calculateProgress();
  const plan = state.coursePlan || defaultState.coursePlan;
  const weeks = plan.weeks?.length ? plan.weeks : courseWeeks;
  document.querySelector("#course-heading").textContent = plan.courseTitle || `${plan.totalWeeks}-week ${state.profile.instrument} course`;
  document.querySelector("#course-progress-percent").textContent = `${progress}%`;
  document.querySelector("#course-summary-weeks").textContent = plan.totalWeeks;
  document.querySelector("#course-summary-sessions").textContent = plan.totalWeeks * 2;
  const dailyUploads = Number(plan.morningRequired) + Number(plan.eveningRequired);
  document.querySelector("#course-summary-practice").textContent = plan.totalWeeks * 7 * dailyUploads;
  document.querySelector("#course-description").textContent = `${plan.practiceMinutes}-minute practice check-ins are set specifically for your learning plan.`;

  weekList.innerHTML = weeks.slice(0, plan.totalWeeks).map((week, index) => {
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
            <strong>Week ${weekNumber}: ${escapeHtml(week.title)}</strong>
            <small>${escapeHtml(week.focus)}</small>
          </span>
          <span class="week-state">${stateLabel}</span>
        </button>
        <div class="week-details">
          <ul>
            ${(week.lessons || []).map((lesson) => `<li>${escapeHtml(lesson)}</li>`).join("")}
          </ul>
          <div class="week-milestone">
            <strong>Weekly milestone</strong>
            <p>${escapeHtml(week.milestone)}</p>
            ${week.practice_instructions || week.practiceInstructions ? `<small>${escapeHtml(week.practice_instructions || week.practiceInstructions)}</small>` : ""}
            ${action}
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function renderCheckins() {
  const practiceMinutes = Number(state.coursePlan?.practiceMinutes || Math.round(state.practiceGate.minDurationSeconds / 60) || 7);
  const targetSeconds = Math.max(60, Math.round(practiceMinutes * 60));
  const requiredPeriods = [
    state.coursePlan?.morningRequired ? "morning" : null,
    state.coursePlan?.eveningRequired ? "evening" : null
  ].filter(Boolean);
  document.querySelector("#practice-plan-title").textContent = requiredPeriods.length
    ? `${requiredPeriods.length === 2 ? "Two videos" : "One video"}. ${practiceMinutes} mins of focus.`
    : "Your teacher has not assigned a daily upload.";
  document.querySelector("#practice-plan-description").textContent = requiredPeriods.length
    ? `Aim for ${practiceMinutes} mins. Even a 1-minute practice can be submitted for review and earns partial progress points.`
    : "You can continue with your course and live sessions.";

  ["morning", "evening"].forEach((period) => {
    const checkin = state.checkins[period];
    const badge = document.querySelector(`#${period}-status-badge`);
    const preview = document.querySelector(`#${period}-preview`);
    const required = period === "morning" ? state.coursePlan?.morningRequired : state.coursePlan?.eveningRequired;
    const removeButton = document.querySelector(`[data-remove-upload="${period}"]`);
    const submitButton = document.querySelector(`[data-submit-upload="${period}"]`);
    document.querySelector(`[data-period="${period}"]`).hidden = !required;
    document.querySelector(`#${period}-practice-requirement`).textContent = `${practiceMinutes}-minute focus goal`;
    removeButton.hidden = checkin.status !== "submitted" || !checkin.id;
    submitButton.hidden = checkin.status !== "selected";

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

    if (temporaryVideoUrls[period]) {
      const duration = Number(checkin.durationSeconds || 0);
      const warning = practiceDurationNote(duration, targetSeconds);
      preview.innerHTML = `
        <video controls playsinline src="${temporaryVideoUrls[period]}"></video>
        <strong>${escapeHtml(checkin.fileName || `${period}-practice.webm`)}</strong>
        <small>${duration ? `${formatPracticeDuration(duration)} selected` : "Video selected"}</small>
        ${warning ? `<small class="practice-duration-warning">${escapeHtml(warning)}</small>` : ""}
      `;
      preview.classList.remove("is-empty");
    } else if (checkin.fileName) {
      const duration = Number(checkin.durationSeconds || checkin.duration_seconds || 0);
      const warning = practiceDurationNote(duration, targetSeconds);
      preview.innerHTML = `
        <span class="video-placeholder-icon">▶</span>
        <strong id="${period}-file-label">${escapeHtml(checkin.fileName)}</strong>
        <small id="${period}-upload-time">${checkin.time ? `Uploaded at ${escapeHtml(checkin.time)}` : "Video selected"}</small>
        ${warning ? `<small class="practice-duration-warning">${escapeHtml(warning)}</small>` : ""}
      `;
      preview.classList.remove("is-empty");
    } else {
      preview.innerHTML = `
        <span class="video-placeholder-icon">+</span>
        <strong id="${period}-file-label">Record or upload a video</strong>
        <small id="${period}-upload-time">${period === "morning" ? "Due by 9:00 AM" : "Due by 8:00 PM"}</small>
      `;
      preview.classList.add("is-empty");
    }
  });

  document.querySelector("#checkin-streak").textContent = state.streak;
  renderHistory();
}

function renderHistory() {
  const rows = state.recentSubmissions.map((submission) => ({
    id: submission.id,
    day: new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short" }).format(new Date(submission.uploaded_at)),
    detail: `${submission.period === "morning" ? "Morning" : "Evening"} · ${Math.round(submission.duration_seconds / 60)} min`,
    status: submission.review_status === "reviewed" ? "Reviewed" : "Waiting review",
    removable: submission.review_status === "pending"
  }));

  document.querySelector("#history-list").innerHTML = rows.length ? rows.map(({ id, day, detail, status, removable }) => `
    <div class="history-row">
      <strong>${day}</strong>
      <span>${detail}</span>
      <span class="tag ${status === "Reviewed" ? "tag-green" : "tag-purple"}">${status}</span>
      ${removable ? `<button class="text-button remove-submission" data-submission-id="${id}">Remove</button>` : ""}
    </div>
  `).join("") : '<p class="empty-state">No practice uploads yet.</p>';
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
  renderPracticeGate();
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

function readVideoDuration(file, objectUrl) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => resolve(Math.round(video.duration));
    video.onerror = () => reject(new Error("The video duration could not be read."));
    video.src = objectUrl;
  });
}

async function acceptPracticeVideo(period, file, knownDurationSeconds = null) {
  if (!file) return false;

  if (!file.type.startsWith("video/")) {
    showToast("Please choose a video file.");
    return false;
  }

  if (temporaryVideoUrls[period]) URL.revokeObjectURL(temporaryVideoUrls[period]);
  temporaryVideoUrls[period] = URL.createObjectURL(file);
  let durationSeconds;
  try {
    durationSeconds = knownDurationSeconds || await readVideoDuration(file, temporaryVideoUrls[period]);
  } catch (error) {
    showToast(error.message);
    return false;
  }

  const targetSeconds = state.practiceGate.minDurationSeconds || 420;
  const minimumSeconds = state.practiceGate.minSubmitSeconds || MIN_SUBMIT_PRACTICE_SECONDS;
  if (durationSeconds < minimumSeconds) {
    showToast("Record or upload at least 1 minute so your teacher has something useful to review.");
    URL.revokeObjectURL(temporaryVideoUrls[period]);
    delete temporaryVideoUrls[period];
    return false;
  }
  selectedPracticeFiles[period] = file;

  state.checkins[period] = {
    status: "selected",
    fileName: file.name,
    time: "",
    durationSeconds
  };

  renderCheckins();
  const warning = practiceDurationNote(durationSeconds, targetSeconds);
  if (warning) showToast(warning);
  return true;
}

async function handleUploadSelection(input) {
  const period = input.dataset.uploadInput;
  const file = input.files?.[0];
  await acceptPracticeVideo(period, file);
  input.value = "";
}

function formatRecorderTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remaining = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
}

function resetRecorderUi() {
  document.querySelector("#practice-recorder-timer").textContent = "00:00";
  document.querySelector("#start-practice-recording").disabled = false;
  document.querySelector("#stop-practice-recording").disabled = true;
  document.querySelector("#use-practice-recording").disabled = true;
  document.querySelector("#recorder-helper").textContent = "Allow camera and microphone, then record your practice video.";
}

function stopRecorderStream() {
  window.clearInterval(recorderTimerId);
  recorderTimerId = 0;
  recorderStream?.getTracks().forEach((track) => track.stop());
  recorderStream = null;
  practiceRecorder = null;
}

function recorderOptions() {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  const supported = typeof MediaRecorder.isTypeSupported === "function"
    ? candidates.find((type) => MediaRecorder.isTypeSupported(type))
    : "";
  return supported ? { mimeType: supported } : {};
}

async function openPracticeRecorder(period) {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    showToast("Recording is not available in this browser. Please use Upload video.");
    return;
  }
  recorderPeriod = period;
  recorderChunks = [];
  recordedPracticeBlob = null;
  recordedPracticeSeconds = 0;
  if (recordedPracticeUrl) URL.revokeObjectURL(recordedPracticeUrl);
  recordedPracticeUrl = "";
  resetRecorderUi();
  document.querySelector("#recorder-period-label").textContent = `${period.toUpperCase()} PRACTICE`;
  const modal = document.querySelector("#practice-recorder-modal");
  modal.showModal();
  try {
    recorderStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const preview = document.querySelector("#practice-recorder-preview");
    preview.srcObject = recorderStream;
    preview.controls = false;
    preview.muted = true;
    document.querySelector("#practice-recorder-empty").hidden = true;
  } catch {
    document.querySelector("#practice-recorder-empty").hidden = false;
    showToast("Camera permission was not available. Use Upload video for now.");
  }
}

function startPracticeRecording() {
  if (!recorderStream) {
    showToast("Camera is not ready yet.");
    return;
  }
  recorderChunks = [];
  practiceRecorder = new MediaRecorder(recorderStream, recorderOptions());
  practiceRecorder.ondataavailable = (event) => {
    if (event.data.size) recorderChunks.push(event.data);
  };
  practiceRecorder.onstop = () => {
    recordedPracticeSeconds = Math.max(1, Math.round((Date.now() - recorderStartedAt) / 1000));
    recordedPracticeBlob = new Blob(recorderChunks, { type: "video/webm" });
    recordedPracticeUrl = URL.createObjectURL(recordedPracticeBlob);
    const preview = document.querySelector("#practice-recorder-preview");
    preview.srcObject = null;
    preview.src = recordedPracticeUrl;
    preview.controls = true;
    preview.muted = false;
    document.querySelector("#use-practice-recording").disabled = false;
    document.querySelector("#recorder-helper").textContent = "Preview your recording. Use it, or close and record again.";
  };
  recorderStartedAt = Date.now();
  practiceRecorder.start();
  document.querySelector("#start-practice-recording").disabled = true;
  document.querySelector("#stop-practice-recording").disabled = false;
  document.querySelector("#use-practice-recording").disabled = true;
  recorderTimerId = window.setInterval(() => {
    document.querySelector("#practice-recorder-timer").textContent =
      formatRecorderTime((Date.now() - recorderStartedAt) / 1000);
  }, 500);
}

function stopPracticeRecording() {
  if (!practiceRecorder || practiceRecorder.state === "inactive") return;
  practiceRecorder.stop();
  window.clearInterval(recorderTimerId);
  document.querySelector("#stop-practice-recording").disabled = true;
}

async function usePracticeRecording() {
  if (!recordedPracticeBlob || !recorderPeriod) return;
  const file = new File([recordedPracticeBlob], `${recorderPeriod}-practice-recording.webm`, { type: "video/webm" });
  const accepted = await acceptPracticeVideo(recorderPeriod, file, recordedPracticeSeconds);
  if (accepted) closePracticeRecorder();
}

function closePracticeRecorder() {
  if (practiceRecorder && practiceRecorder.state !== "inactive") practiceRecorder.stop();
  stopRecorderStream();
  const preview = document.querySelector("#practice-recorder-preview");
  preview.pause();
  preview.srcObject = null;
  preview.removeAttribute("src");
  document.querySelector("#practice-recorder-empty").hidden = false;
  document.querySelector("#practice-recorder-modal").close();
}

async function submitUpload(period) {
  const button = document.querySelector(`[data-submit-upload="${period}"]`);
  button.disabled = true;
  let backendWarning = "";
  try {
    if (backendConnected) {
      const uploadedVideo = await uploadPracticeVideoIfAvailable(period, selectedPracticeFiles[period]);
      const submission = await apiRequest("/api/student/me/practice-submissions", {
        method: "POST",
        body: JSON.stringify({
          period,
          fileName: state.checkins[period].fileName,
          durationSeconds: state.checkins[period].durationSeconds,
          storageKey: uploadedVideo.storageKey || "",
          storageMode: uploadedVideo.storageMode || "metadata-only-mvp"
        })
      });
      backendWarning = uploadedVideo.warning || submission.warning || "";
    }

    const now = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(new Date());
    state.checkins[period].status = "submitted";
    state.checkins[period].time = now;
    if (period === "evening") state.streak = Math.max(state.streak, 7);
    saveState();
    button.hidden = true;
    if (temporaryVideoUrls[period]) URL.revokeObjectURL(temporaryVideoUrls[period]);
    delete temporaryVideoUrls[period];
    delete selectedPracticeFiles[period];
    await syncStudentFromBackend();
    showToast(backendWarning || (period === "morning"
      ? "Morning Ninja unlocked. Course energy is building."
      : "Evening Finisher unlocked. Strong close today."));
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
}

async function removePendingSubmission(submissionId) {
  if (!submissionId) return;
  try {
    await apiRequest(`/api/student/me/practice-submissions/${submissionId}`, {
      method: "DELETE"
    });
    await syncStudentFromBackend();
    showToast("Pending practice upload removed.");
  } catch (error) {
    showToast(error.message);
  }
}

async function openClassroom(roomName) {
  const modal = document.querySelector("#classroom-modal");
  const frame = document.querySelector("#classroom-frame");
  const liveRoom = document.querySelector("#open-live-room");
  const safeRoom = `ots-${state.profile.email}-${roomName || "classroom"}`.replace(/[^a-zA-Z0-9_-]/g, "-");
  const roomUrl = `https://meet.jit.si/${safeRoom}#config.prejoinPageEnabled=false`;
  liveRoom.href = roomUrl;
  frame.hidden = true;
  frame.src = "about:blank";
  modal.showModal();

  try {
    classroomStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.querySelector("#classroom-preview").srcObject = classroomStream;
    document.querySelector("#classroom-empty").hidden = true;
    classroomMicEnabled = true;
    classroomCameraEnabled = true;
  } catch {
    document.querySelector("#classroom-empty").hidden = false;
    showToast("Camera preview is unavailable. You can still enter the live room.");
  }
}

function closeClassroom() {
  if (classroomStream) {
    classroomStream.getTracks().forEach((track) => track.stop());
    classroomStream = null;
  }
  const frame = document.querySelector("#classroom-frame");
  frame.src = "about:blank";
  frame.hidden = true;
  document.querySelector("#classroom-modal").close();
}

async function completeWeek(weekNumber) {
  const totalWeeks = Number(state.coursePlan?.totalWeeks || 12);
  if (!state.completedWeeks.includes(weekNumber)) {
    state.completedWeeks.push(weekNumber);
    state.completedWeeks.sort((a, b) => a - b);
  }
  if (weekNumber === state.currentWeek && state.currentWeek < totalWeeks) {
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
  const originalButtonText = button.textContent;
  pendingLoginEmail = document.querySelector("#student-login-email").value.trim().toLowerCase();
  button.disabled = true;
  button.textContent = "Sending code...";
  form.setAttribute("aria-busy", "true");
  document.querySelector("#student-auth-error").hidden = true;
  document.querySelector("#student-admission-card").hidden = true;
  try {
    const result = await apiRequest("/api/student-auth/request-otp", {
      method: "POST",
      body: JSON.stringify({ email: pendingLoginEmail })
    });
    pendingOtpSessionId = result.sessionId || "";
    document.querySelector("#otp-delivery-message").textContent =
      result.deliveryMode === "screen" ? "Temporary code for" : "Code sent to";
    document.querySelector("#student-otp-email").textContent = pendingLoginEmail;
    setAuthStep("otp");
    if (result.developmentOtp) {
      document.querySelector("#development-otp-code").textContent = result.developmentOtp;
      document.querySelector("#development-otp").hidden = false;
    }
    document.querySelector("#student-login-otp").focus();
  } catch (error) {
    pendingOtpSessionId = "";
    if (error.code === "student_not_found") {
      showAdmissionInvite(pendingLoginEmail);
    } else {
      showAuthError(error.message);
    }
  } finally {
    button.disabled = false;
    button.textContent = originalButtonText;
    form.removeAttribute("aria-busy");
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
      body: JSON.stringify({ email: pendingLoginEmail, sessionId: pendingOtpSessionId, otp })
    });
    studentToken = result.token;
    localStorage.setItem(STUDENT_TOKEN_KEY, studentToken);
    state = structuredClone(defaultState);
    backendFeedback = null;
    setAuthVisible(false);
    await syncStudentFromBackend();
    showFirstLoginCelebration(result.student.name, result.student.email || pendingLoginEmail);
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
  pendingOtpSessionId = "";
  document.querySelector("#student-login-email").value = "";
  document.querySelector("#student-login-otp").value = "";
  setAuthStep("email");
  setAuthVisible(true);
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.view));
  });

  document.querySelectorAll("[data-checkin-period]").forEach((button) => {
    button.addEventListener("click", () => openCheckinPeriod(button.dataset.checkinPeriod));
  });

  document.querySelector("#view-leaderboard-button")?.addEventListener("click", () => {
    const button = document.querySelector("#view-leaderboard-button");
    if (button?.dataset.leaderboardReady !== "true") {
      showToast(`Leaderboard opens when the batch reaches ${LEADERBOARD_MIN_STUDENTS} learners. Until then, your dashboard stays focused on your own progress.`);
      return;
    }
    document.querySelector("#leaderboard-list")?.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  document.querySelector("#student-email-form").addEventListener("submit", requestStudentOtp);
  document.querySelector("#student-otp-form").addEventListener("submit", verifyStudentOtp);
  document.querySelector("#student-change-email").addEventListener("click", () => {
    pendingLoginEmail = "";
    pendingOtpSessionId = "";
    document.querySelector("#student-login-otp").value = "";
    setAuthStep("email");
  });
  document.querySelector("#student-login-email").addEventListener("input", () => {
    document.querySelector("#student-auth-error").hidden = true;
    document.querySelector("#student-admission-card").hidden = true;
  });

  document.querySelectorAll("[data-upload-input]").forEach((input) => {
    input.addEventListener("change", () => handleUploadSelection(input));
  });

  document.querySelectorAll("[data-record-practice]").forEach((button) => {
    button.addEventListener("click", () => openPracticeRecorder(button.dataset.recordPractice));
  });

  document.querySelectorAll("[data-submit-upload]").forEach((button) => {
    button.addEventListener("click", () => submitUpload(button.dataset.submitUpload));
  });

  document.addEventListener("click", async (event) => {
    const periodRemoveButton = event.target.closest("[data-remove-upload]");
    if (periodRemoveButton) {
      await removePendingSubmission(state.checkins[periodRemoveButton.dataset.removeUpload]?.id);
      return;
    }

    const submissionRemoveButton = event.target.closest(".remove-submission");
    if (submissionRemoveButton) {
      await removePendingSubmission(Number(submissionRemoveButton.dataset.submissionId));
      return;
    }

    const classroomButton = event.target.closest(".join-session");
    if (classroomButton) openClassroom(classroomButton.dataset.room);

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

  document.querySelectorAll(".open-help-call").forEach((button) => {
    button.addEventListener("click", () => openHelpCallModal());
  });

  document.querySelector("#practice-gate-upload").addEventListener("click", () => {
    document.querySelector("#practice-gate").hidden = true;
    openCheckinPeriod(state.practiceGate.activePeriod || "morning");
  });

  document.querySelector("#practice-gate-snooze").addEventListener("click", () => {
    sessionStorage.setItem("otsPracticeGateSnoozedUntil", String(Date.now() + 10 * 60 * 1000));
    document.querySelector("#practice-gate").hidden = true;
    navigate("checkin", true);
    showToast("Reminder snoozed for 10 minutes. Course stays paused until practice is submitted.");
  });

  document.querySelector("#start-practice-recording").addEventListener("click", startPracticeRecording);
  document.querySelector("#stop-practice-recording").addEventListener("click", stopPracticeRecording);
  document.querySelector("#use-practice-recording").addEventListener("click", usePracticeRecording);
  document.querySelector("#close-practice-recorder").addEventListener("click", closePracticeRecorder);
  document.querySelector("#welcome-modal-close").addEventListener("click", () => {
    document.querySelector("#welcome-modal").close();
  });

  document.querySelector("#close-classroom").addEventListener("click", closeClassroom);
  document.querySelector("#toggle-classroom-mic").addEventListener("click", (event) => {
    classroomMicEnabled = !classroomMicEnabled;
    classroomStream?.getAudioTracks().forEach((track) => {
      track.enabled = classroomMicEnabled;
    });
    event.currentTarget.textContent = classroomMicEnabled ? "Mute microphone" : "Unmute microphone";
  });
  document.querySelector("#toggle-classroom-camera").addEventListener("click", (event) => {
    classroomCameraEnabled = !classroomCameraEnabled;
    classroomStream?.getVideoTracks().forEach((track) => {
      track.enabled = classroomCameraEnabled;
    });
    event.currentTarget.textContent = classroomCameraEnabled ? "Turn camera off" : "Turn camera on";
  });
  document.querySelector("#open-live-room").addEventListener("click", (event) => {
    event.preventDefault();
    const frame = document.querySelector("#classroom-frame");
    frame.src = event.currentTarget.href;
    frame.hidden = false;
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

  document.querySelector("#join-help-classroom").addEventListener("click", () => {
    openClassroom(`ots-help-call-${state.helpCall?.id || "room"}`);
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
    showToast(state.practiceGate.locked
      ? "Home, Check-in, Feedback and Profile are open. Course unlocks after practice."
      : `Your practice is on track. ${teacherIdentity().firstName} will review new uploads here.`);
  });

  document.querySelector("#student-logout").addEventListener("click", logoutStudent);
}

async function init() {
  bindEvents();
  renderAll();
  if (studentToken) {
    setAuthVisible(false);
    await syncStudentFromBackend();
  } else {
    setAuthStep("email");
    setAuthVisible(true);
  }

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
}

init();
