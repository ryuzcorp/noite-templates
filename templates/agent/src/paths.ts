/** Repo-dir path confinement for the worker-mode tools. Pure: unit-tested. */

export const REPO_DIR = "/workspace/repo";

export type RepoPath = { ok: true; path: string } | { ok: false; message: string };

/** Lexical POSIX normalization (no filesystem access, no symlink resolution). */
function normalizePosix(path: string): string {
  const parts = path.split("/");
  const kept: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") {
      continue;
    }
    if (part === "..") {
      kept.pop();
      continue;
    }
    kept.push(part);
  }
  return `/${kept.join("/")}`;
}

function withinRepo(path: string): boolean {
  return path === REPO_DIR || path.startsWith(`${REPO_DIR}/`);
}

/**
 * Resolve a tool-supplied path against REPO_DIR. Absolute paths must already
 * be inside the repo; relative paths are joined to it. `..` escapes, empty
 * paths, and control characters (including NUL/newline, which would break
 * shell quoting) are refused. This is the lexical half of confinement; the
 * caller additionally resolves symlinks via `realpath` in the container and
 * re-checks the prefix before touching the filesystem.
 *
 * Confinement is defense-in-depth against accidents and indirect prompt
 * injection, not a sandbox boundary: check-then-act races (TOCTOU) remain
 * by construction with this API, and the model already has unconstrained
 * `exec`. The container itself is the boundary.
 */
export function resolveRepoPath(input: string): RepoPath {
  // oxlint-disable-next-line no-control-regex -- intentional: control chars would break shell quoting
  if (input === "" || /[\0-\x1f\x7f]/.test(input)) {
    return { ok: false, message: "path is empty or contains control characters" };
  }
  const joined = input.startsWith("/") ? input : `${REPO_DIR}/${input}`;
  const normalized = normalizePosix(joined);
  if (!withinRepo(normalized)) {
    return { ok: false, message: `path escapes the repository (${REPO_DIR})` };
  }
  return { ok: true, path: normalized };
}

/** Single-quote a path for `sh`. Only used on paths that passed validation. */
export function shellQuote(path: string): string {
  return `'${path.replace(/'/g, `'\\''`)}'`;
}
