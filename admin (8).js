:root {
  --navy: #111426;
  --navy-soft: #24283e;
  --purple: #7057ff;
  --purple-dark: #5840e8;
  --purple-pale: #eeeafe;
  --cream: #fff8ee;
  --yellow: #ffc857;
  --green: #1e9b68;
  --green-pale: #e7f7ef;
  --ink: #171923;
  --muted: #686d7c;
  --line: #dedfe7;
  --surface: #ffffff;
  --background: #f6f4f9;
  --danger: #bd3a47;
  --shadow: 0 20px 55px rgba(36, 27, 78, 0.1);
  --radius-xl: 30px;
  --radius-lg: 22px;
  --radius-md: 16px;
}

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  min-width: 320px;
  background: var(--background);
  color: var(--ink);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}

button,
input,
select,
textarea {
  font: inherit;
}

button {
  color: inherit;
}

.ambient {
  position: fixed;
  z-index: -1;
  border-radius: 50%;
  filter: blur(90px);
  opacity: 0.26;
  pointer-events: none;
}

.ambient-one {
  width: 340px;
  height: 340px;
  top: -140px;
  right: 8%;
  background: #baaaff;
}

.ambient-two {
  width: 300px;
  height: 300px;
  bottom: -120px;
  left: 12%;
  background: #ffe1a1;
}

[hidden] {
  display: none !important;
}

.app-shell {
  min-height: 100vh;
}

.practice-gate {
  position: fixed;
  inset: 0;
  z-index: 95;
  display: grid;
  place-items: center;
  padding: 22px;
  background: rgba(17, 20, 38, 0.86);
  backdrop-filter: blur(12px);
}

.practice-gate-card {
  width: min(520px, 100%);
  padding: clamp(28px, 6vw, 48px);
  border-radius: var(--radius-xl);
  background: white;
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.32);
  text-align: center;
}

.practice-gate-icon {
  display: grid;
  width: 72px;
  height: 72px;
  margin: 0 auto 22px;
  place-items: center;
  border-radius: 24px;
  background: var(--purple);
  color: white;
  font-size: 2rem;
  font-weight: 900;
}

.practice-gate-card h1 {
  margin: 9px 0 12px;
  font-size: clamp(2rem, 7vw, 3.4rem);
  line-height: 1;
}

.practice-gate-card > p:not(.eyebrow) {
  margin: 0 auto 22px;
  color: var(--muted);
  line-height: 1.6;
}

.practice-gate-actions {
  display: grid;
  gap: 10px;
}

.practice-gate-card small {
  display: block;
  margin-top: 18px;
  color: var(--muted);
  line-height: 1.5;
}

.app-shell.is-practice-locked [data-view]:not([data-view="checkin"]),
.app-shell.is-practice-locked .join-session,
.app-shell.is-practice-locked .open-help-call {
  opacity: 0.48;
}

.sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 20;
  display: flex;
  width: 248px;
  flex-direction: column;
  padding: 28px 22px;
  background: var(--navy);
  color: white;
}

.brand-lockup {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-lockup > span:last-child {
  display: grid;
  gap: 2px;
}

.brand-lockup strong {
  font-size: 0.88rem;
  letter-spacing: 0.06em;
}

.brand-lockup small {
  color: #aeb3c7;
  font-size: 0.72rem;
}

.brand-mark {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 15px;
  background: var(--purple);
  color: white;
  font-size: 0.78rem;
  font-weight: 900;
  letter-spacing: 0.04em;
}

.sidebar-brand {
  margin-bottom: 42px;
}

.side-nav {
  display: grid;
  gap: 8px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 13px;
  width: 100%;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: #aeb3c7;
  cursor: pointer;
  font-weight: 700;
  transition: 160ms ease;
}

.side-nav .nav-item {
  padding: 13px 14px;
  text-align: left;
}

.nav-item svg,
.icon-button svg {
  width: 21px;
  height: 21px;
  fill: currentColor;
}

.nav-item:hover,
.nav-item:focus-visible {
  color: white;
  background: rgba(255, 255, 255, 0.06);
}

.nav-item.is-active {
  background: var(--purple);
  color: white;
}

.sidebar-support {
  display: flex;
  gap: 10px;
  margin-top: auto;
  padding: 15px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.05);
}

