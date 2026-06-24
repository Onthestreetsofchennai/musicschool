import { EmailMessage } from "cloudflare:email";

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function stripHeader(value) {
  return String(value || "").replace(/[\r\n]/g, " ").trim();
}

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return json(405, { error: "Method not allowed" });

    const authorization = request.headers.get("Authorization") || "";
    if (authorization !== `Bearer ${env.WORKER_SHARED_SECRET}`) {
      return json(401, { error: "Unauthorized" });
    }

    const body = await request.json();
    const from = stripHeader(body.from);
    const to = stripHeader(body.to);
    const subject = stripHeader(body.subject);
    if (!from || !to || !subject || !body.text) {
      return json(400, { error: "from, to, subject and text are required" });
    }

    const messageId = crypto.randomUUID();
    const raw = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Message-ID: <${messageId}@ots>`,
      "MIME-Version: 1.0",
      'Content-Type: text/html; charset="UTF-8"',
      "",
      String(body.html || body.text)
    ].join("\r\n");

    await env.SEND_EMAIL.send(new EmailMessage(from, to, raw));
    return json(200, { ok: true, messageId });
  }
};

