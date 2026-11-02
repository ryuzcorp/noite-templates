/**
 * Repository clone/refresh orchestration, dependency-injected so tests drive
 * it with fakes (the DO classes themselves cannot load under bun: they need
 * `cloudflare:workers`). Both the explicit
 * clone path (`repositoryPump`) and ephemeral-container recovery
 * (`ensureCheckout`, before tasks and diffs) run through `performClone`,
 * so there is exactly one git code path. No timers, no sleeps.
 */

import { describeContainerError } from "./errors";
import { REPO_DIR, shellQuote } from "./paths";
import { classifyRef, parseRepoHosts, validateRepositoryUrl } from "./repo-url";
import { truncateText } from "./transcript";

export type RepositoryStatus = "cloning" | "ready" | "failed";

export interface RepositoryRecord {
  url: string;
  ref?: string;
  commit?: string;
  status: RepositoryStatus;
  error?: string;
}

/** Fast git probes and one-shot file operations. */
export const GIT_TIMEOUT = 60_000;
/** Full clones may fetch more before the first byte of progress. */
export const CLONE_TIMEOUT = 120_000;

export interface CloneExecResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode?: number | null;
}

export interface CloneCheckoutOptions {
  targetDir: string;
  depth: number;
  cloneTimeoutMs: number;
  branch?: string;
}

/** Minimal structural view of the Sandbox container API the clone uses. */
export interface CloneDeps {
  exec(
    command: string,
    options?: { cwd?: string; timeout?: number; startGraceMs?: number }
  ): Promise<CloneExecResult>;
  exists(path: string): Promise<{ exists: boolean }>;
  checkout(url: string, options: CloneCheckoutOptions): Promise<{ success: boolean; exitCode?: number | null }>;
}

export interface RepoStore {
  loadRepo(): Promise<RepositoryRecord | null>;
  saveRepo(record: RepositoryRecord): Promise<void>;
}

export type CloneOutcome = { commit?: string } | { error: string };

export type EnsureOutcome = { ok: true; restored: boolean } | { ok: false; message: string };

/**
 * Clone or refresh the checkout at REPO_DIR, then resolve the new HEAD.
 * Refreshing an existing checkout fetches the requested branch (or HEAD
 * with no ref) and checks out the fetched commit from FETCH_HEAD: `git
 * fetch` only moves FETCH_HEAD, and single-branch clones never see other
 * branches, so a plain `git checkout <branch>` would be a stale no-op (or
 * fail on a branch the clone never saw). Returns the real new commit.
 */
export async function performClone(deps: CloneDeps, url: string, ref?: string): Promise<CloneOutcome> {
  const classification = ref === undefined ? undefined : classifyRef(ref);
  if (ref !== undefined && (classification === undefined || classification.kind === "invalid")) {
    return { error: "invalid ref" };
  }
  try {
    const marker = await deps.exists(`${REPO_DIR}/.git`);
    // Ground truth wins over storage: a checkout whose origin differs
    // from the requested URL is wiped and re-cloned.
    let fresh = !marker.exists;
    if (!fresh) {
      const origin = await deps.exec("git config --get remote.origin.url", {
        cwd: REPO_DIR,
        timeout: GIT_TIMEOUT,
      });
      if (!origin.success || origin.stdout.trim() !== url) {
        fresh = true;
      }
    }
    if (fresh) {
      if (marker.exists) {
        const wiped = await deps.exec(`rm -rf ${shellQuote(REPO_DIR)}`, { timeout: GIT_TIMEOUT });
        if (!wiped.success) {
          return { error: `could not clear the old checkout: ${truncateText(wiped.stderr || wiped.stdout)}` };
        }
      }
      const checkout = await deps.checkout(url, {
        targetDir: REPO_DIR,
        depth: 1,
        cloneTimeoutMs: CLONE_TIMEOUT,
        // SHAs are fetched explicitly below; only branches/tags go here.
        ...(classification?.kind === "branch" ? { branch: classification.ref } : {}),
      });
      if (!checkout.success) {
        return { error: `clone failed (exit ${checkout.exitCode ?? "?"})` };
      }
    }
    if (classification?.kind === "sha") {
      const fetched = await deps.exec(`git fetch --depth 1 origin ${classification.sha}`, {
        cwd: REPO_DIR,
        timeout: GIT_TIMEOUT,
      });
      if (!fetched.success) {
        return {
          error:
            `could not fetch SHA ${classification.sha.slice(0, 12)} ` +
            `(the server must allow fetching arbitrary SHAs): ${truncateText(fetched.stderr || fetched.stdout)}`,
        };
      }
      const checked = await deps.exec(`git checkout --detach ${classification.sha}`, {
        cwd: REPO_DIR,
        timeout: GIT_TIMEOUT,
      });
      if (!checked.success) {
        return { error: truncateText(checked.stderr || checked.stdout) };
      }
    } else if (!fresh) {
      const target = classification?.kind === "branch" ? classification.ref : "HEAD";
      const fetched = await deps.exec(`git fetch --depth 1 origin ${target}`, {
        cwd: REPO_DIR,
        timeout: GIT_TIMEOUT,
      });
      if (!fetched.success) {
        return { error: truncateText(fetched.stderr || fetched.stdout) };
      }
      const checkout =
        classification?.kind === "branch"
          ? `git checkout -B ${classification.ref} FETCH_HEAD`
          : "git checkout --detach FETCH_HEAD";
      const checked = await deps.exec(checkout, {
        cwd: REPO_DIR,
        timeout: GIT_TIMEOUT,
      });
      if (!checked.success) {
        return { error: truncateText(checked.stderr || checked.stdout) };
      }
    }
    const head = await deps.exec("git rev-parse HEAD", { cwd: REPO_DIR, timeout: GIT_TIMEOUT });
    const commit = head.success ? head.stdout.trim() || undefined : undefined;
    if (commit === undefined) {
      return {};
    }
    return { commit };
  } catch (error) {
    const described = describeContainerError(error);
    return { error: `${described.code}: ${described.message}` };
  }
}