.sidebar-support div {
  display: grid;
  gap: 3px;
}

.sidebar-support strong {
  font-size: 0.78rem;
}

.sidebar-support small {
  color: #9ca2ba;
  font-size: 0.68rem;
  line-height: 1.4;
}

.status-dot {
  display: inline-block;
  flex: 0 0 auto;
  width: 9px;
  height: 9px;
  margin-top: 4px;
  border-radius: 50%;
  background: #39d98a;
  box-shadow: 0 0 0 4px rgba(57, 217, 138, 0.13);
}

.main-column {
  min-height: 100vh;
  margin-left: 248px;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 15;
  display: flex;
  min-height: 86px;
  align-items: center;
  justify-content: space-between;
  padding: 15px clamp(22px, 4vw, 56px);
  border-bottom: 1px solid rgba(222, 223, 231, 0.75);
  background: rgba(246, 244, 249, 0.88);
  backdrop-filter: blur(18px);
}

.topbar-copy h2 {
  margin: 3px 0 0;
  font-size: 1.15rem;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mobile-brand {
  display: none;
  align-items: center;
  gap: 10px;
}

.mobile-brand .brand-mark {
  width: 38px;
  height: 38px;
  border-radius: 13px;
}

.mobile-brand strong {
  font-size: 0.76rem;
}

.icon-button,
.avatar-button {
  position: relative;
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: white;
  cursor: pointer;
}

.avatar-button {
  border-color: var(--navy);
  background: var(--navy);
  color: white;
  font-weight: 800;
}

.notification-dot {
  position: absolute;
  top: 7px;
  right: 7px;
  width: 7px;
  height: 7px;
  border: 2px solid white;
  border-radius: 50%;
  background: var(--purple);
}

main {
  width: min(1180px, 100%);
  margin: 0 auto;
  padding: 38px clamp(22px, 4vw, 56px) 80px;
}

.view {
  display: none;
  animation: view-in 220ms ease;
}

.view.is-active {
  display: block;
}

@keyframes view-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.eyebrow {
  margin: 0;
  color: var(--purple);
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.1em;
}

.eyebrow.light {
  color: var(--yellow);
}

h1,
h2,
h3,
p {
  overflow-wrap: anywhere;
}

.hero-card {
  position: relative;
  display: grid;
  min-height: 340px;
  grid-template-columns: minmax(0, 1.35fr) minmax(220px, 0.65fr);
  overflow: hidden;
  padding: clamp(30px, 5vw, 58px);
  border-radius: var(--radius-xl);
  background:
    radial-gradient(circle at 80% 10%, rgba(112, 87, 255, 0.46), transparent 38%),
    var(--navy);
  color: white;
  box-shadow: var(--shadow);
}

.hero-card::after {
  position: absolute;
  right: -50px;
  bottom: -110px;
  width: 300px;
  height: 300px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 50%;
  content: "";
}

.hero-content {
  position: relative;
  z-index: 2;
}

.hero-content h1 {
  margin: 12px 0 10px;
  font-size: clamp(2.6rem, 6vw, 4.8rem);
  line-height: 0.95;
}

.hero-content > p:not(.eyebrow) {
  max-width: 590px;
  margin: 0 0 25px;
  color: #c8ccda;
  font-size: 1.02rem;
  line-height: 1.65;
}

.hero-progress-row {
  display: flex;
  max-width: 540px;
  align-items: center;
  gap: 14px;
  margin-bottom: 26px;
}

.progress-track {
  height: 9px;
  flex: 1;
  overflow: hidden;
  border-radius: 999px;
  background: #e4e2ec;
}

.progress-track span {
  display: block;
  width: 25%;
  height: 100%;
  border-radius: inherit;
  background: var(--purple);
  transition: width 300ms ease;
}

.progress-track-dark {
  background: rgba(255, 255, 255, 0.16);
}

.progress-track-dark span {
  background: var(--yellow);
}

.hero-orbit {
  position: relative;
  z-index: 2;
  display: grid;
  min-height: 220px;
  place-items: center;
}

.orbit-ring {
  position: absolute;
  width: 220px;
  height: 220px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
}

.orbit-ring::before,
.orbit-ring::after {
  position: absolute;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 50%;
  content: "";
}

.orbit-ring::before {
  inset: 24px;
}

.orbit-ring::after {
  inset: -22px;
}

.orbit-core {
  display: grid;
  width: 120px;
  height: 120px;
  place-items: center;
  border-radius: 50%;
  background: var(--purple);
  box-shadow: 0 0 50px rgba(112, 87, 255, 0.45);
  font-size: 2.2rem;
  font-weight: 900;
}

.button {
  display: inline-flex;
  min-height: 43px;
  align-items: center;
  justify-content: center;
  padding: 0 18px;
  border: 0;
  border-radius: 13px;
  cursor: pointer;
  font-weight: 800;
  text-decoration: none;
  transition: 160ms ease;
}

.button:hover,
.button:focus-visible {
  transform: translateY(-1px);
}

.button-primary {
  background: var(--purple);
  color: white;
  box-shadow: 0 9px 22px rgba(112, 87, 255, 0.22);
}

.button-primary:hover,
.button-primary:focus-visible {
  background: var(--purple-dark);
}

.button-secondary {
  border: 1px solid var(--line);
  background: white;
  color: var(--navy);
}

.button-light {
  background: white;
  color: var(--navy);
}

.button-large {
  min-height: 52px;
}

.text-button {
  padding: 7px 0;
  border: 0;
  background: transparent;
  color: var(--purple);
  cursor: pointer;
  font-weight: 800;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin: 20px 0;
}

.stat-card,
.panel {
  border: 1px solid rgba(222, 223, 231, 0.9);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: 0 10px 30px rgba(35, 29, 69, 0.045);
}

.stat-card {
  display: grid;
  gap: 5px;
  padding: 22px;
}

.stat-card strong {
  font-size: 1.35rem;
}

.stat-card small,
.stat-label {
  color: var(--muted);
  font-size: 0.78rem;
}

.stat-label {
  font-weight: 700;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.65fr);
  gap: 20px;
}

