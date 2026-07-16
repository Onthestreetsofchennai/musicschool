const STORAGE_KEY = "musicSchoolOTSStateV1";
const STUDENT_TOKEN_KEY = "otsStudentToken";
const WELCOME_SEEN_PREFIX = "otsWelcomeSeen:";
const WORKER_API_ORIGIN = "https://music-school-ots.sharoncornerstone56.workers.dev";
const GOOGLE_MEET_CREATE_URL = "https://meet.google.com/new";
const GOOGLE_MEET_NICKNAME_PREFIX = "ots-music-school-student";
const API_ORIGIN = (() => {
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".workers.dev")) return "";
  return WORKER_API_ORIGIN;
})();
const MIN_SUBMIT_PRACTICE_SECONDS = 60;
const LEADERBOARD_MIN_STUDENTS = 30;
const DAILY_CHECKIN_PERIOD = "morning";
const DAILY_MISSION_MINUTES = 10;
const DAILY_CHECKIN_TARGET_SECONDS = 60;
const TEACHER_REVIEW_HOURS = 12;

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
    id: 0,
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
      status: "pending",
      fileName: "",
      time: ""
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
    activePeriod: DAILY_CHECKIN_PERIOD,
    missingPeriods: [],
    minDurationSeconds: DAILY_MISSION_MINUTES * 60,
    minSubmitSeconds: MIN_SUBMIT_PRACTICE_SECONDS,
    message: ""
  },
  coursePlan: {
    courseTitle: "12-week Guitar course",
    totalWeeks: 12,
    practiceMinutes: DAILY_MISSION_MINUTES,
    morningRequired: true,
    eveningRequired: false,
    weeks: courseWeeks
  },
  upcomingSessions: [],
  recentSubmissions: [],
  helpCall: null,
  leaderboard: []
};

const feedbackItems = [
  {
    period: "Daily check-in",
    time: "Today, 9:24 AM",
    title: "Cleaner chord shapes today",
    message: "Good timing. Your G and D shapes are much cleaner. Keep the same relaxed wrist position in tomorrow's check-in.",
    inputs: [
      "Slow the G-to-C transition down.",
      "Keep your thumb behind the neck.",
      "Repeat bars 5-8 three times."
    ]
  },
  {
    period: "Daily check-in",
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
let pendingFeatureTour = false;
let featureTourIndex = 0;
let toastTimer;
const temporaryVideoUrls = {};
const selectedPracticeFiles = {};
const uploadProgress = {};
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

const featureTourSteps = [
  {
    view: "home",
    selector: '[data-view="home"]',
    title: "Here is your Home.",
    copy: "This is your weekly command centre: goal progress, today's quest, live sessions and teacher notes."
  },
  {
    view: "checkin",
    selector: '[data-view="checkin"]',
    title: "Here is Check-in.",
    copy: "Do the guided 10-minute mission, then record or upload one short daily check-in for your teacher."
  },
  {
    view: "course",
    selector: '[data-view="course"]',
    title: "Here is your Course.",
    copy: "Your lessons and weekly milestones live here. When practice is due, the course waits until you submit."
  },
  {
    view: "feedback",
    selector: '[data-view="feedback"]',
    title: "Here is Feedback.",
    copy: "Teacher corrections, notes, and help-call updates will collect here after every review."
  },
  {
    view: "profile",
    selector: '[data-view="profile"]',
    title: "Here is Profile.",
    copy: "Manage your learning goal and reminders here so the app stays personal to you."
  }
];

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

function uploadVideoWithProgress(url, file, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiEndpoint(url));
    if (studentToken) xhr.setRequestHeader("Authorization", `Bearer ${studentToken}`);
    xhr.setRequestHeader("Content-Type", file.type || "video/webm");

    xhr.upload.onloadstart = () => onProgress({ percent: 2, label: "Preparing secure upload..." });
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        onProgress({ percent: 15, label: "Uploading video..." });
        return;
      }
      const percent = Math.max(3, Math.min(96, Math.round((event.loaded / event.total) * 96)));
      onProgress({ percent, label: `Uploading video ${percent}%` });
    };
    xhr.upload.onload = () => onProgress({ percent: 98, label: "Saving video to Drive..." });
    xhr.onerror = () => reject(new Error("Video upload could not reach the school server. Please try again with a shorter video or refresh the app once."));
    xhr.onload = () => {
      let payload = {};
      try {
        payload = JSON.parse(xhr.responseText || "{}");
      } catch {
        reject(new Error("The school server replied with an unreadable upload response. Please try again."));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload);
        return;
      }
      reject(new Error(payload.error || "The practice video could not be uploaded."));
    };
    xhr.send(file);
  });
}

