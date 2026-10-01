// Demo login gate (Ranjan's call, DECISIONS F2): one hardcoded account. Not a
// real user system. The session cookie holds an HMAC of the username, so it
// cannot be forged without the server secret. Works in the proxy and in
// server actions (Web Crypto only).
export const LOGIN_USER = "aerchain";
export const LOGIN_PASSWORD = "qwerty";
export const SESSION_COOKIE = "qd_session";
export const SESSION_DAYS = 7;

function secret() {
  return process.env.AUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "quote-desk-local-dev";
}

export async function sessionToken(user: string = LOGIN_USER): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`quote-desk:${user}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const want = await sessionToken();
  if (token.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= token.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}
