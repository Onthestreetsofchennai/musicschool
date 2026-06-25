# MUSIC SCHOOL OTS MVP Deployment

## One Cloudflare deployment

Render and other Node hosting services are not required.

```text
Student / Admin browser
        |
        v
Cloudflare Worker
        |
        +--> Static app files
        +--> Authentication and API
        +--> Neon PostgreSQL
        +--> Resend OTP email
```

Cloudflare deploys the Worker code and the files in `public/` together.

## Required services

1. Cloudflare Workers for the app and backend.
2. Neon PostgreSQL for persistent data.
3. Resend for student OTP email delivery.

## Student access

- There is no public signup.
- An admin creates the student and email first.
- Only an active registered student email can request an OTP.
- OTP generation and validation run inside the Cloudflare Worker.

## Staff access

- `ADMIN_EMAIL` and `ADMIN_PASSWORD` create the first Super Admin.
- Super Admin creates teachers and additional admins from the Staff screen.
- Teachers must be created before students can be assigned.

## Practice check-ins

For the current MVP, students choose a seven-minute video and the browser checks
its duration. Neon stores the check-in details, but the video file is not yet
uploaded.

## Deployment

Upload the prepared project to GitHub, connect the repository in Cloudflare
Workers & Pages, add the required secrets, and deploy.
