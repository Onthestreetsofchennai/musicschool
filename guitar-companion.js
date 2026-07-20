(() => {
  const STORAGE_KEY = `otsGuitarCompanion:${location.pathname.includes("/admin") ? "admin" : "student"}`;
  const messages = [
    "One calm minute can start a great riff.",
    "Small practice. Big stage energy.",
    "Keep the rhythm moving today.",
    "Your next clean chord is closer than you think.",
    "Ready for your next riff?"
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
        <span class="guitar-companion-player">🧑‍🎤</span>
        <span class="guitar-companion-guitar">🎸</span>
        <span class="guitar-companion-note note-one">♪</span>
        <span class="guitar-companion-note note-two">♫</span>
      </span>
    `;
    document.body.append(companion);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (stored && Number.isFinite(stored.left) && Number.isFinite(stored.top)) {
      companion.style.left = `${clamp(stored.left, 8, innerWidth - 82)}px`;
      companion.style.top = `${clamp(stored.top, 8, innerHeight - 92)}px`;
      companion.style.right = "auto";
      companion.style.bottom = "auto";
    }

    let drag = null;
    let moved = false;
    const play = () => {
      companion.querySelector(".guitar-companion-message").textContent = messages[Math.floor(Math.random() * messages.length)];
      companion.classList.remove("is-playing");
      requestAnimationFrame(() => companion.classList.add("is-playing"));
      window.setTimeout(() => companion.classList.remove("is-playing"), 3600);
    };

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
