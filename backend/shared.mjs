import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SKILL_FIELDS = ["rhythm", "accuracy", "technique", "posture", "musicality", "confidence"];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, encoded) {
  const [salt, storedHash] = String(encoded || "").split(":");
  if (!salt || !storedHash) return false;
  const calculated = scryptSync(password, salt, 64);
  const stored = Buffer.from(storedHash, "hex");
  return stored.length === calculated.length && timingSafeEqual(stored, calculated);
}

export function normalizeSkillPayload(payload) {
  const result = {};
  for (const field of [...SKILL_FIELDS, "feedback_application"]) {
    result[field] = clamp(Number(payload[field]) || 1, 1, 5);
  }
  return result;
}
