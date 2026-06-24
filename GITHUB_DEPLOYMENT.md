# GitHub Upload Guide

## Upload these files

- `index.html`
- `styles.css`
- `app.js`
- `admin.html`
- `admin.css`
- `admin.js`
- `icon.svg`
- `manifest.webmanifest`
- `service-worker.js`
- `server.mjs`
- `package.json`
- `.env.example`
- `neon/schema.sql`
- `scripts/migrate-neon.mjs`
- `cloudflare/email-worker/`
- `cloudflare/video-worker/`
- `README.md`
- `BACKEND_STRUCTURE.md`
- `.gitignore`
- `backend/database.mjs`
- `data/.gitkeep`

The Windows launcher files and `scripts/start-app.ps1` may also be uploaded,
but they are only for running the project on a Windows computer.

## Do not upload

- `data/ots.db`
- `data/ots.db-shm`
- `data/ots.db-wal`
- `outputs/`
- `work/`
- screenshots and temporary files

## Important GitHub Pages limitation

GitHub Pages serves static HTML, CSS and JavaScript only. It cannot run
`server.mjs` or SQLite.

Therefore:

- GitHub Pages can display a front-end preview.
- The real admin login, database, student analysis, review queue and persistent
  API need a Node.js hosting service.
- GitHub should contain the source code, while a Node host runs the backend.

For the complete app, connect the GitHub repository to a Node hosting service
and use:

```text
Build command: none
Start command: npm start
```

The host must support Node.js 24 or newer. When `DATABASE_URL` is present, the
API uses Neon PostgreSQL and does not require a persistent disk.

## Required production environment variables

```text
NODE_ENV=production
OTP_SECRET=replace-with-a-long-random-secret
DATABASE_URL=postgresql://...
ADMIN_NAME=MUSIC SCHOOL Admin
ADMIN_EMAIL=admin@your-domain.com
ADMIN_PASSWORD=replace-with-a-strong-admin-password
TEACHER_NAME=Primary Music Teacher
TEACHER_EMAIL=teacher@your-domain.com
TEACHER_PASSWORD=replace-with-a-strong-teacher-password
TEACHER_INSTRUMENT=Guitar
CLOUDFLARE_EMAIL_WORKER_URL=https://ots-otp-email...workers.dev
CLOUDFLARE_EMAIL_WORKER_TOKEN=replace-with-worker-shared-secret
OTP_FROM_EMAIL=MUSIC SCHOOL OTS <login@your-verified-domain.com>
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
MIN_PRACTICE_SECONDS=420
MAX_PRACTICE_VIDEO_BYTES=100000000
```

For local development without Cloudflare email and Cloudinary credentials, OTP
codes appear on the student login screen and video metadata is stored without
uploading the binary.
