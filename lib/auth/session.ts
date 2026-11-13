/**
 * Token sesi yang ditandatangani HMAC-SHA256 (Web Crypto).
 * Aman dipakai di Edge middleware maupun Node API routes.
 *
 * Format: base64url(JSON payload) + "." + base64url(signature)
 * Payload hanya berisi id user, session_version & waktu kedaluwarsa.
 * Role & status aktif selalu dibaca ulang dari database oleh middleware.
 */

export const SESSION_COOKIE = "dipo_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 jam (1 shift)

export interface SessionPayload {
  uid: string;
  ver: number;
  exp: number; // unix detik
}

const encoder = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): Uint8Array<ArrayBuffer> {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** AUTH_SECRET wajib minimal 32 karakter. */
export function getAuthSecret(): string | null {
  const secret = process.env.AUTH_SECRET?.trim();
  return secret && secret.length >= 32 ? secret : null;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function signSession(payload: Omit<SessionPayload, "exp">, secret: string): Promise<string> {
  const full: SessionPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS };
  const body = base64UrlEncode(encoder.encode(JSON.stringify(full)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body));
  return `${body}.${base64UrlEncode(new Uint8Array(sig))}`;
}

export async function verifySession(token: string | undefined | null, secret: string): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), base64UrlDecode(sig), encoder.encode(body));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as SessionPayload;
    if (typeof payload.uid !== "string" || typeof payload.ver !== "number" || typeof payload.exp !== "number") return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAge = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
