import { describe, expect, test } from "bun:test";

import { ConversationBusy } from "@earendil-works/pi-durable";

import type { ContainerTaskRecord } from "../src/container-pump";
import type { EnsureOutcome, RepositoryRecord } from "../src/repo-clone";
import {
  admitContainerTask,
  admitWorkerTask,
  drivePendingWorkerTask,
  type ContainerQueueDeps,
  type ModelCheck,
  type WorkerQueueDeps,
  type WorkerTaskRecord,
} from "../src/task-queue";

const URL = "https://github.com/org/repo";

function hangingEnsure(): Promise<EnsureOutcome> {
  // Never resolves: admission awaiting it would hang the POST past the edge
  // timeout. The test asserts admission returns without touching it (via a
  // throwing wrapper below, so a regression fails fast instead of hanging).
  return new Promise<EnsureOutcome>(() => undefined);
}

function throwingEnsure(): { fn: () => Promise<EnsureOutcome> } {
  return {
    fn: async () => {
      throw new Error("ensureCheckout must not run on the POST path");
    },
  };
}

function makeWorkerDeps(overrides: Partial<WorkerQueueDeps> = {}): WorkerQueueDeps & {
  saved: WorkerTaskRecord[];
  task: WorkerTaskRecord | null;
  alarms: number;
} {
  const harness = {
    saved: [] as WorkerTaskRecord[],
    task: null as WorkerTaskRecord | null,
    alarms: 0,
    deps: undefined as unknown as WorkerQueueDeps,
  };
  const deps: WorkerQueueDeps = {
    loadRepo: async () => ({ url: URL, status: "ready" }) as RepositoryRecord,
    loadTask: async () => harness.task,
    saveTask: async (task) => {
      harness.task = task;
      harness.saved.push(task);
    },
    setAlarm: async () => {
      harness.alarms += 1;
    },
    now: () => 1_700_000_000_000,
    checkModel: () => ({ ok: true }) as ModelCheck,
    ensureCheckout: () => hangingEnsure(),
    submit: async () => {
      throw new Error("submit must not run on the POST path");
    },
    ...overrides,
  };
  return Object.assign(deps, { saved: harness.saved, task: harness.task, alarms: harness.alarms });
}

function makeContainerDeps(overrides: Partial<ContainerQueueDeps> = {}): ContainerQueueDeps & {
  saved: ContainerTaskRecord[];
  task: ContainerTaskRecord | null;
  alarms: number;
  mirrors: number;
} {
  const harness = {
    saved: [] as ContainerTaskRecord[],
    task: null as ContainerTaskRecord | null,
    alarms: 0,
    mirrors: 0,
  };
  const deps: ContainerQueueDeps = {
    loadRepo: async () => ({ url: URL, status: "ready" }) as RepositoryRecord,
    loadTask: async () => harness.task,
    saveTask: async (task) => {
      harness.task = task;
      harness.saved.push(task);
    },
    clearMirror: async () => {
      harness.mirrors += 1;
    },
    setAlarm: async () => {
      harness.alarms += 1;
    },
    now: () => 1_700_000_000_000,
    checkModel: () => ({ ok: true }) as ModelCheck,
    ensureCheckout: () => hangingEnsure(),
    ...overrides,
  };
  // Rebind live views (the harness object above is the source of truth).
  return {
    ...deps,
    get saved() {
      return harness.saved;
    },
    get task() {
      return harness.task;
    },
    get alarms() {
      return harness.alarms;
    },
    get mirrors() {
      return harness.mirrors;
    },
    loadTask: async () => harness.task,
    saveTask: async (task) => {
      harness.task = task;
      harness.saved.push(task);
    },
    setAlarm: async () => {
      harness.alarms += 1;
    },
    clearMirror: async () => {
      harness.mirrors += 1;
    },
  };
}

describe("admitWorkerTask", () => {
  test("returns 202 without touching the checkout or the harness submit", async () => {
    const ensure = throwingEnsure();
    const state: { task: WorkerTaskRecord | null; alarms: number; submits: number } = {
      task: null,
      alarms: 0,
      submits: 0,
    };
    const result = await admitWorkerTask(
      {
        loadRepo: async () => ({ url: URL, status: "ready" }) as RepositoryRecord,
        loadTask: async () => state.task,
        saveTask: async (next) => {
          state.task = next;
        },
        setAlarm: async () => {
          state.alarms += 1;
        },
        now: () => 1_700_000_000_000,
        checkModel: () => ({ ok: true }) as ModelCheck,
        ensureCheckout: ensure.fn,
        submit: async () => {
          state.submits += 1;
          throw new Error("must not submit on POST");
        },
      },
      "do it"
    );
    expect(result).toEqual({ ok: true });
    expect(state.task?.status).toBe("pending");
    expect(state.task?.text).toBe("do it");
    expect(state.alarms).toBe(1);
    expect(state.submits).toBe(0);
  });

  test("keeps the cheap checks synchronous: clone busy, model, task busy", async () => {
    const busyRepo = makeWorkerDeps({ loadRepo: async () => ({ url: URL, status: "cloning" }) });
    expect(await admitWorkerTask(busyRepo, "do it")).toMatchObject({ ok: false, code: "repo_busy" });

    const noModel = makeWorkerDeps({
      checkModel: () => ({ ok: false, code: "model_not_configured", message: "set key" }),
    });
    expect(await admitWorkerTask(noModel, "do it")).toMatchObject({ ok: false, code: "model_not_configured" });

    // Pending (not yet submitted) still counts as busy: one run per sandbox.
    let task: WorkerTaskRecord | null = { status: "pending", text: "first", updatedAt: 0 };
    const busyTask = makeWorkerDeps({ loadTask: async () => task });
    expect(await admitWorkerTask(busyTask, "second")).toMatchObject({ ok: false, code: "task_busy" });
    task = { status: "running", updatedAt: 0 };
    expect(await admitWorkerTask(busyTask, "second")).toMatchObject({ ok: false, code: "task_busy" });
  });
});

