(() => {
  const STORAGE_KEY = `otsGuitarCompanion:${location.pathname.includes("/admin") ? "admin" : "student"}`;
  const EMOTE_STORAGE_KEY = `${STORAGE_KEY}:emoteIndex`;
  const ASSET_URL = new URL(
    "guitar-duo-mascot.png",
    document.currentScript?.src || location.href
  ).href;
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
    companion.setAttribute("aria-label", "Play a guitar motivation");
    companion.innerHTML = `
      <span class="guitar-companion-message" aria-live="polite">Ready for your next riff?</span>
      <span class="guitar-companion-stage" aria-hidden="true">
        <img class="guitar-companion-duo" src="${ASSET_URL}" alt="" draggable="false">
        <span class="guitar-companion-note note-one">&#9834;</span>
        <span class="guitar-companion-note note-two">&#9835;</span>
        <span class="guitar-companion-spark spark-one">&#10022;</span>
        <span class="guitar-companion-spark spark-two">&#10022;</span>
        <span class="guitar-companion-spark spark-three">&#10022;</span>
        <span class="guitar-companion-spark spark-four">&#10022;</span>
      </span>
    `;
    document.body.append(companion);

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

    const selectEmote = (requestedId = "") => {
      const requested = emotes.find((emote) => emote.id === requestedId);
      if (requested) return requested;
      const currentIndex = Number.parseInt(localStorage.getItem(EMOTE_STORAGE_KEY) || "0", 10);
      const safeIndex = Number.isFinite(currentIndex) ? currentIndex : 0;
      localStorage.setItem(EMOTE_STORAGE_KEY, String((safeIndex + 1) % emotes.length));
      return emotes[safeIndex % emotes.length];
    };

    const runEmote = ({ emote: requestedId = "", message = "", celebrate = false } = {}) => {
      const selected = selectEmote(requestedId);
      const messageElement = companion.querySelector(".guitar-companion-message");
      messageElement.textContent = message || selected.message || messages[Math.floor(Math.random() * messages.length)];
      companion.dataset.emote = selected.id;
      companion.setAttribute("aria-label", `${selected.label}: ${messageElement.textContent}`);
      companion.classList.remove("is-playing", "is-celebrating");
      window.clearTimeout(animationTimer);
      void companion.offsetWidth;
      companion.classList.add(celebrate ? "is-celebrating" : "is-playing");
      animationTimer = window.setTimeout(() => {
        companion.classList.remove("is-playing", "is-celebrating");
        companion.setAttribute("aria-label", "Play a guitar motivation");
      }, celebrate ? 4400 : 3600);
    };

    const play = () => runEmote();
    const celebrate = (detail = {}) => runEmote({ ...detail, celebrate: true });

    window.OTSCompanion = Object.freeze({
      play,
      celebrate,
      emotes: emotes.map(({ id, label }) => ({ id, label }))
    });
    window.addEventListener("ots:task-completed", (event) => celebrate(event.detail || {}));

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
