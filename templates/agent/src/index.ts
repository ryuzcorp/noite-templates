import { getSandbox } from "@cloudflare/sandbox";
import { z } from "zod";

import { AgentSandbox } from "./agent";
import type { Env } from "./env";

export { AgentSandbox };

/**
 * HTTP front for the agent sandboxes. All state lives in the AgentSandbox
 * Durable Object (one per :name); this Worker only routes, validates, and
 * renders. Model credentials never leave Worker env.
 */

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

const repositorySchema = z.object({
  url: z.string().regex(/^https:\/\/[^/]+\/.+$/, "repository url must be an https:// URL"),
  ref: z
    .string()
    .regex(/^[A-Za-z0-9._/-]+$/, "invalid ref")
    .max(128)
    .optional(),
});

const taskJsonSchema = z.object({
  text: z.string().trim().min(1, "task text is required").max(20_000),
});

function sandboxFor(env: Env, name: string): AgentSandbox | Response {
  if (!NAME_PATTERN.test(name)) {
    return json({ error: "invalid sandbox name (lowercase letters, digits, dashes)" }, 400);
  }
  return getSandbox<AgentSandbox>(env.AgentSandbox, name);
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}


async function readTaskText(request: Request): Promise<string | Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid JSON body" }, 400);
    }
    const parsed = taskJsonSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "invalid task" }, 400);
    }
    return parsed.data.text;
  }
  const text = (await request.text()).trim();
  if (text === "" || text.length > 20_000) {
    return json({ error: "task text is required (max 20000 chars)" }, 400);
  }
  return text;
}

function humanPage(): Response {
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent sandbox</title></head>
<body>
<h1>Agent sandbox</h1>
<p>One named sandbox = one container + one durable conversation. Name it, point it at a repo, then give it a task.</p>
<label>Sandbox name <input id="name" value="demo" pattern="[a-z0-9][a-z0-9-]*"></label>
<h2>Repository</h2>
<label>URL <input id="url" size="60" placeholder="https://github.com/org/repo"></label>
<label>Ref <input id="ref" placeholder="main"></label>
<button id="clone">Clone / refresh</button>
<pre id="repoOut"></pre>
<h2>Task</h2>
<textarea id="task" rows="5" cols="80" placeholder="Fix the failing test and summarize the change"></textarea><br>
<button id="send">Send task</button>
<pre id="taskOut"></pre>
<h2>State</h2>
<button id="refresh">Refresh</button> <button id="diff">Diff</button>
<pre id="stateOut"></pre>
<script>
const $ = (id) => document.getElementById(id);
const name = () => $("name").value.trim();
async function show(promise, el) {
  $(el).textContent = "…";
  try { $(el).textContent = JSON.stringify(await promise, null, 2); }
  catch (e) { $(el).textContent = String(e); }
}
$("clone").onclick = async () => {
  const res = await fetch("/sandboxes/" + name() + "/repository", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: $("url").value, ref: $("ref").value || undefined }),
  });
  await show(res.json(), "repoOut");
};
$("send").onclick = async () => {
  const res = await fetch("/sandboxes/" + name() + "/task", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: $("task").value }),
  });
  await show(res.json(), "taskOut");
};
$("refresh").onclick = async () => {
  const res = await fetch("/sandboxes/" + name() + "/task");
  await show(res.json(), "stateOut");
};
$("diff").onclick = async () => {
  const res = await fetch("/sandboxes/" + name() + "/diff");
  await show(res.json(), "stateOut");
};
</script>
</body>
</html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") {
      return humanPage();
    }
    const match = /^\/sandboxes\/([^/]+)\/(repository|task|diff)$/.exec(url.pathname);
    if (match === null) {
      return json({ error: "not found" }, 404);
    }
    const name = match[1] ?? "";
    const resource = match[2] ?? "";
    const sandbox = sandboxFor(env, name);
    if (sandbox instanceof Response) {
      return sandbox;
    }

    if (request.method === "POST" && resource === "repository") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid JSON body" }, 400);
      }
      const parsed = repositorySchema.safeParse(body);
      if (!parsed.success) {
        return json({ error: parsed.error.issues[0]?.message ?? "invalid repository" }, 400);
      }
      const result = await sandbox.ensureRepository(parsed.data.url, parsed.data.ref);
      if (!result.ok) {
        return json({ error: result.message }, 502);
      }
      return json({ commit: result.commit });
    }

    if (request.method === "POST" && resource === "task") {
      const text = await readTaskText(request);
      if (text instanceof Response) {
        return text;
      }
      const result = await sandbox.submitTask(text);
      if (result.ok) {
        return json({ answer: result.answer, transcript: result.transcript });
      }
      const status = result.code === "run_failed" ? 500 : 503;
      return json({ error: result.message }, status);
    }

    if (request.method === "GET" && resource === "task") {
      return json(await sandbox.getSandboxState());
    }

    if (request.method === "GET" && resource === "diff") {
      const result = await sandbox.getDiff();
      if (result.ok) {
        return json({ commit: result.commit, status: result.status, diff: result.diff });
      }
      return json({ error: result.message }, 409);
    }

    return json({ error: "method not allowed" }, 405);
  },
};
