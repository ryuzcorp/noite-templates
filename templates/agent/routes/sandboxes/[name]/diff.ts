import { defineHandler } from "void";

import { Agent } from "../../../durable-objects/agent";
import { checkAuth } from "../../../src/auth";
import { describeRpcError } from "../../../src/errors";
import { validateSandboxName } from "../../../src/sandbox-name";
import { workerEnv } from "../_shared";

/** GET /sandboxes/:name/diff — git status + diff of the sandbox checkout. */
export const GET = defineHandler(async (c) => {
  const env = workerEnv(c.env);
  const auth = checkAuth(c.req.raw, env.AGENT_TOKEN);
  if (!auth.ok) {
    return c.json({ error: auth.error }, auth.status);
  }
  const checked = validateSandboxName(c.req.param("name") ?? "");
  if (!checked.ok) {
    return c.json({ error: checked.message }, 400);
  }
  try {
    const result = await Agent.get(checked.name).getDiff(checked.name);
    if (result.ok) {
      return c.json({ commit: result.commit, status: result.status, stat: result.stat, diff: result.diff });
    }
    if (result.code === "restoring") {
      return c.json({ status: "restoring", error: result.message, code: result.code }, 409);
    }
    const status = result.code === "git_failed" ? 502 : 409;
    return c.json({ error: result.message, code: result.code }, status);
  } catch (error) {
    const described = describeRpcError(error);
    return Response.json({ error: described.message, code: described.code }, { status: described.status });
  }
});
