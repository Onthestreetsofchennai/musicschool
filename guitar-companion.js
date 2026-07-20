(() => {
  const IS_ADMIN = location.pathname.includes("/admin");
  const STORAGE_KEY = `otsGuitarCompanion:${IS_ADMIN ? "admin" : "student"}`;
  const EMOTE_STORAGE_KEY = `${STORAGE_KEY}:emoteIndex`;
  const assetUrl = (fileName) => new URL(fileName, document.currentScript?.src || location.href).href;
  const SAD_INTRO_URL = assetUrl("guitar-duo-sad-intro.png");
  const SAD_IDLE_URL = assetUrl("guitar-duo-sad-idle.png");
  const CELEBRATION_URL = assetUrl("guitar-duo-celebration.png");
  const COMPLETE_IDLE_URL = assetUrl("guitar-duo-complete-idle.png");
  const messages = [
    "One calm minute can start a great riff.",
    "Small practice. Big stage energy.",
    "Keep the rhythm moving today.",
    "Your next clean chord is closer than you think.",
    "Ready for your next riff?"
  ];
  const emotes = [
    { id: "victory-jump", label: "Victory Jump", message: "Mission complete! Jump into your next riff." },
    { id: "guitar-solo", label: "Guitar Solo", message: "Guitar solo unlocked! Brilliant practice." },
    { id: "riff-dance", label: "Riff Dance", message: "Riff dance! Your consistency is growing." },
    { id: "power-spin", label: "Power Spin", message: "Power chord celebration! Keep the rhythm moving." },
    { id: "stage-bow", label: "Stage Bow", message: "Take a stage bow. You showed up and did the work." }
  ];

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
  }

  function install() {
    if (document.querySelector("#ots-guitar-companion")) return;
    const companion = document.createElement("button");
    companion.id = "ots-guitar-companion";
    companion.className = "guitar-companion";
    companion.type = "button";
    companion.dataset.state = IS_ADMIN ? "complete" : "incomplete";
    companion.setAttribute("aria-label", IS_ADMIN ? "Play a guitar motivation" : "Today's guitar check-in is waiting");
    companion.innerHTML = `
      <span class="guitar-companion-message" aria-live="polite">${IS_ADMIN ? "Ready for the next review?" : "Your guitars are waiting for today's check-in."}</span>
      <span class="guitar-companion-stage" aria-hidden="true">
        <img class="guitar-companion-duo" src="${IS_ADMIN ? COMPLETE_IDLE_URL : SAD_INTRO_URL}" alt="" draggable="false">
        <span class="guitar-companion-note note-one">&#9834;</span>
        <span class="guitar-companion-note note-two">&#9835;</span>
        <span class="guitar-companion-spark spark-one">&#10022;</span>
        <span class="guitar-companion-spark spark-two">&#10022;</span>
        <span class="guitar-companion-spark spark-three">&#10022;</span>
        <span class="guitar-companion-spark spark-four">&#10022;</span>
      </span>
    `;
    document.body.append(companion);

    const motionOverlay = document.createElement("section");
    motionOverlay.id = "ots-guitar-motion-emote";
    motionOverlay.className = "guitar-motion-emote";
    motionOverlay.hidden = true;
    motionOverlay.innerHTML = `
      <div class="guitar-motion-emote-shell" role="dialog" aria-modal="true" aria-labelledby="guitar-motion-emote-message">
        <button class="guitar-motion-emote-close" type="button" aria-label="Skip celebration">Skip</button>
        <img class="guitar-motion-emote-animation" src="${CELEBRATION_URL}" alt="Animated boy and girl celebrating with guitars">
        <p class="guitar-motion-emote-message" id="guitar-motion-emote-message" aria-live="assertive">Daily mission complete!</p>
      </div>
    `;
    document.body.append(motionOverlay);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (stored && Number.isFinite(stored.left) && Number.isFinite(stored.top)) {
      companion.style.left = `${clamp(stored.left, 8, innerWidth - companion.offsetWidth - 8)}px`;
      companion.style.top = `${clamp(stored.top, 8, innerHeight - companion.offsetHeight - 8)}px`;
      companion.style.right = "auto";
      companion.style.bottom = "auto";
    }

    let drag = null;
    let moved = false;
    let animationTimer = null;
    let motionTimer = null;
    let motionHideTimer = null;
    let stateTimer = null;
    let checkinCompleted = IS_ADMIN;

    const restartImage = (image, source) => {
      image.removeAttribute("src");
      window.requestAnimationFrame(() => image.setAttribute("src", source));
    };

    const setCompanionState = (completed, { replayTransition = false } = {}) => {
      const nextCompleted = Boolean(completed);
      if (nextCompleted === checkinCompleted && !replayTransition) return;
      checkinCompleted = nextCompleted;
      companion.dataset.state = nextCompleted ? "complete" : "incomplete";
      companion.classList.toggle("is-complete", nextCompleted);
      companion.classList.toggle("is-incomplete", !nextCompleted);
      const animation = companion.querySelector(".guitar-companion-duo");
      const messageElement = companion.querySelector(".guitar-companion-message");
      window.clearTimeout(stateTimer);
      if (nextCompleted) {
        restartImage(animation, COMPLETE_IDLE_URL);
        messageElement.textContent = "Daily check-in complete. Brilliant work!";
        companion.setAttribute("aria-label", "Daily guitar check-in complete");
        return;
      }
      restartImage(animation, SAD_INTRO_URL);
      messageElement.textContent = "Your guitars are waiting for today's check-in.";
      companion.setAttribute("aria-label", "Today's guitar check-in is waiting");
      stateTimer = window.setTimeout(() => restartImage(animation, SAD_IDLE_URL), 1750);
    };

    const selectEmote = (requestedId = "") => {
      const requested = emotes.find((emote) => emote.id === requestedId);
      if (requested) return requested;
      const currentIndex = Number.parseInt(localStorage.getItem(EMOTE_STORAGE_KEY) || "0", 10);
      const safeIndex = Number.isFinite(currentIndex) ? currentIndex : 0;
      localStorage.setItem(EMOTE_STORAGE_KEY, String((safeIndex + 1) % emotes.length));
      return emotes[safeIndex % emotes.length];
    };

    const runEmote = ({ emote: requestedId = "", message = "", celebrate = false } = {}) => {
      if (!checkinCompleted) {
        const messageElement = companion.querySelector(".guitar-companion-message");
        messageElement.textContent = "We miss your music. Complete today's check-in when you are ready.";
        companion.classList.remove("is-playing", "is-celebrating");
        companion.classList.add("is-speaking");
        window.clearTimeout(animationTimer);
        animationTimer = window.setTimeout(() => companion.classList.remove("is-speaking"), 3600);
        return;
      }
      const selected = selectEmote(requestedId);
      const messageElement = companion.querySelector(".guitar-companion-message");
      messageElement.textContent = message || selected.message || messages[Math.floor(Math.random() * messages.length)];
      companion.dataset.emote = selected.id;
      companion.setAttribute("aria-label", `${selected.label}: ${messageElement.textContent}`);
      companion.classList.remove("is-playing", "is-celebrating", "is-speaking");
      window.clearTimeout(animationTimer);
      void companion.offsetWidth;
      companion.classList.add(celebrate ? "is-celebrating" : "is-playing");
      animationTimer = window.setTimeout(() => {
        companion.classList.remove("is-playing", "is-celebrating");
        companion.setAttribute("aria-label", "Daily guitar check-in complete");
      }, celebrate ? 4400 : 3600);
    };

    const play = () => runEmote();
    const closeMotionEmote = () => {
      window.clearTimeout(motionTimer);
      motionOverlay.classList.remove("is-visible");
      window.clearTimeout(motionHideTimer);
      motionHideTimer = window.setTimeout(() => {
        motionOverlay.hidden = true;
      }, 260);
    };

    const playMotionEmote = (detail = {}) => {
      const selected = selectEmote(detail.emote || "");
      const animation = motionOverlay.querySelector(".guitar-motion-emote-animation");
      const messageElement = motionOverlay.querySelector(".guitar-motion-emote-message");
      window.clearTimeout(motionTimer);
      window.clearTimeout(motionHideTimer);
      companion.classList.remove("is-playing", "is-celebrating", "is-speaking");
      motionOverlay.dataset.emote = selected.id;
      messageElement.textContent = detail.message || selected.message;
      motionOverlay.hidden = false;
      motionOverlay.classList.remove("is-visible");
      void motionOverlay.offsetWidth;
      motionOverlay.classList.add("is-visible");
      restartImage(animation, CELEBRATION_URL);
      motionTimer = window.setTimeout(closeMotionEmote, 5200);
    };

    const celebrate = (detail = {}) => {
      setCompanionState(true);
      if (detail.motion === false) runEmote({ ...detail, celebrate: true });
      else playMotionEmote(detail);
    };

    window.OTSCompanion = Object.freeze({
      play,
      celebrate,
      emotes: emotes.map(({ id, label }) => ({ id, label }))
    });
    window.addEventListener("ots:task-completed", (event) => celebrate(event.detail || {}));
    window.addEventListener("ots:checkin-state", (event) => {
      if (IS_ADMIN) return;
      setCompanionState(Boolean(event.detail?.completed), {
        replayTransition: Boolean(event.detail?.replayTransition)
      });
    });
    motionOverlay.querySelector(".guitar-motion-emote-close").addEventListener("click", closeMotionEmote);
    motionOverlay.addEventListener("click", (event) => {
      if (event.target === motionOverlay) closeMotionEmote();
    });

    const authPanels = [...document.querySelectorAll("#student-auth, #admin-login")];
    let wasHiddenForAuth = false;
    const syncAuthVisibility = () => {
      const hiddenForAuth = authPanels.some((panel) => !panel.hidden);
      companion.hidden = hiddenForAuth;
      if (wasHiddenForAuth && !hiddenForAuth) window.setTimeout(play, 300);
      wasHiddenForAuth = hiddenForAuth;
    };
    authPanels.forEach((panel) => new MutationObserver(syncAuthVisibility).observe(panel, {
      attributes: true,
      attributeFilter: ["hidden"]
    }));
    syncAuthVisibility();
    setCompanionState(IS_ADMIN, { replayTransition: true });

    companion.addEventListener("pointerdown", (event) => {
      if (companion.classList.contains("is-celebrating")) return;
      const box = companion.getBoundingClientRect();
      drag = { pointerId: event.pointerId, offsetX: event.clientX - box.left, offsetY: event.clientY - box.top };
      moved = false;
      companion.classList.add("is-dragging");
      companion.setPointerCapture(event.pointerId);
    });
    companion.addEventListener("pointermove", (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const left = clamp(event.clientX - drag.offsetX, 8, innerWidth - companion.offsetWidth - 8);
      const top = clamp(event.clientY - drag.offsetY, 8, innerHeight - companion.offsetHeight - 8);
      companion.style.left = `${left}px`;
      companion.style.top = `${top}px`;
      companion.style.right = "auto";
      companion.style.bottom = "auto";
      moved = true;
    });
    companion.addEventListener("pointerup", (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      companion.classList.remove("is-dragging");
      companion.releasePointerCapture(event.pointerId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ left: companion.offsetLeft, top: companion.offsetTop }));
      drag = null;
      if (!moved) play();
    });
    companion.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") play();
    });
    window.setTimeout(() => {
      if (!companion.hidden) play();
    }, 1400);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
})();