async function uploadPracticeVideoIfAvailable(period, file, onProgress = () => {}) {
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

  try {
    return await uploadVideoWithProgress(config.uploadUrl, file, onProgress);
  } catch (error) {
    if (error.message.includes("practice video") || error.message.includes("school server")) throw error;
    throw new Error(error.message || "The practice video could not be uploaded.");
  }
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
    state.profile.id = data.profile.id || state.profile.id || 0;
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
      practiceMinutes: DAILY_MISSION_MINUTES,
      morningRequired: true,
      eveningRequired: false,
      weeks: data.coursePlan.weeks || courseWeeks
    } : structuredClone(defaultState.coursePlan);
    state.upcomingSessions = data.upcomingSessions || [];
    state.recentSubmissions = data.recentSubmissions || [];
    state.leaderboard = data.leaderboard || [];
    state.checkins = {
      morning: { status: "pending", fileName: "", time: "" },
      evening: { status: "pending", fileName: "", time: "" }
    };

    const todaySubmission = (data.todaySubmissions || []).find((item) => item.period === DAILY_CHECKIN_PERIOD) ||
      (data.todaySubmissions || [])[0];
    if (todaySubmission) {
      state.checkins[DAILY_CHECKIN_PERIOD] = {
        id: todaySubmission.id,
        status: todaySubmission.review_status === "reviewed" ? "reviewed" : "submitted",
        fileName: todaySubmission.file_name,
        time: new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(new Date(todaySubmission.uploaded_at)),
        durationSeconds: Number(todaySubmission.duration_seconds || 0),
        uploadedAt: todaySubmission.uploaded_at
      };
    }

    const hasDailySubmission = Boolean(todaySubmission);
    state.practiceGate = {
      ...(data.practiceGate || {}),
      locked: !hasDailySubmission,
      activePeriod: DAILY_CHECKIN_PERIOD,
      missingPeriods: hasDailySubmission ? [] : [DAILY_CHECKIN_PERIOD],
      minDurationSeconds: DAILY_MISSION_MINUTES * 60,
      minSubmitSeconds: MIN_SUBMIT_PRACTICE_SECONDS,
      message: hasDailySubmission
        ? "Today's guided mission is complete."
        : "Complete one guided 10-minute mission, then upload one short 30-60 second check-in."
    };

    backendFeedback = data.feedback.map((item) => ({
      period: "Daily check-in",
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
  const target = Math.round(Number(targetSeconds) || DAILY_CHECKIN_TARGET_SECONDS);
  if (!duration || duration >= target) return "";
  return `Short check-in accepted: ${formatPracticeDuration(duration)} uploaded. Aim for 30-60 seconds so your teacher can review one focused point.`;
}

function dailyStatus() {
  const primary = state.checkins?.[DAILY_CHECKIN_PERIOD] || {};
  const fallback = state.checkins?.evening || {};
  return ["submitted", "reviewed", "selected"].includes(primary.status)
    ? primary
    : ["submitted", "reviewed", "selected"].includes(fallback.status)
      ? fallback
      : primary;
}

function dailySubmitted() {
  return ["submitted", "reviewed"].includes(dailyStatus().status);
}

function expectedReviewCopy(uploadedAt = null) {
  const base = uploadedAt ? new Date(uploadedAt) : new Date();
  const expected = new Date(base.getTime() + TEACHER_REVIEW_HOURS * 60 * 60 * 1000);
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "2-digit", hour12: false }).format(expected));
  if (hour >= 22) expected.setHours(11, 0, 0, 0);
  if (hour < 9) expected.setHours(11, 0, 0, 0);
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(expected);
}