/** Build the stored record for a finished clone/refresh. Pure. */
export function storeCloneResult(url: string, ref: string | undefined, outcome: CloneOutcome): RepositoryRecord {
  if ("error" in outcome) {
    return {
      url,
      ...(ref === undefined ? {} : { ref }),
      status: "failed",
      error: outcome.error,
    };
  }
  return {
    url,
    ...(ref === undefined ? {} : { ref }),
    ...(outcome.commit === undefined ? {} : { commit: outcome.commit }),
    status: "ready",
  };
}

/** Run `performClone` and durably store its outcome. Shared by the
 * scheduled clone pump and by `ensureCheckout` recovery. */
export async function runCloneAndStore(
  store: RepoStore,
  deps: CloneDeps,
  url: string,
  ref?: string
): Promise<CloneOutcome> {
  const outcome = await performClone(deps, url, ref);
  await store.saveRepo(storeCloneResult(url, ref, outcome));
  return outcome;
}

/**
 * Ephemeral-container recovery. `/workspace/repo` vanishes when the sandbox
 * container restarts (idle sleep, host restart) while the DO record still
 * says `ready`; the next task would then fail with "not a git repository".
 * Call this before a task runs or a diff is read: when the checkout is
 * really there it costs one fast probe, and when it is gone the recorded
 * url is re-cloned at the recorded ref (or, with no ref, at the recorded
 * commit) through the same `performClone` path as an explicit clone —
 * including the REPO_HOSTS allowlist re-check, since hosts may have
 * changed. A probe transport failure leaves the record untouched
 * (retryable); only a confirmed-missing checkout flips it through
 * `cloning`, so concurrent starters and readers observe `repo_busy`.
 */
export async function ensureCheckout(
  store: RepoStore,
  deps: CloneDeps,
  repoHosts: string | undefined
): Promise<EnsureOutcome> {
  const record = await store.loadRepo();
  if (record?.status !== "ready") {
    return { ok: true, restored: false };
  }
  let probe: CloneExecResult;
  try {
    // No cwd: `git -C` reports a missing dir as a plain failure instead of
    // a change-directory transport error.
    probe = await deps.exec(`git -C ${shellQuote(REPO_DIR)} rev-parse HEAD`, { timeout: GIT_TIMEOUT });
  } catch (error) {
    const described = describeContainerError(error);
    return { ok: false, message: `${described.code}: ${described.message}` };
  }
  if (probe.success) {
    return { ok: true, restored: false };
  }
  const valid = validateRepositoryUrl(record.url, parseRepoHosts(repoHosts));
  if (!valid.ok) {
    await store.saveRepo({ ...record, status: "failed", error: valid.message });
    return { ok: false, message: valid.message };
  }
  await store.saveRepo({
    url: valid.normalized,
    ...(record.ref === undefined ? {} : { ref: record.ref }),
    status: "cloning",
  });
  const outcome = await performClone(deps, valid.normalized, record.ref ?? record.commit);
  // The stored ref keeps its original shape: restoring by commit must not
  // pin a previously-tracking (ref-less) record to that SHA.
  await store.saveRepo(storeCloneResult(valid.normalized, record.ref, outcome));
  if ("error" in outcome) {
    return { ok: false, message: outcome.error };
  }
  return { ok: true, restored: true };
}