.panel {
  padding: 24px;
}

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.section-heading h2,
.upload-heading h2,
.preferences-panel h2 {
  margin: 5px 0 0;
  font-size: 1.38rem;
}

.session-list,
.daily-list,
.history-list,
.feedback-list {
  display: grid;
  gap: 12px;
}

.session-card {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) auto;
  align-items: center;
  gap: 15px;
  padding: 15px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
}

.session-date {
  display: grid;
  min-height: 58px;
  place-items: center;
  border-radius: 14px;
  background: var(--purple-pale);
  color: var(--purple);
}

.session-date strong {
  font-size: 0.65rem;
  letter-spacing: 0.08em;
}

.session-date span {
  font-size: 1.25rem;
  font-weight: 900;
}

.session-copy h3 {
  margin: 7px 0 4px;
  font-size: 1rem;
}

.session-copy p {
  margin: 0;
  color: var(--muted);
  font-size: 0.78rem;
}

.tag {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  min-height: 23px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 0.65rem;
  font-weight: 900;
}

.tag-purple {
  background: var(--purple-pale);
  color: var(--purple);
}

.tag-yellow {
  background: #fff3d8;
  color: #8c6200;
}

.tag-green {
  background: var(--green-pale);
  color: var(--green);
}

.completion-ring {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border: 5px solid var(--purple-pale);
  border-top-color: var(--purple);
  border-radius: 50%;
  color: var(--purple);
  font-size: 0.75rem;
  font-weight: 900;
}

.daily-item {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: white;
  cursor: pointer;
  text-align: left;
}

.daily-item.is-complete {
  border-color: #bee7d2;
  background: var(--green-pale);
}

.check-icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 50%;
  background: var(--purple-pale);
  color: var(--purple);
  font-weight: 900;
}

.is-complete .check-icon {
  background: var(--green);
  color: white;
}

.daily-item > span:nth-child(2) {
  display: grid;
  gap: 3px;
}

.daily-item small,
.daily-time {
  color: var(--muted);
  font-size: 0.72rem;
}

.teacher-banner {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
  margin-top: 20px;
  padding: 25px;
  border-radius: var(--radius-lg);
  background: var(--cream);
}

.teacher-avatar,
.profile-avatar {
  display: grid;
  width: 64px;
  height: 64px;
  place-items: center;
  border-radius: 22px;
  background: var(--purple);
  color: white;
  font-weight: 900;
}