function dailyMissionFromWeek() {
  const week = currentWeekPlan();
  return {
    title: week.weeklyGoal || "Complete today's guided mission.",
    instruction: week.teacherNotes || week.practice_instructions || week.practiceInstructions || week.focus ||
      "Practise slowly, record your cleanest 30-60 seconds, and send it to your teacher.",
    focus: week.focus || `Week ${state.currentWeek} ${state.profile.instrument} focus`,
    targetSkill: week.milestone || week.title || "Clean rhythm and chord control",
    reference: (week.lessons || [])[0] || "Use your teacher's last correction as reference.",
    due: "Before 8:00 PM",
    minutes: Number(state.coursePlan?.practiceMinutes || DAILY_MISSION_MINUTES) || DAILY_MISSION_MINUTES
  };
}

function setUploadProgress(period, percent, label) {
  const safePercent = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  const current = uploadProgress[period];
  if (current && current.percent === safePercent && current.label === label) return;
  uploadProgress[period] = { percent: safePercent, label };
  renderCheckins();
}

function clearUploadProgress(period) {
  if (!uploadProgress[period]) return;
  delete uploadProgress[period];
  renderCheckins();
}

function uploadProgressHtml(period) {
  const progress = uploadProgress[period];
  if (!progress) return "";
  const percent = Math.max(0, Math.min(100, Math.round(progress.percent)));
  return `
    <div class="upload-progress" role="status" aria-live="polite">
      <div class="upload-progress-row">
        <strong>${escapeHtml(progress.label)}</strong>
        <span>${percent}%</span>
      </div>
      <div class="upload-progress-track"><span style="width: ${percent}%"></span></div>
      <small>Keep this page open until the upload completes.</small>
    </div>
  `;
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
  pendingFeatureTour = true;
  const firstName = (studentName || "Student").trim().split(/\s+/)[0] || "Student";
  document.querySelector("#welcome-modal-title").textContent =
    `${firstName}, congrats on choosing to learn a new skill.`;
  document.querySelector("#welcome-modal").showModal();
}

function clearFeatureTourHighlight() {
  document.querySelectorAll(".tour-highlight").forEach((element) => {
    element.classList.remove("tour-highlight");
  });
}

function showFeatureTourStep() {
  const step = featureTourSteps[featureTourIndex];
  if (!step) return;
  navigate(step.view, true);
  clearFeatureTourHighlight();
  const target = document.querySelector(step.selector);
  if (target) target.classList.add("tour-highlight");
  document.querySelector("#feature-tour-title").textContent = step.title;
  document.querySelector("#feature-tour-copy").textContent = step.copy;
  document.querySelector("#feature-tour-next").textContent =
    featureTourIndex === featureTourSteps.length - 1 ? "Finish tour" : "Next feature";
}

function startFeatureTour() {
  featureTourIndex = 0;
  document.querySelector("#feature-tour").hidden = false;
  showFeatureTourStep();
}

function endFeatureTour() {
  document.querySelector("#feature-tour").hidden = true;
  clearFeatureTourHighlight();
  navigate("home", true);
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

  document.querySelector(".practice-gate-icon").textContent = DAILY_MISSION_MINUTES;
  document.querySelector("#practice-gate-title").textContent = "Complete today's mission";
  document.querySelector("#practice-gate-message").textContent = state.practiceGate.message ||
    "Finish the guided 10-minute practice, then upload one short 30-60 second check-in.";
}

function calculateProgress() {
  const totalWeeks = Number(state.coursePlan?.totalWeeks || 12);
  const completedProgress = Math.round((state.completedWeeks.length / totalWeeks) * 100);
  const weekPositionProgress = Math.round((Math.max(0, Number(state.currentWeek || 1) - 1) / totalWeeks) * 100);
  return Math.min(100, Math.max(completedProgress, weekPositionProgress));
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
}

function currentWeekPlan() {
  const plan = state.coursePlan || defaultState.coursePlan;
  const weeks = plan.weeks?.length ? plan.weeks : courseWeeks;
  const weekNumber = Math.max(1, Number(state.currentWeek || 1));
  const week = weeks[weekNumber - 1] || weeks[0] || {};
  const weeklyGoal = week.weekly_goal || week.weeklyGoal || week.milestone || week.title || "Complete this week's practice goal.";
  const teacherNotes = week.teacher_notes || week.teacherNotes || week.practice_instructions || week.practiceInstructions || "";
  return {
    ...week,
    weekNumber,
    weeklyGoal,
    teacherNotes,
    targetPods: clampNumber(week.target_pods || week.targetPods || 4, 1, 28)
  };
}

