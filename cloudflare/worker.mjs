import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { handleAsNodeRequest } from "cloudflare:node";
import { createNeonApi } from "../backend/neon-api.mjs";

const API_PORT = 8080;
let neonApiPromise;

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolveBody, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body is too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body) return resolveBody({});
      try {
        resolveBody(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    request.on("error", reject);
  });
}

function getToken(request) {
  const authorization = request.headers.authorization || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

function createSessionSigner(secret) {
  function signSessionToken(payload) {
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
    return `${encodedPayload}.${signature}`;
  }

  function verifySessionToken(token) {
    const [encodedPayload, suppliedSignature] = String(token || "").split(".");
    if (!encodedPayload || !suppliedSignature) return null;
    const expectedSignature = createHmac("sha256", secret).update(encodedPayload).digest();
    const suppliedBuffer = Buffer.from(suppliedSignature, "base64url");
    if (suppliedBuffer.length !== expectedSignature.length || !timingSafeEqual(suppliedBuffer, expectedSignature)) {
      return null;
    }
    try {
      const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
      return Number(payload.exp) > Date.now() ? payload : null;
    } catch {
      return null;
    }
  }

  return { signSessionToken, verifySessionToken };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createOtpDelivery(environment) {
  return async function deliverOtpEmail({ email, studentName, code, challengeId }) {
    const subject = `${code} is your MUSIC SCHOOL OTS login code`;
    const text = `Hello ${studentName}, your MUSIC SCHOOL OTS login code is ${code}. It expires in 5 minutes.`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px;color:#111426">
        <div style="font-weight:800;margin-bottom:24px">MUSIC SCHOOL OTS</div>
        <h1 style="font-size:26px">Your login code</h1>
        <p>Hello ${escapeHtml(studentName)}, use this one-time code to sign in:</p>
        <div style="font-size:38px;font-weight:900;letter-spacing:8px;padding:20px 0;color:#7057ff">${code}</div>
        <p>This code expires in 5 minutes. Do not share it with anyone.</p>
      </div>
    `;
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${environment.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `ots-otp-${challengeId}`
      },
      body: JSON.stringify({
        from: environment.EMAIL_FROM,
        to: [email],
        subject,
        text,
        html
      })
    });
    if (!resendResponse.ok) {
      const detail = await resendResponse.text();
      throw new Error(`Resend OTP email delivery failed: ${detail.slice(0, 240)}`);
    }
  };
}

function createWorkerApi(environment) {
  const requiredSecrets = [
    "DATABASE_URL",
    "OTP_SECRET",
    "SESSION_SECRET",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "ADMIN_EMAIL",
    "ADMIN_PASSWORD"
  ];
  const missing = requiredSecrets.filter((name) => !environment[name]);
  if (missing.length) throw new Error(`Missing Cloudflare secrets: ${missing.join(", ")}`);
  const signer = createSessionSigner(environment.SESSION_SECRET);
  return createNeonApi({
    sendJson,
    readJson,
    getToken,
    deliverOtpEmail: createOtpDelivery(environment),
    minPracticeSeconds: Number(environment.MIN_PRACTICE_SECONDS || 420),
    otpSecret: environment.OTP_SECRET,
    signSessionToken: signer.signSessionToken,
    verifySessionToken: signer.verifySessionToken,
    environment
  });
}

const apiServer = createServer(async (request, response) => {
  try {
    const api = await neonApiPromise;
    const url = new URL(request.url, `https://${request.headers.host || "music-school-ots.workers.dev"}`);
    await api(request, response, url);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendJson(response, 500, { error: "Internal server error" });
    else response.end();
  }
});
apiServer.listen(API_PORT);

export default {
  async fetch(request, environment) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      neonApiPromise ||= createWorkerApi(environment);
      return handleAsNodeRequest(API_PORT, request);
    }
    if (url.pathname === "/") {
      const indexUrl = new URL("/index.html", request.url);
      return environment.ASSETS.fetch(new Request(indexUrl, request));
    }
    if (url.pathname === "/admin") {
      const adminUrl = new URL("/admin.html", request.url);
      return environment.ASSETS.fetch(new Request(adminUrl, request));
    }
    return environment.ASSETS.fetch(request);
  }
};