.teacher-avatar.small {
  width: 48px;
  height: 48px;
  border-radius: 16px;
}

.teacher-banner h2 {
  margin: 5px 0 4px;
  font-size: 1.3rem;
}

.teacher-banner p:last-child {
  max-width: 680px;
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
}

.page-intro {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 25px;
}

.page-intro h1 {
  margin: 8px 0 8px;
  font-size: clamp(2rem, 5vw, 3.45rem);
  line-height: 1.05;
}

.page-intro p:last-child {
  max-width: 720px;
  margin: 0;
  color: var(--muted);
  line-height: 1.65;
}

.course-progress-card {
  display: grid;
  min-width: 150px;
  gap: 3px;
  padding: 20px;
  border-radius: var(--radius-lg);
  background: var(--navy);
  color: white;
  text-align: center;
}

.course-progress-card strong {
  font-size: 2rem;
}

.course-progress-card span {
  color: #afb4c7;
  font-size: 0.76rem;
}

.course-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  margin-bottom: 18px;
  padding: 0;
  overflow: hidden;
}

.course-summary > div {
  display: grid;
  gap: 4px;
  padding: 22px;
  border-right: 1px solid var(--line);
  text-align: center;
}

.course-summary > div:last-child {
  border-right: 0;
}

.summary-number {
  color: var(--purple);
  font-size: 1.65rem;
  font-weight: 900;
}

.course-summary div span:last-child {
  color: var(--muted);
  font-size: 0.76rem;
}

.week-list {
  display: grid;
  gap: 12px;
}

.week-card {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: white;
}

.week-card.is-current {
  border-color: var(--purple);
  box-shadow: 0 14px 35px rgba(112, 87, 255, 0.1);
}

.week-card.is-locked {
  opacity: 0.68;
}

.week-toggle {
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr) auto;
  align-items: center;
  gap: 15px;
  width: 100%;
  padding: 18px;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.week-number {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  border-radius: 16px;
  background: var(--purple-pale);
  color: var(--purple);
  font-weight: 900;
}

.is-completed .week-number {
  background: var(--green);
  color: white;
}

.week-title {
  display: grid;
  gap: 4px;
}

.week-title strong {
  font-size: 1rem;
}

.week-title small {
  color: var(--muted);
}

.week-state {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 800;
}

.week-details {
  display: none;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 20px;
  padding: 0 18px 18px 87px;
}

.week-card.is-open .week-details {
  display: grid;
}

.week-details ul {
  display: grid;
  gap: 8px;
  margin: 0;
  padding-left: 20px;
  color: var(--muted);
  line-height: 1.45;
}

.week-milestone {
  min-width: 230px;
  padding: 15px;
  border-radius: 14px;
  background: var(--cream);
}

.week-milestone strong {
  display: block;
  margin-bottom: 4px;
  color: var(--navy);
}

.week-milestone p {
  margin: 0 0 12px;
  color: var(--muted);
  font-size: 0.78rem;
  line-height: 1.5;
}

.streak-pill {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 13px 17px;
  border: 1px solid #bee7d2;
  border-radius: 999px;
  background: var(--green-pale);
  color: var(--green);
}

.streak-pill .status-dot {
  margin: 0;
}

.teacher-focus {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 18px;
  padding: 18px;
  border-radius: var(--radius-lg);
  background: var(--cream);
}

.teacher-focus p {
  margin: 7px 0 0;
  line-height: 1.5;
}

.checkin-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  margin-bottom: 18px;
}

.upload-card {
  padding: 23px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: white;
  box-shadow: 0 10px 30px rgba(35, 29, 69, 0.045);
}

.upload-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 15px;
  margin-bottom: 18px;
}

.upload-status {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  padding: 0 10px;
  border-radius: 999px;
  background: #fff1dc;
  color: #8d6000;
  font-size: 0.68rem;
  font-weight: 900;
}

.upload-status.is-reviewed,
.upload-status.is-submitted {
  background: var(--green-pale);
  color: var(--green);
}

