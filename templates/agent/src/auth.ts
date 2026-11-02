/** Bearer-token auth for the sandbox routes. Pure: unit-tested. */

export const TOKEN_SETUP_MESSAGE =
  "Agent token is not configured. Set AGENT_TOKEN in Noite Settings -> Environment and redeploy.";

/** A configured token, or undefined when the operator never set one. */
export function configuredToken(raw: string | undefined | null): string | undefined {
  const trimmed = (raw ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Constant-time string equality over UTF-8 bytes: always walks the full
 * length of the longer input so the comparison time does not reveal where
 * two tokens differ. Only the (unpadded) length leaks, which a bearer token
 * does not need to hide.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  const length = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let index = 0; index < length; index++) {
    diff |= (ab[index] ?? 0) ^ (bb[index] ?? 0);
  }
  return diff === 0;
}

export type AuthVerdict = { ok: true } | { ok: false; status: 401 | 503; error: string };

/**
 * Gate one request on `Authorization: Bearer <AGENT_TOKEN>`. A missing
 * token *configuration* is a 503 with the operator-facing setup message;
 * a missing or wrong *credential* is a 401 that reveals nothing.
 */
export function checkAuth(request: Request, rawToken: string | undefined | null): AuthVerdict {
  const token = configuredToken(rawToken);
  if (token === undefined) {
    return { ok: false, status: 503, error: TOKEN_SETUP_MESSAGE };
  }
  const header = request.headers.get("authorization") ?? "";
  const space = header.indexOf(" ");
  const scheme = space === -1 ? header : header.slice(0, space);
  const credential = space === -1 ? "" : header.slice(space + 1).trim();
  if (scheme.toLowerCase() !== "bearer" || credential === "" || !constantTimeEqual(credential, token)) {
    return { ok: false, status: 401, error: "missing or invalid bearer token" };
  }
  return { ok: true };
}
