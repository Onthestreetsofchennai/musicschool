# MUSIC SCHOOL OTS

A working full-stack foundation for a guided 12-week music school.

## What is included

- Student app with assigned teacher, 12-week course, two weekly sessions,
  morning/evening practice check-ins, teacher feedback and help calls
- Admin login and academic operations dashboard
- Student 360 analysis with weighted scores and active alerts
- Teacher review queue with seven skill ratings and written feedback
- Role-scoped teacher access
- SQLite database with realistic demo students, sessions and practice history
- REST API using only built-in Node.js modules
- Mobile-first PWA student experience

## Run locally

Node.js 24 or newer is recommended because this project uses the built-in
`node:sqlite` module.

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

The student app currently represents demo student `#1`, Riya Sharma. Student
authentication is the next implementation step.

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

The browser previews a selected video locally. The backend stores submission
metadata and a private storage key, but it does not upload the video binary.
Production should connect signed uploads to S3, Cloudflare R2, Supabase Storage
or another private object store.

## Reset demo data

Stop the server and delete `data/ots.db`, `data/ots.db-shm` and
`data/ots.db-wal`. The next server start recreates clean demo data.

## Production work still required

- Student and parent authentication
- Cloud video upload, playback authorization and retention rules
- Real video meeting provider
- Notifications through push, email or WhatsApp
- Payments and course enrollment
- Database migrations and managed PostgreSQL
- Rate limiting, CSRF strategy, session expiry and password recovery
- Automated unit, integration and accessibility tests
