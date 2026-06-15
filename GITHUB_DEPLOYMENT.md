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

The host must support Node.js 24 or newer and persistent storage, or the SQLite
database should be migrated to a managed PostgreSQL database.