describe("drivePendingWorkerTask", () => {
  test("restores the checkout in the alarm path, then submits", async () => {
    const order: string[] = [];
    const state: { task: WorkerTaskRecord | null } = {
      task: { status: "pending", text: "do it", updatedAt: 0 },
    };
    const outcome = await drivePendingWorkerTask({
      loadRepo: async () => null,
      loadTask: async () => state.task,
      saveTask: async (next) => {
        state.task = next;
      },
      setAlarm: async () => undefined,
      now: () => 1_700_000_000_001,
      checkModel: () => ({ ok: true }) as ModelCheck,
      ensureCheckout: async () => {
        order.push("restore");
        return { ok: true, restored: true };
      },
      submit: async (text) => {
        order.push("submit");
        expect(text).toBe("do it");
        return "sub-1" as never;
      },
    });
    expect(outcome).toEqual({ didWork: true });
    expect(order).toEqual(["restore", "submit"]);
    expect(state.task?.status).toBe("running");
    expect(state.task?.text).toBeUndefined();
  });

  test("a failed restore fails the task without submitting", async () => {
    const state: { task: WorkerTaskRecord | null; submits: number } = {
      task: { status: "pending", text: "do it", updatedAt: 0 },
      submits: 0,
    };
    const outcome = await drivePendingWorkerTask({
      loadRepo: async () => null,
      loadTask: async () => state.task,
      saveTask: async (next) => {
        state.task = next;
      },
      setAlarm: async () => undefined,
      now: () => 1_700_000_000_001,
      checkModel: () => ({ ok: true }) as ModelCheck,
      ensureCheckout: async () => ({ ok: false, message: "clone failed (exit 128)" }),
      submit: async () => {
        state.submits += 1;
        return "sub-1" as never;
      },
    });
    expect(outcome).toEqual({ didWork: true });
    expect(state.submits).toBe(0);
    expect(state.task?.status).toBe("failed");
    expect(state.task?.error).toContain("checkout restore failed");
    expect(state.task?.error).toContain("clone failed");
  });

  test("a busy harness fails the pending task instead of hanging", async () => {
    const state: { task: WorkerTaskRecord | null } = {
      task: { status: "pending", text: "do it", updatedAt: 0 },
    };
    await drivePendingWorkerTask({
      loadRepo: async () => null,
      loadTask: async () => state.task,
      saveTask: async (next) => {
        state.task = next;
      },
      setAlarm: async () => undefined,
      now: () => 0,
      checkModel: () => ({ ok: true }) as ModelCheck,
      ensureCheckout: async () => ({ ok: true, restored: false }),
      submit: async () => {
        throw new ConversationBusy(0 as never);
      },
    });
    expect(state.task?.status).toBe("failed");
    expect(state.task?.error).toContain("already running");
  });

  test("no pending task is a no-op (running tasks drive via the harness)", async () => {
    let restores = 0;
    const outcome = await drivePendingWorkerTask({
      loadRepo: async () => null,
      loadTask: async () => ({ status: "running", updatedAt: 0 }),
      saveTask: async () => {
        throw new Error("must not save without pending work");
      },
      setAlarm: async () => undefined,
      now: () => 0,
      checkModel: () => ({ ok: true }) as ModelCheck,
      ensureCheckout: async () => {
        restores += 1;
        return { ok: true, restored: false };
      },
      submit: async () => "sub-1" as never,
    });
    expect(outcome).toEqual({ didWork: false });
    expect(restores).toBe(0);
  });
});

describe("admitContainerTask", () => {
  test("returns 202 without touching the checkout", async () => {
    const ensure = throwingEnsure();
    const state: { task: ContainerTaskRecord | null; alarms: number } = { task: null, alarms: 0 };
    const result = await admitContainerTask(
      {
        loadRepo: async () => ({ url: URL, status: "ready" }) as RepositoryRecord,
        loadTask: async () => state.task,
        saveTask: async (next) => {
          state.task = next;
        },
        clearMirror: async () => undefined,
        setAlarm: async () => {
          state.alarms += 1;
        },
        now: () => 1_700_000_000_000,
        checkModel: () => ({ ok: true }) as ModelCheck,
        ensureCheckout: ensure.fn,
      },
      "do it"
    );
    expect(result).toEqual({ ok: true });
    expect(state.task?.status).toBe("starting");
    expect(state.alarms).toBe(1);
  });

  test("keeps the cheap checks synchronous", async () => {
    const deps = makeContainerDeps({ loadRepo: async () => ({ url: URL, status: "cloning" }) });
    expect(await admitContainerTask(deps, "do it")).toMatchObject({ ok: false, code: "repo_busy" });
  });
});