.video-preview {
  display: grid;
  min-height: 210px;
  place-items: center;
  align-content: center;
  gap: 8px;
  margin-bottom: 15px;
  overflow: hidden;
  border-radius: 18px;
  background:
    linear-gradient(rgba(17, 20, 38, 0.72), rgba(17, 20, 38, 0.72)),
    radial-gradient(circle at 20% 20%, #7057ff, #111426);
  color: white;
  text-align: center;
}

.video-preview.is-empty {
  border: 1px dashed #cfc9e9;
  background: var(--purple-pale);
  color: var(--navy);
}

.video-preview video {
  width: 100%;
  height: 210px;
  object-fit: cover;
}

.video-placeholder-icon {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.16);
  font-size: 1.2rem;
}

.is-empty .video-placeholder-icon {
  background: white;
  color: var(--purple);
}

.video-preview small {
  color: #c5cad9;
}

.is-empty small {
  color: var(--muted);
}

.upload-card .button {
  width: 100%;
  margin-top: 8px;
}

.upload-card .remove-pending-upload {
  width: 100%;
  color: #b93445;
}

.history-row {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 15px;
  padding: 13px 0;
  border-bottom: 1px solid var(--line);
}

.history-row:last-child {
  border-bottom: 0;
}

.history-row strong {
  font-size: 0.85rem;
}

.history-row span {
  color: var(--muted);
  font-size: 0.78rem;
}

.help-call-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
  padding: 20px 23px;
  border: 1px solid #bce4d0;
  border-radius: var(--radius-lg);
  background: var(--green-pale);
}

.help-call-banner h3 {
  margin: 7px 0 3px;
}

.help-call-banner p {
  margin: 0;
  color: var(--muted);
}

.help-call-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.feedback-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 16px;
  padding: 23px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: white;
}

.feedback-card h3 {
  margin: 8px 0 5px;
}

.feedback-card p {
  margin: 0;
  color: var(--muted);
  line-height: 1.6;
}

.feedback-inputs {
  display: grid;
  gap: 8px;
  margin-top: 14px;
}

.feedback-input {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 11px 13px;
  border-radius: 13px;
  background: var(--background);
  color: var(--ink);
  font-size: 0.85rem;
}

.feedback-input span {
  display: grid;
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50%;
  background: var(--purple);
  color: white;
  font-size: 0.68rem;
  font-weight: 900;
}

.profile-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.profile-heading {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 25px;
}

.profile-heading h2 {
  margin: 0 0 4px;
}

.profile-heading p {
  margin: 0;
  color: var(--muted);
}

.stack-form {
  display: grid;
  gap: 16px;
}

.stack-form.compact {
  gap: 13px;
}

label {
  display: grid;
  gap: 7px;
  color: var(--navy);
  font-size: 0.8rem;
  font-weight: 800;
}

input,
select,
textarea {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 13px;
  outline: none;
  background: white;
  color: var(--ink);
}

input,
select {
  height: 47px;
  padding: 0 13px;
}

textarea {
  padding: 12px 13px;
  resize: vertical;
}

input:focus,
select:focus,
textarea:focus {
  border-color: var(--purple);
  box-shadow: 0 0 0 3px rgba(112, 87, 255, 0.12);
}

.toggle-row {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 15px;
  padding: 16px 0;
  border-bottom: 1px solid var(--line);
  cursor: pointer;
}

.toggle-row > span:first-child {
  display: grid;
  gap: 4px;
}

.toggle-row small {
  color: var(--muted);
  font-weight: 500;
}

.toggle-row input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.toggle {
  position: relative;
  width: 46px;
  height: 26px;
  border-radius: 999px;
  background: #d6d7df;
  transition: 160ms ease;
}

.toggle::after {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.16);
  content: "";
  transition: 160ms ease;
}

.toggle-row input:checked + .toggle {
  background: var(--purple);
}

.toggle-row input:checked + .toggle::after {
  transform: translateX(20px);
}

.profile-teacher {
  margin-top: 18px;
}

.danger-link {
  margin-top: 22px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--danger);
  cursor: pointer;
  font-weight: 800;
}

.bottom-nav {
  display: none;
}

.onboarding {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  overflow-y: auto;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(circle at 85% 10%, rgba(112, 87, 255, 0.5), transparent 38%),
    var(--navy);
}

.onboarding-panel {
  width: min(560px, 100%);
  padding: clamp(25px, 5vw, 46px);
  border-radius: var(--radius-xl);
  background: white;
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.25);
}

