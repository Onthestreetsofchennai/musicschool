# MUSIC SCHOOL OTS

A working MVP foundation for a guided 12-week music school.

## What is included

- Student app with assigned teacher, 12-week course, two weekly sessions,
  morning/evening practice check-ins, teacher feedback and help calls
- Admin login and academic operations dashboard
- Student email OTP login backed by database sessions
- Admin enrollment form for real student email accounts
- Super Admin staff management for multiple admins and teachers
- Mandatory morning/evening practice gate
- Minimum seven-minute video validation
- Temporary metadata-only practice check-ins for the first MVP
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

Students select a seven-minute practice video so the app can validate its
duration. The first live MVP stores only the check-in details in Neon, not the
video file itself. Private video storage will be added in the next phase.

## Reset demo data

Stop the server and delete `data/ots.db`, `data/ots.db-shm` and
`data/ots.db-wal`. The next server start recreates clean demo data.

## Production MVP services

Production is deployed as one Cloudflare Worker. Render is not required.

### Cloudflare Worker

The Worker serves the student app at `/`, the admin portal at `/admin`, and
the secure backend API at `/api/*`. Cloudflare deploys the files in `public/`
together with `cloudflare/worker.mjs`.

### Neon database

Create a Neon database, set `DATABASE_URL`, install dependencies and run:

```powershell
npm install
npm run neon:migrate
```

The migration creates the production PostgreSQL schema. Local development uses
SQLite when `DATABASE_URL` is absent; production automatically uses Neon when
`DATABASE_URL` is configured.

### Resend OTP email

Create a Resend API key, verify a sending domain, and set `RESEND_API_KEY` and
`EMAIL_FROM` only in Cloudflare Worker secrets. Students can request an OTP only after
an admin has created their student account and registered email.

### Practice check-ins

The current production MVP stores practice duration, period, filename and
review state in Neon. No separate video-storage account is required.

### Cloudflare Worker secrets

```text
OTP_SECRET=replace-with-a-long-random-secret
SESSION_SECRET=replace-with-a-different-long-random-secret
DATABASE_URL=postgresql://...
ADMIN_NAME=MUSIC SCHOOL Admin
ADMIN_EMAIL=admin@your-domain.com
ADMIN_PASSWORD=replace-with-a-strong-admin-password
RESEND_API_KEY=re_xxxxxxxxx
EMAIL_FROM=MUSIC SCHOOL OTS <login@your-verified-domain.com>
MIN_PRACTICE_SECONDS=420
```

Without Resend credentials, local development displays OTP codes on
screen. Practice submissions remain metadata-only in both environments.

See `GITHUB_DEPLOYMENT.md` for the Cloudflare GitHub deployment steps.

## Production work still required

- Private practice-video storage and retention rules
- Notifications through push, email or WhatsApp
- Payments and course enrollment
- Production Neon runtime adapter and managed migrations
- CSRF strategy and staff password recovery
- Automated unit, integration and accessibility tests
