# MUSIC SCHOOL OTS

A mobile-first prototype for a guided 12-week music course.

## Included

- Student onboarding and instrument goal setup
- OTS-assigned teacher experience
- Full 12-week curriculum with milestones
- Two scheduled live sessions each week
- Morning and evening 10-minute video check-ins
- Teacher comments, corrections and practice focus
- Extra help-call scheduling
- Progress tracking, reminders and parent updates
- Local persistence with `localStorage`
- Installable PWA shell and offline asset caching

## Run locally

From this folder:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:4173
```

This first version is a front-end prototype. Video files and progress remain on
the current device; no server, login system, payment gateway, or cloud upload is
connected yet.