.auth-panel {
  width: min(520px, 100%);
}

.onboarding-copy {
  margin: 35px 0 28px;
}

.onboarding-copy h1 {
  margin: 8px 0 10px;
  color: var(--navy);
  font-size: clamp(2.2rem, 8vw, 4rem);
  line-height: 1;
}

.onboarding-copy p:last-child,
.microcopy {
  color: var(--muted);
  line-height: 1.6;
}

.microcopy {
  margin: 16px 0 0;
  font-size: 0.75rem;
  text-align: center;
}

.auth-destination {
  margin: 0;
  padding: 13px 15px;
  border-radius: 13px;
  background: var(--purple-pale);
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.5;
}

#student-login-otp {
  height: 58px;
  font-size: 1.45rem;
  font-weight: 900;
  letter-spacing: 0.35em;
  text-align: center;
}

.auth-back {
  justify-self: center;
}

.auth-error {
  margin: 15px 0 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: #fff0f1;
  color: var(--danger);
  font-size: 0.8rem;
  font-weight: 750;
  line-height: 1.5;
}

.development-otp {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 16px;
  padding: 13px 15px;
  border: 1px dashed #b7abea;
  border-radius: 13px;
  background: #f8f5ff;
  color: var(--muted);
  font-size: 0.76rem;
}

.development-otp strong {
  color: var(--purple);
  font-size: 1.2rem;
  letter-spacing: 0.18em;
}

.modal {
  width: min(560px, calc(100% - 28px));
  padding: 0;
  border: 0;
  border-radius: 26px;
  background: transparent;
}

.modal::backdrop {
  background: rgba(12, 14, 28, 0.62);
  backdrop-filter: blur(7px);
}

.modal-card {
  position: relative;
  padding: 30px;
  border-radius: 26px;
  background: white;
}

.modal-card h2 {
  margin: 8px 0;
  font-size: 2rem;
}

.modal-card > p:not(.eyebrow) {
  margin: 0 0 20px;
  color: var(--muted);
  line-height: 1.55;
}

.modal-close {
  position: absolute;
  top: 18px;
  right: 18px;
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: var(--background);
  cursor: pointer;
  font-size: 1.4rem;
}

.slot-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 18px;
}

.slot-option {
  position: relative;
}

.slot-option input {
  position: absolute;
  opacity: 0;
}

.slot-option span {
  display: grid;
  min-height: 68px;
  place-items: center;
  padding: 9px;
  border: 1px solid var(--line);
  border-radius: 14px;
  cursor: pointer;
  font-size: 0.76rem;
  line-height: 1.35;
  text-align: center;
}

.slot-option input:checked + span {
  border-color: var(--purple);
  background: var(--purple-pale);
  color: var(--purple);
  font-weight: 900;
}

.modal-card .button-large {
  width: 100%;
  margin-top: 18px;
}

.classroom-modal {
  width: min(1080px, calc(100% - 24px));
  max-width: none;
  padding: 0;
  border: 0;
  border-radius: 26px;
  background: transparent;
}

.classroom-modal::backdrop {
  background: rgba(8, 10, 21, 0.82);
  backdrop-filter: blur(8px);
}

.classroom-shell {
  padding: 24px;
  border-radius: 26px;
  background: #0d1020;
  color: white;
}

.classroom-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}

.classroom-header h2 {
  margin: 6px 0 0;
}

.classroom-close {
  position: static;
  flex: 0 0 auto;
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.classroom-stage {
  position: relative;
  display: grid;
  min-height: 430px;
  place-items: center;
  overflow: hidden;
  border-radius: 20px;
  background: #171b31;
}

.classroom-stage video,
.classroom-frame {
  width: 100%;
  height: 100%;
  min-height: 430px;
  border: 0;
  object-fit: cover;
}

.classroom-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 8px;
  text-align: center;
}

.classroom-empty > span {
  display: grid;
  width: 88px;
  height: 88px;
  place-items: center;
  border-radius: 28px;
  background: var(--purple);
  font-size: 1.5rem;
  font-weight: 900;
}

.classroom-empty small,
.classroom-note {
  color: #aeb3c7;
}

.classroom-controls {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 16px;
}

.classroom-note {
  margin: 14px 0 0;
  text-align: center;
  font-size: 0.76rem;
}