function periodSubmitted(period) {
  return ["submitted", "reviewed"].includes(state.checkins?.[period]?.status);
}

function weeklyGoalSummary() {
  const week = currentWeekPlan();
  const targetPods = week.targetPods;
  const currentWeek = Number(state.currentWeek || 1);
  const submissionKeys = new Set();
  (state.recentSubmissions || []).forEach((submission) => {
    if (Number(submission.course_week || currentWeek) !== currentWeek) return;
    if (!["pending", "reviewed"].includes(String(submission.review_status || "pending"))) return;
    submissionKeys.add(submission.id || `${submission.period}-${submission.uploaded_at}`);
  });
  const todayCount = dailySubmitted() ? 1 : 0;
  const completedPods = Math.min(targetPods, Math.max(submissionKeys.size, todayCount));
  const percent = Math.min(100, Math.round((completedPods / targetPods) * 100));
  return {
    week,
    targetPods,
    completedPods,
    percent
  };
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
  const goalSummary = weeklyGoalSummary();
  const mission = dailyMissionFromWeek();
  const name = state.profile.name || "Student";
  const initial = name.trim().charAt(0).toUpperCase() || "S";
  const submitted = dailySubmitted();
  const daily = dailyStatus();

  const heroInstrument = document.querySelector("#hero-instrument");
  if (heroInstrument) heroInstrument.textContent = state.profile.instrument.toUpperCase();
  document.querySelector("#hero-week").textContent = state.currentWeek;
  document.querySelector("#orbit-week").textContent = state.currentWeek;
  document.querySelector("#hero-goal").textContent = goalSummary.week.weeklyGoal;
  document.querySelector("#hero-progress-text").textContent = `${goalSummary.percent}%`;
  document.querySelector("#hero-progress-bar").style.width = `${goalSummary.percent}%`;
  document.querySelector("#dashboard-week-goal").textContent = goalSummary.week.weeklyGoal;
  document.querySelector("#dashboard-week-focus").textContent = goalSummary.week.focus ||
    `Week ${state.currentWeek} focus for ${state.profile.instrument}.`;
  document.querySelector("#dashboard-week-progress-text").textContent = `${goalSummary.percent}%`;
  document.querySelector("#dashboard-week-progress-bar").style.width = `${goalSummary.percent}%`;
  document.querySelector("#dashboard-week-pods").textContent =
    `${goalSummary.completedPods} of ${goalSummary.targetPods} daily check-ins completed`;
  document.querySelector("#dashboard-teacher-notes").textContent = goalSummary.week.teacherNotes ||
    "Your teacher will add personal notes here for this week's practice.";
  document.querySelector("#streak-count").textContent = state.streak;
  document.querySelector("#review-count").textContent = `${state.reviews} received`;
  document.querySelector("#avatar-button").textContent = initial;
  document.querySelector("#home-morning-status").textContent = submitted
    ? (daily.status === "reviewed" ? "Reviewed by your teacher" : `Waiting for review. Expected before ${expectedReviewCopy(daily.uploadedAt)}`)
    : `${mission.title} - Due ${mission.due}`;
  document.querySelector("#daily-ring").textContent = `${submitted ? 1 : 0}/1`;

  const morningItem = document.querySelector("#home-morning-item");
  const eveningItem = document.querySelector("#home-evening-item");
  morningItem.classList.toggle("is-complete", submitted);
  morningItem.querySelector(".check-icon").textContent = submitted ? "✓" : "1";
  morningItem.querySelector("strong").textContent = submitted ? "Daily check-in submitted" : "Today's mission check-in";
  morningItem.querySelector(".daily-time").textContent = "30-60 sec";
  eveningItem.hidden = true;
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
          <button class="button button-secondary join-session" data-room="${escapeHtml(session.meeting_room || "")}" data-student-id="${escapeHtml(session.student_id || state.profile.id || "")}">Join Google Meet</button>
        </article>
      `;
    }).join("")
    : '<p class="empty-state">No upcoming live sessions.</p>';
  renderGamification();
}

function renderGamification() {
  const firstName = (state.profile.name || "Student").trim().split(/\s+/)[0] || "Student";
  const goalSummary = weeklyGoalSummary();
  const mission = dailyMissionFromWeek();
  const submitted = dailySubmitted();

  document.querySelector("#welcome-quest-title").textContent = `${firstName}, your guitar journey has started.`;
  document.querySelector("#welcome-quest-copy").textContent = state.practiceGate.locked
    ? `Start the guided ${mission.minutes}-minute mission, then upload one short check-in.`
    : "Performer path unlocked. Tiny practice, repeated daily, becomes stage confidence.";

  const missionPod = document.querySelector(`[data-quest-pod="${DAILY_CHECKIN_PERIOD}"]`);
  const missionStatus = document.querySelector("#morning-quest-status");
  const eveningPod = document.querySelector('[data-quest-pod="evening"]');
  if (missionPod) {
    missionPod.classList.toggle("is-complete", submitted);
    missionPod.querySelector("strong").textContent = submitted ? "Daily check-in complete" : mission.title;
  }
  if (missionStatus) {
    missionStatus.textContent = submitted
      ? `Waiting for teacher review before ${expectedReviewCopy(dailyStatus().uploadedAt)}`
      : `Do ${mission.minutes} mins, then upload your best 30-60 seconds`;
  }
  if (eveningPod) eveningPod.hidden = true;

  const weeklyActivityTarget = goalSummary.targetPods;
  const localPracticeCount = goalSummary.completedPods;
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
      ? "Do not compete with others. See where you stand, celebrate the group progress, and keep moving one check-in at a time."
      : "Move one daily check-in forward at a time. This path shows your weekly activity and the next stage you are working toward.";
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
      ? "Start with one daily check-in today. Your performer path wakes up after the first upload."
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
      <small>Week ${student.current_week} - ${student.weekly_submissions}/${weeklyActivityTarget} check-ins</small>
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
      <span class="leaderboard-score">${student.weekly_submissions || 0}/${weeklyActivityTarget} check-ins</span>
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
  document.querySelector("#course-summary-practice").textContent = plan.totalWeeks * 7;
  document.querySelector("#course-description").textContent = `One guided ${DAILY_MISSION_MINUTES}-minute mission per day, followed by one short check-in for your teacher.`;

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
            <strong>Week goal</strong>
            <p>${escapeHtml(week.weekly_goal || week.weeklyGoal || week.milestone)}</p>
            <small>${escapeHtml(week.target_pods || week.targetPods || 4)} target daily check-ins this week</small>
            ${week.teacher_notes || week.teacherNotes ? `<small class="week-teacher-note">Teacher notes: ${escapeHtml(week.teacher_notes || week.teacherNotes)}</small>` : ""}
            ${week.milestone ? `<small>Milestone: ${escapeHtml(week.milestone)}</small>` : ""}
            ${week.practice_instructions || week.practiceInstructions ? `<small>${escapeHtml(week.practice_instructions || week.practiceInstructions)}</small>` : ""}
            ${action}
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function renderCheckins() {
  const mission = dailyMissionFromWeek();
  const targetSeconds = DAILY_CHECKIN_TARGET_SECONDS;
  document.querySelector("#practice-plan-title").textContent = "One guided mission. One short check-in.";
  document.querySelector("#practice-plan-description").textContent =
    `Practise for ${mission.minutes} minutes, then upload your best 30-60 seconds. Longer videos are okay, but only one daily check-in is required.`;
  const teacherFocus = document.querySelector(".teacher-focus p");
  if (teacherFocus) teacherFocus.textContent = mission.instruction;

  ["morning", "evening"].forEach((period) => {
    const checkin = state.checkins[period];
    const badge = document.querySelector(`#${period}-status-badge`);
    const preview = document.querySelector(`#${period}-preview`);
    const required = period === DAILY_CHECKIN_PERIOD;
    const removeButton = document.querySelector(`[data-remove-upload="${period}"]`);
    const submitButton = document.querySelector(`[data-submit-upload="${period}"]`);
    const progress = uploadProgress[period];
    document.querySelector(`[data-period="${period}"]`).hidden = !required;
    const eyebrow = document.querySelector(`[data-period="${period}"] .upload-heading .eyebrow`);
    if (eyebrow) eyebrow.textContent = "DAILY CHECK-IN";
    document.querySelector(`#${period}-practice-requirement`).textContent = "30-60 second practice check-in";
    removeButton.hidden = checkin.status !== "submitted" || !checkin.id;
    submitButton.hidden = checkin.status !== "selected" && !progress;
    submitButton.disabled = Boolean(progress);
    submitButton.textContent = progress ? "Uploading..." : "Submit daily check-in";

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
        ${uploadProgressHtml(period)}
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
        ${uploadProgressHtml(period)}
      `;
      preview.classList.remove("is-empty");
    } else {
      preview.innerHTML = `
        <span class="video-placeholder-icon">+</span>
        <strong id="${period}-file-label">Record or upload your check-in</strong>
        <small id="${period}-upload-time">Due by 8:00 PM</small>
        ${uploadProgressHtml(period)}
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

  const targetSeconds = DAILY_CHECKIN_TARGET_SECONDS;
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
  if (uploadProgress[period]) return;
  button.disabled = true;
  let backendWarning = "";
  try {
    setUploadProgress(period, 2, "Preparing secure upload...");
    if (backendConnected) {
      const uploadedVideo = await uploadPracticeVideoIfAvailable(period, selectedPracticeFiles[period], ({ percent, label }) => {
        setUploadProgress(period, percent, label);
      });
      setUploadProgress(period, 99, "Finalising practice check-in...");
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

    setUploadProgress(period, 100, "Practice submitted.");
    const now = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(new Date());
    state.checkins[period].status = "submitted";
    state.checkins[period].time = now;
    state.streak = Math.max(state.streak, 7);
    saveState();
    button.hidden = true;
    if (temporaryVideoUrls[period]) URL.revokeObjectURL(temporaryVideoUrls[period]);
    delete temporaryVideoUrls[period];
    delete selectedPracticeFiles[period];
    await syncStudentFromBackend();
    clearUploadProgress(period);
    showToast(backendWarning || `Daily check-in submitted. Your teacher will review it before ${expectedReviewCopy()}.`);
  } catch (error) {
    setUploadProgress(period, 0, "Upload failed. Please try again.");
    showToast(error.message);
    window.setTimeout(() => clearUploadProgress(period), 2400);
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

async function openClassroom(roomName, studentId = 0) {
  const modal = document.querySelector("#classroom-modal");
  const frame = document.querySelector("#classroom-frame");
  const liveRoom = document.querySelector("#open-live-room");
  const roomUrl = liveClassroomUrl(roomName, studentId);
  liveRoom.href = roomUrl;
  frame.hidden = true;
  frame.src = "about:blank";
  modal.showModal();
  if (roomUrl.includes("/lookup/")) {
    showToast("Opening the standard Meet room for this student. Teacher and student use the same link.");
  } else if (roomUrl === GOOGLE_MEET_CREATE_URL) {
    showToast("No Google Meet link is saved yet. Add the Meet link in the session from admin.");
  }

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
    if (classroomButton) {
      openClassroom(classroomButton.dataset.room, classroomButton.dataset.studentId || state.profile.id);
      return;
    }

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
    openCheckinPeriod(DAILY_CHECKIN_PERIOD);
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
    if (pendingFeatureTour) {
      pendingFeatureTour = false;
      startFeatureTour();
    }
  });
  document.querySelector("#feature-tour-next").addEventListener("click", () => {
    if (featureTourIndex >= featureTourSteps.length - 1) {
      endFeatureTour();
      return;
    }
    featureTourIndex += 1;
    showFeatureTourStep();
  });
  document.querySelector("#feature-tour-skip").addEventListener("click", endFeatureTour);

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
  document.querySelector("#open-live-room").addEventListener("click", () => {
    showToast("Opening Google Meet. Use the same link as your teacher.");
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
    openClassroom(standardGoogleMeetLink(state.profile.id), state.profile.id);
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
