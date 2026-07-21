import { randomBytes, createHash } from "crypto";

const RESET_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function generateResetToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashResetToken(token), expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) };
}

export function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