.toast {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 120;
  max-width: min(390px, calc(100% - 48px));
  padding: 14px 18px;
  border-radius: 14px;
  background: var(--navy);
  color: white;
  box-shadow: var(--shadow);
  opacity: 0;
  pointer-events: none;
  transform: translateY(12px);
  transition: 180ms ease;
}

.toast.is-visible {
  opacity: 1;
  transform: translateY(0);
}

@media (max-width: 1020px) {
  .sidebar {
    width: 210px;
  }

  .main-column {
    margin-left: 210px;
  }

  .dashboard-grid {
    grid-template-columns: 1fr;
  }

  .daily-panel {
    order: -1;
  }
}

@media (max-width: 780px) {
  .sidebar {
    display: none;
  }

  .main-column {
    margin-left: 0;
  }

  .topbar {
    min-height: 68px;
    padding: 10px 16px;
  }

  .mobile-brand {
    display: flex;
  }

  .topbar-copy {
    display: none;
  }

  main {
    padding: 22px 16px 105px;
  }

  .classroom-shell {
    padding: 16px;
  }

  .classroom-stage,
  .classroom-stage video,
  .classroom-frame {
    min-height: 52vh;
  }

  .bottom-nav {
    position: fixed;
    inset: auto 0 0;
    z-index: 30;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    padding: 8px 5px calc(8px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.96);
    backdrop-filter: blur(18px);
  }

  .bottom-nav .nav-item {
    display: grid;
    justify-items: center;
    gap: 3px;
    padding: 6px 2px;
    border-radius: 10px;
    color: var(--muted);
    font-size: 0.63rem;
  }

  .bottom-nav .nav-item svg {
    width: 19px;
    height: 19px;
  }

  .bottom-nav .nav-item.is-active {
    background: var(--purple-pale);
    color: var(--purple);
  }

  .hero-card {
    min-height: auto;
    grid-template-columns: 1fr;
    padding: 28px 24px;
  }

  .hero-orbit {
    display: none;
  }

  .hero-content h1 {
    font-size: 3rem;
  }

  .stats-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .stat-card {
    min-height: 118px;
    align-content: start;
    padding: 15px 12px;
  }

  .stat-card strong {
    font-size: 1rem;
  }

  .stat-card small {
    display: none;
  }

  .panel {
    padding: 19px;
  }

  .session-card {
    grid-template-columns: 50px minmax(0, 1fr);
  }

  .session-card .button {
    grid-column: 1 / -1;
    width: 100%;
  }

  .teacher-banner {
    grid-template-columns: auto 1fr;
    padding: 20px;
  }

  .teacher-banner .button {
    grid-column: 1 / -1;
    width: 100%;
  }

  .page-intro {
    display: grid;
    align-items: start;
  }

  .course-progress-card {
    width: 100%;
  }

  .course-summary {
    grid-template-columns: repeat(2, 1fr);
  }

  .course-summary > div:nth-child(2) {
    border-right: 0;
  }

  .course-summary > div:nth-child(-n + 2) {
    border-bottom: 1px solid var(--line);
  }

  .week-toggle {
    grid-template-columns: 46px minmax(0, 1fr);
  }

  .week-state {
    grid-column: 2;
  }

  .week-number {
    width: 44px;
    height: 44px;
  }

  .week-details,
  .week-card.is-open .week-details {
    grid-template-columns: 1fr;
    padding: 0 16px 16px;
  }

  .week-milestone {
    min-width: 0;
  }

  .checkin-grid,
  .profile-grid {
    grid-template-columns: 1fr;
  }

  .history-row {
    grid-template-columns: 80px minmax(0, 1fr);
  }

  .history-row .tag {
    grid-column: 2;
  }

  .history-row .remove-submission {
    grid-column: 2;
    justify-self: start;
  }

  .slot-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .toast {
    right: 16px;
    bottom: 88px;
  }
}

@media (max-width: 430px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .stat-card {
    min-height: 0;
  }

  .stat-card small {
    display: block;
  }

  .daily-item {
    grid-template-columns: 34px minmax(0, 1fr);
  }

  .daily-time {
    grid-column: 2;
  }

  .page-intro h1 {
    font-size: 2.15rem;
  }

  .feedback-card {
    grid-template-columns: 1fr;
  }
}
