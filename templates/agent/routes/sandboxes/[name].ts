import { defineHandler } from "void";

import { Agent } from "../../durable-objects/agent";
import { checkAuth } from "../../src/auth";
import { describeRpcError } from "../../src/errors";
import { validateSandboxName } from "../../src/sandbox-name";
import { workerEnv } from "./_shared";

/** GET /sandboxes/:name — state. Never waits, never starts the container. */
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
    const result = await Agent.get(checked.name).getSandboxState();
    if (!result.ok) {
      return c.json({ error: result.message, code: result.code }, 500);
    }
    return c.json(result.state);
  } catch (error) {
    const described = describeRpcError(error);
    return Response.json({ error: described.message, code: described.code }, { status: described.status });
  }
});
