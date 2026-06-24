# MUSIC SCHOOL OTS MVP Deployment

## Service layout

```text
Student and teacher web apps
        |
        v
Node API host
        |
        +--> Neon PostgreSQL
        +--> Cloudflare Email Worker
        +--> Cloudinary private video storage
        +--> Embedded live classroom
```

## 1. Neon

1. Create a Neon project and copy its pooled connection string.
2. Set `DATABASE_URL` locally or in the API host.
3. Run `npm install`.
4. Run `npm run neon:migrate`.

The SQL source is `neon/schema.sql`.

## 2. Cloudflare OTP email

1. Configure Email Routing and a verified sending address.
2. Open `cloudflare/email-worker`.
3. Change `ALLOWED_ORIGIN` in `wrangler.toml`.
4. Add the secret:

```text
npx wrangler secret put WORKER_SHARED_SECRET
```

5. Deploy with `npx wrangler deploy`.
6. Put the Worker URL and the same secret into
   `CLOUDFLARE_EMAIL_WORKER_URL` and `CLOUDFLARE_EMAIL_WORKER_TOKEN`.

## 3. Cloudinary videos

1. Create a Cloudinary account and save its Cloud name, API key and API secret.
2. Add these values only to the Node API host:

```text
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

3. Never put the API secret in browser code or GitHub.
4. Student videos upload as private Cloudinary assets through signed requests.
5. Teacher playback uses a signed URL that expires after 15 minutes.
6. For the MVP, each video must be 100 MB or smaller.

## 4. Practice gate

- Morning practice becomes required at the start of the day.
- Evening practice also becomes required from 5:00 PM Asia/Kolkata.
- Each clip must be at least 420 seconds.
- Snooze hides the reminder for ten minutes but does not unlock other areas.
- Course, feedback, profile, help calls and classroom remain locked until the
  required upload is stored.

## 5. Classroom

The MVP opens a unique embedded live room per student and scheduled session.
The pre-room screen provides local camera and microphone controls. For a
commercial launch, replace the public meeting host with a managed video
provider and signed rooms.
