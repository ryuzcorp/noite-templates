import { defineHandler } from "void";
import type { InferProps } from "void";

export interface Todo {
  id: number;
  text: string;
}

// In-memory store for the starter. Swap in `void/db` for persistence.
const todos: Todo[] = [{ id: 1, text: "Render a page with Void and Ilha" }];

export type Props = InferProps<typeof loader>;

export const loader = defineHandler(() => ({ todos }));

export const action = defineHandler(async (c) => {
  const { text } = await c.req.json<{ text?: string }>();
  const trimmed = text?.trim() ?? "";
  if (!trimmed) {
    return c.json({ errors: { text: "Write something first." } }, 422);
  }
  todos.push({ id: todos.length + 1, text: trimmed });
  // Return nothing: Void re-runs the loader and answers with the page JSON
  // (`X-VoidPages`), which the client applies in place. Returning data here
  // would bypass the pages protocol and force a full-page reload, dropping
  // every in-flight client script.
});
