# GitHub And Cloudflare Deployment

Render is not used.

The GitHub repository deploys directly to one Cloudflare Worker. The same
deployment serves the student app, admin portal and backend API.

## Architecture

```text
Cloudflare Worker
  +-- Student and admin web files
  +-- Secure authentication and API
  +-- Neon PostgreSQL
  +-- Resend OTP email
```

## Files required in GitHub

- `cloudflare/worker.mjs`
- `public/`
- `backend/neon-api.mjs`
- `backend/shared.mjs`
- `neon/schema.sql`
- `scripts/migrate-neon.mjs`
- `wrangler.jsonc`
- `package.json`
- `package-lock.json`

The remaining source files may stay in GitHub for local development and
documentation.

Never upload `.env`, database files, OTP codes, passwords or API keys.

## Connect GitHub To Cloudflare

1. Open Cloudflare.
2. Open **Workers & Pages**.
3. Select **Create application** and import the GitHub repository.
4. Cloudflare reads `wrangler.jsonc`.
5. Use `npm run deploy` as the deploy command if Cloudflare asks for one.

Every future GitHub update will redeploy the Worker automatically.

## Cloudflare secrets

Add these in the Worker's **Settings > Variables and Secrets**:

```text
DATABASE_URL
OTP_SECRET
SESSION_SECRET
RESEND_API_KEY
EMAIL_FROM
ADMIN_EMAIL
ADMIN_PASSWORD
```

Optional variables:

```text
ADMIN_NAME=MUSIC SCHOOL Admin
MIN_PRACTICE_SECONDS=420
```

All secrets remain in Cloudflare. They are never included in frontend files or
GitHub.

## App URLs

```text
Student app: https://YOUR-WORKER.workers.dev/
Admin portal: https://YOUR-WORKER.workers.dev/admin
```
