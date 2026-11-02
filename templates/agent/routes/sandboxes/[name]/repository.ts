import { defineHandler } from "void";
import { z } from "zod";

import { Agent, type StartErrorCode, type StartResult } from "../../../durable-objects/agent";
import { checkAuth } from "../../../src/auth";
import { describeRpcError } from "../../../src/errors";
import { parseRepoHosts, validateRepositoryUrl } from "../../../src/repo-url";
import { validateSandboxName } from "../../../src/sandbox-name";
import { workerEnv } from "../_shared";

const repositorySchema = z.object({
  url: z.string().min(1, "repository url is required").max(2000),
  ref: z
    .string()
    .regex(/^[A-Za-z0-9._/-]+$/, "invalid ref")
    .max(128)
    .optional(),
});

function startStatus(code: StartErrorCode): 400 | 409 | 503 | 500 {
  switch (code) {
    case "invalid_repository":
    case "invalid_ref":
    case "invalid_task":
      return 400;
    case "repo_busy":
    case "task_busy":
      return 409;
    case "model_not_configured":
    case "unknown_model":
      return 503;
    case "submit_failed":
    case "init_failed":
      return 500;
  }
}

/** POST /sandboxes/:name/repository — record a clone/refresh, run it in the background. */
export const POST = defineHandler(async (c) => {
  const env = workerEnv(c.env);
  const auth = checkAuth(c.req.raw, env.AGENT_TOKEN);
  if (!auth.ok) {
    return c.json({ error: auth.error }, auth.status);
  }
  const checked = validateSandboxName(c.req.param("name") ?? "");
  if (!checked.ok) {
    return c.json({ error: checked.message }, 400);
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  const parsed = repositorySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "invalid repository" }, 400);
  }
  const url = validateRepositoryUrl(parsed.data.url, parseRepoHosts(env.REPO_HOSTS));
  if (!url.ok) {
    return c.json({ error: url.message }, 400);
  }
  let result: StartResult;
  try {
    result = await Agent.get(checked.name).startRepository(checked.name, url.normalized, parsed.data.ref);
  } catch (error) {
    const described = describeRpcError(error);
    return Response.json({ error: described.message, code: described.code }, { status: described.status });
  }
  if (!result.ok) {
    return c.json({ error: result.message, code: result.code }, startStatus(result.code));
  }
  return c.json({ status: "cloning" }, 202);
});
