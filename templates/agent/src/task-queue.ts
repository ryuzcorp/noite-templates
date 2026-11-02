/**
 * Task admission (POST path, fast) + pending-task drive (alarm path, slow
 * allowed), dependency-injected so tests drive them with fakes (the DO
 * class itself cannot load under bun: it needs `cloudflare:workers`).
 *
 * No request waits on slow work: POSTs validate cheaply (text, clone busy,
 * model, task busy), durably record a pending/starting task, and answer
 * 202 at once. The alarm performs `ensureCheckout` before the harness
 * submit (worker) / before the pump submits (container, via
 * `prepareCheckout` in `container-pump.ts`); a failed restore fails the
 * task with a clear error. Recovery is preserved: a task after the
 * sandbox container was deleted still clones back and finishes, just from
 * the alarm instead of the POST.
 *
 * No timers, no sleeps.
 */

import { ConversationBusy, type SubmissionId } from "@earendil-works/pi-durable";

import type { ContainerTaskRecord } from "./container-pump";
import { describeContainerError } from "./errors";
import type { EnsureOutcome, RepositoryRecord } from "./repo-clone";

export type StartErrorCode =
  | "invalid_repository"
  | "invalid_ref"
  | "invalid_task"
  | "repo_busy"
  | "task_busy"
  | "model_not_configured"
  | "unknown_model"
  | "submit_failed"
  | "init_failed";

export type StartResult = { ok: true } | { ok: false; code: StartErrorCode; message: string };

export type WorkerTaskStatus = "pending" | "running" | "done" | "failed";

export interface WorkerTaskRecord {
  status: WorkerTaskStatus;
  /** Task text until it is submitted to the harness, then cleared. */
  text?: string;
  submissionId?: SubmissionId;
  error?: string;
  updatedAt: number;
}

export type ModelCheck =
  | { ok: true }
  | { ok: false; code: "model_not_configured" | "unknown_model"; message: string };

/**
 * Full task deps, shared by admission (fast subset) and drive (all).
 * Admission must never touch `ensureCheckout`/`submit` — tests pass
 * hanging mocks and assert 202 — while drive performs them from the alarm.
 */
export interface WorkerQueueDeps {
  loadRepo(): Promise<RepositoryRecord | null>;
  loadTask(): Promise<WorkerTaskRecord | null>;
  saveTask(task: WorkerTaskRecord): Promise<void>;
  setAlarm(): Promise<void>;
  now(): number;
  checkModel(): ModelCheck | Promise<ModelCheck>;
  ensureCheckout(): Promise<EnsureOutcome>;
  submit(text: string): Promise<SubmissionId>;
}

export interface ContainerQueueDeps {
  loadRepo(): Promise<RepositoryRecord | null>;
  loadTask(): Promise<ContainerTaskRecord | null>;
  saveTask(task: ContainerTaskRecord): Promise<void>;
  clearMirror(): Promise<void>;
  setAlarm(): Promise<void>;
  now(): number;
  checkModel(): ModelCheck | Promise<ModelCheck>;
  /** Unused by admission (proves the fast path); the pump restores via `prepareCheckout`. */
  ensureCheckout(): Promise<EnsureOutcome>;
}

function invalidTask(text: string): boolean {
  return text.trim() === "" || text.length > 20_000;
}

/**
 * Admit one worker task: cheap checks only, record pending, arm the alarm.
 * Never touches the container (no `ensureCheckout`, no submit).
 */
export async function admitWorkerTask(deps: WorkerQueueDeps, text: string): Promise<StartResult> {
  if (invalidTask(text)) {
    return { ok: false, code: "invalid_task", message: "task text is required (max 20000 chars)" };
  }
  const repository = await deps.loadRepo();
  if (repository?.status === "cloning") {
    return { ok: false, code: "repo_busy", message: "repository clone in progress; wait for it to finish" };
  }
  const model = await deps.checkModel();
  if (!model.ok) {
    return { ok: false, code: model.code, message: model.message };
  }
  const existing = await deps.loadTask();
  if (existing?.status === "pending" || existing?.status === "running") {
    return { ok: false, code: "task_busy", message: "a task is already running; wait for it to finish" };
  }
  const record: WorkerTaskRecord = { status: "pending", text, updatedAt: deps.now() };
  try {
    await deps.saveTask(record);
    await deps.setAlarm();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await deps.saveTask({ ...record, status: "failed", text: undefined, error: message }).catch(() => undefined);
    return { ok: false, code: "submit_failed", message };
  }
  return { ok: true };
}

/**
 * Drive one pending worker task from the alarm: restore the checkout,
 * then submit to the harness. A failed restore (or lost text, or busy
 * harness) fails the task with a clear error instead of hanging.
 */
export async function drivePendingWorkerTask(deps: WorkerQueueDeps): Promise<{ didWork: boolean }> {
  const task = await deps.loadTask();
  if (task === null || task.status !== "pending") {
    return { didWork: false };
  }
  const text = task.text ?? "";
  if (text === "") {
    await deps.saveTask({
      status: "failed",
      error: "task text was lost before it reached the harness",
      updatedAt: deps.now(),
    });
    return { didWork: true };
  }
  let ensured: EnsureOutcome;
  try {
    ensured = await deps.ensureCheckout();
  } catch (error) {
    const described = describeContainerError(error);
    await deps.saveTask({
      status: "failed",
      error: `checkout restore failed: ${described.code}: ${described.message}`,
      updatedAt: deps.now(),
    });
    return { didWork: true };
  }
  if (!ensured.ok) {
    await deps.saveTask({
      status: "failed",
      error: `checkout restore failed: ${ensured.message}`,
      updatedAt: deps.now(),
    });
    return { didWork: true };
  }
  try {
    const submissionId = await deps.submit(text);
    await deps.saveTask({ status: "running", submissionId, updatedAt: deps.now() });
    return { didWork: true };
  } catch (error) {
    if (error instanceof ConversationBusy) {
      await deps.saveTask({
        status: "failed",
        error: "a task is already running; wait for it to finish",
        updatedAt: deps.now(),
      });
      return { didWork: true };
    }
    const described = describeContainerError(error);
    await deps.saveTask({ status: "failed", error: described.message, updatedAt: deps.now() });
    return { didWork: true };
  }
}

/**
 * Admit one container task: cheap checks only, record starting, arm the
 * alarm. Never touches the container (no `ensureCheckout`); the pump
 * restores via `prepareCheckout` before it submits.
 */
export async function admitContainerTask(deps: ContainerQueueDeps, text: string): Promise<StartResult> {
  if (invalidTask(text)) {
    return { ok: false, code: "invalid_task", message: "task text is required (max 20000 chars)" };
  }
  const repository = await deps.loadRepo();
  if (repository?.status === "cloning") {
    return { ok: false, code: "repo_busy", message: "repository clone in progress; wait for it to finish" };
  }
  const model = await deps.checkModel();
  if (!model.ok) {
    return { ok: false, code: model.code, message: model.message };
  }
  const existing = await deps.loadTask();
  if (existing?.status === "starting" || existing?.status === "running") {
    return { ok: false, code: "task_busy", message: "a task is already running; wait for it to finish" };
  }
  const record: ContainerTaskRecord = { status: "starting", text, cursor: 0, failures: 0, updatedAt: deps.now() };
  try {
    await deps.saveTask(record);
    await deps.clearMirror();
    await deps.setAlarm();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await deps.saveTask({ ...record, status: "failed", text: undefined, error: message }).catch(() => undefined);
    return { ok: false, code: "submit_failed", message };
  }
  return { ok: true };
}
