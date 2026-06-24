# MUSIC SCHOOL OTS

A working MVP foundation for a guided 12-week music school.

## What is included

- Student app with assigned teacher, 12-week course, two weekly sessions,
  morning/evening practice check-ins, teacher feedback and help calls
- Admin login and academic operations dashboard
- Student email OTP login backed by database sessions
- Admin enrollment form for real student email accounts
- Mandatory morning/evening practice gate
- Minimum seven-minute video validation
- Private Cloudinary video upload and expiring teacher playback
- In-app classroom with camera/microphone preview and live room
- Student 360 analysis with weighted scores and active alerts
- Teacher review queue with seven skill ratings and written feedback
- Role-scoped teacher access
- SQLite database with realistic demo students, sessions and practice history
- REST API using only built-in Node.js modules
- Mobile-first PWA student experience

## Run locally

Node.js 24 or newer is recommended. Local development uses the built-in
`node:sqlite` module. Production database tables are defined in
`neon/schema.sql`.

On Windows, double-click:

```text
00_START_MUSIC_SCHOOL_OTS.cmd
```

This starts the backend and opens the Student App automatically. You can also
open `01_OPEN_MUSIC_SCHOOL_OTS.html` for Student and Admin buttons.

Do not open `icon.svg`; it is only the application logo.

Or start the server manually:

```powershell
node server.mjs
```

Open:

- Student app: `http://127.0.0.1:4173`
- Admin portal: `http://127.0.0.1:4173/admin`

The SQLite database is created automatically at `data/ots.db`.

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Super admin | `admin@ots.test` | `otsadmin123` |
| Academic head | `head@ots.test` | `head12345` |
| Guitar teacher | `arjun@ots.test` | `teacher123` |
| Keyboard teacher | `neha@ots.test` | `teacher123` |

Student demo login:

```text
riya@ots.test
```

In local development, the OTP appears on the student login screen and in the
server console.

## Student analysis score

The admin health score is recalculated after uploads, reviews, attendance
changes and course progression:

- Practice consistency: 35%
- Live-session attendance: 25%
- Skill ratings: 25%
- Teacher-feedback application: 15%

Status thresholds:

- Green: 80-100
- Amber: 55-79
- Red: below 55

See `BACKEND_STRUCTURE.md` for the full data and workflow design.

## Current video behavior

Local development previews the selected video and stores metadata only.
Production creates a signed Cloudinary upload for a private video asset and
stores only its asset key in the database. Teacher playback links expire after
15 minutes.

## Reset demo data

Stop the server and delete `data/ots.db`, `data/ots.db-shm` and
`data/ots.db-wal`. The next server start recreates clean demo data.

## Production MVP services

### Neon database

Create a Neon database, set `DATABASE_URL`, install dependencies and run:

```powershell
npm install
npm run neon:migrate
```

The migration creates the production PostgreSQL schema. The current local
server remains on SQLite until the production Neon API adapter is connected to
your actual Neon project.

### Cloudflare OTP email

Deploy `cloudflare/email-worker`, add a Cloudflare Email Service binding named
`SEND_EMAIL`, and set the `WORKER_SHARED_SECRET` Worker secret.

### Cloudinary practice videos

Add the Cloudinary Cloud name, API key and API secret only to the Node hosting
environment. Student videos upload as private assets using server-generated
signatures. Teacher playback links expire after 15 minutes.

### Environment variables

```text
NODE_ENV=production
OTP_SECRET=replace-with-a-long-random-secret
DATABASE_URL=postgresql://...
CLOUDFLARE_EMAIL_WORKER_URL=https://ots-otp-email...workers.dev
CLOUDFLARE_EMAIL_WORKER_TOKEN=replace-with-worker-shared-secret
OTP_FROM_EMAIL=MUSIC SCHOOL OTS <login@your-verified-domain.com>
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
MIN_PRACTICE_SECONDS=420
MAX_PRACTICE_VIDEO_BYTES=100000000
```

Without Cloudflare email and Cloudinary credentials, local development uses
OTP display and metadata-only video submissions.

## Production work still required

- Cloudinary retention and automatic cleanup rules
- Notifications through push, email or WhatsApp
- Payments and course enrollment
- Production Neon runtime adapter and managed migrations
- Rate limiting, CSRF strategy and password recovery
- Automated unit, integration and accessibility tests
