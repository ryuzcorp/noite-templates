/** Repository URL + ref validation. Pure: unit-tested. */

export const DEFAULT_REPO_HOSTS = ["github.com"];

/**
 * Parse REPO_HOSTS (comma list). Empty entries are dropped; an empty or
 * missing value falls back to DEFAULT_REPO_HOSTS. Hosts compare
 * case-insensitively, so they are lowercased here.
 */
export function parseRepoHosts(raw: string | undefined | null): string[] {
  const hosts = (raw ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== "");
  return hosts.length === 0 ? [...DEFAULT_REPO_HOSTS] : hosts;
}

export type UrlValidation = { ok: true; normalized: string } | { ok: false; message: string };

/**
 * Accept only plain `https://host/path` URLs on an allowlisted host.
 * Userinfo (`https://token@host/…`) and explicit ports are rejected: the
 * former would hand a credential to the container, the latter widens the
 * SSRF surface (non-TLS git daemons, internal services on odd ports).
 */
export function validateRepositoryUrl(url: string, hosts: readonly string[]): UrlValidation {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, message: "repository url must be an https:// URL" };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, message: "repository url must be an https:// URL" };
  }
  if (parsed.username !== "" || parsed.password !== "") {
    return { ok: false, message: "repository url must not contain credentials" };
  }
  if (parsed.port !== "") {
    return { ok: false, message: "repository url must not contain an explicit port" };
  }
  if (parsed.pathname === "" || parsed.pathname === "/") {
    return { ok: false, message: "repository url must include a repository path" };
  }
  if (!hosts.includes(parsed.hostname.toLowerCase())) {
    return {
      ok: false,
      message: `repository host "${parsed.hostname}" is not allowlisted (REPO_HOSTS)`,
    };
  }
  parsed.hash = "";
  return { ok: true, normalized: parsed.toString() };
}

/** Ref allowlist: git branch/tag/sha characters only, so refs passed to git
 * through the shell cannot inject commands. */
export function validRef(ref: string): boolean {
  return /^[A-Za-z0-9._/-]{1,128}$/.test(ref);
}

export type RefClassification =
  | { kind: "sha"; sha: string }
  | { kind: "branch"; ref: string }
  | { kind: "invalid" };

/**
 * Classify a ref: a full 40-hex SHA is checked out detached after an
 * explicit fetch; anything else valid is a branch/tag name for checkout.
 */
export function classifyRef(ref: string): RefClassification {
  if (!validRef(ref)) {
    return { kind: "invalid" };
  }
  if (/^[0-9a-fA-F]{40}$/.test(ref)) {
    return { kind: "sha", sha: ref.toLowerCase() };
  }
  return { kind: "branch", ref };
}
