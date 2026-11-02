/**
 * Fast diff read (GET path), dependency-injected so tests drive it with
 * fakes. Answers from the container only when the checkout exists; when it
 * is missing — or the container isn't running yet — schedules the restore
 * durably (the alarm performs it) and answers `restoring` at once, never
 * waiting on a clone or on the 90 s container start grace. Plain git calls
 * use a short timeout and zero start grace, so a GET never blocks past the
 * edge deadline.
 *
 * No timers, no sleeps.
 */

import { describeContainerError } from "./errors";
import { REPO_DIR, shellQuote } from "./paths";
import { parseRepoHosts, validateRepositoryUrl } from "./repo-url";
import type { CloneDeps, RepositoryRecord, RepoStore } from "./repo-clone";
import { truncateText } from "./transcript";

export type DiffResult =
  | { ok: true; commit?: string; status: string; stat: string; diff: string }
  | {
      ok: false;
      code: "no_repository" | "repo_busy" | "git_failed" | "restoring";
      message: string;
    };

/** Per-command deadline for diff reads (well under the 30 s edge timeout). */
export const DIFF_TIMEOUT = 10_000;

/** Full-diff cap, matching the agent object's transcript cap. */
const DIFF_CAP = 32_768;

export const RESTORING_MESSAGE = "checkout is being restored; retry shortly";

export interface DiffReadDeps {
  store: RepoStore;
  deps: CloneDeps;
  /** Fast liveness probe: no start, no wait. */
  isRunning(): Promise<boolean>;
  /** Durably schedule the restore (record the request + arm the alarm). */
  scheduleRestore(): Promise<void>;
  repoHosts: string | undefined;
}

/** Only this failure means "container not there yet" (start it via alarm). */
export function isNoSuchContainer(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such container/i.test(message);
}

function restoring(): DiffResult {
  return { ok: false, code: "restoring", message: RESTORING_MESSAGE };
}

/**
 * Read git status + diff, or schedule a restore and answer `restoring`.
 * `no_repository` (never cloned) vs `git_failed` (clone failed or git
 * broke) vs `restoring` (missing checkout / cold container, retry) are
 * distinct codes.
 */
export async function readDiff(deps: DiffReadDeps): Promise<DiffResult> {
  const repository = await deps.store.loadRepo();
  if (repository === null) {
    return { ok: false, code: "no_repository", message: "no repository cloned yet" };
  }
  if (repository.status === "cloning") {
    return { ok: false, code: "repo_busy", message: "repository clone in progress" };
  }
  if (repository.status === "failed") {
    return { ok: false, code: "git_failed", message: repository.error ?? "last clone failed" };
  }

  async function scheduleOrFail(record: RepositoryRecord): Promise<DiffResult> {
    // Allowlist re-check, matching `ensureCheckout`: hosts may have changed
    // since the record was stored.
    const valid = validateRepositoryUrl(record.url, parseRepoHosts(deps.repoHosts));
    if (!valid.ok) {
      await deps.store.saveRepo({ ...record, status: "failed", error: valid.message });
      return { ok: false, code: "git_failed", message: valid.message };
    }
    try {
      await deps.scheduleRestore();
    } catch (error) {
      const described = describeContainerError(error);
      return { ok: false, code: "git_failed", message: `${described.code}: ${described.message}` };
    }
    return restoring();
  }

  let running: boolean;
  try {
    running = await deps.isRunning();
  } catch (error) {
    const described = describeContainerError(error);
    return { ok: false, code: "git_failed", message: `${described.code}: ${described.message}` };
  }
  if (!running) {
    return scheduleOrFail(repository);
  }

  let probe: { success: boolean; stdout: string; stderr: string };
  try {
    // No cwd: `git -C` reports a missing dir as a plain failure instead of
    // a change-directory transport error. Zero start grace: a recycled
    // container answers `restoring` instead of blocking.
    probe = await deps.deps.exec(`git -C ${shellQuote(REPO_DIR)} rev-parse HEAD`, {
      timeout: DIFF_TIMEOUT,
      startGraceMs: 0,
    });
  } catch (error) {
    if (isNoSuchContainer(error)) {
      return scheduleOrFail(repository);
    }
    const described = describeContainerError(error);
    return { ok: false, code: "git_failed", message: `${described.code}: ${described.message}` };
  }
  if (!probe.success) {
    return scheduleOrFail(repository);
  }

  try {
    const status = await deps.deps.exec("git status --short", {
      cwd: REPO_DIR,
      timeout: DIFF_TIMEOUT,
      startGraceMs: 0,
    });
    const stat = await deps.deps.exec("git diff --stat", {
      cwd: REPO_DIR,
      timeout: DIFF_TIMEOUT,
      startGraceMs: 0,
    });
    const diff = await deps.deps.exec("git diff", {
      cwd: REPO_DIR,
      timeout: DIFF_TIMEOUT,
      startGraceMs: 0,
    });
    if (!status.success || !stat.success || !diff.success) {
      const failed = !status.success ? status : !stat.success ? stat : diff;
      return {
        ok: false,
        code: "git_failed",
        message: truncateText(failed.stderr || failed.stdout || "git command failed"),
      };
    }
    return {
      ok: true,
      ...(repository.commit === undefined ? {} : { commit: repository.commit }),
      status: truncateText(status.stdout),
      stat: truncateText(stat.stdout),
      diff: truncateText(diff.stdout, DIFF_CAP),
    };
  } catch (error) {
    if (isNoSuchContainer(error)) {
      return scheduleOrFail(repository);
    }
    const described = describeContainerError(error);
    return { ok: false, code: "git_failed", message: `${described.code}: ${described.message}` };
  }
}
