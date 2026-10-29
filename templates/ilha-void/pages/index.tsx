import { Form, useForm } from "@ilha/void";
import { atom, watch } from "ilha";

import type { Props } from "./index.server.ts";

const CARD =
  "flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900";

export default function Home({ todos }: Props) {
  // The action declares no validator, so Void's generated route types leave
  // its body untyped (`Record<string, unknown>`): pass the URL as `string`
  // to use the untyped overload, typed from the defaults instead.
  const form = useForm("/" as string, { text: "" });
  // The form is server-rendered in place, but its controlled input and
  // submit handler exist only after the client hydrates: a fill or click
  // before that is lost (the click falls back to a native GET submit). The
  // controls stay disabled until then.
  const mounted = atom(false);
  watch.once(() => {
    if (typeof window === "undefined") {
      return;
    }
    mounted.set(true);
  });
  return (
    <main class="flex flex-col gap-6">
      <header class="flex flex-col gap-2">
        <p class="text-xs font-medium tracking-wide text-gray-500 uppercase">
          Noite template
        </p>
        <h1 class="text-2xl font-semibold">Ilha + Void on Noite</h1>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Edit <code>pages/index.tsx</code>, then <code>git push</code> to
          deploy.
        </p>
      </header>

      <section class={CARD}>
        <div class="flex flex-col gap-1">
          <h2 class="font-semibold">Todos</h2>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Rendered on the server by the loader in{" "}
            <code>pages/index.server.ts</code>.
          </p>
        </div>
        <ul class="flex list-disc flex-col gap-1 pl-5 text-sm">
          {todos.map((todo) => (
            <li key={todo.id}>{todo.text}</li>
          ))}
        </ul>
        <fieldset disabled={!mounted()} class="m-0 min-w-0 border-0 p-0">
          <Form form={form} class="flex gap-2">
            <input
              name="text"
              aria-label="New todo"
              placeholder="Something to do"
              value={form.data.text}
              oninput={(event) => form.setData("text", event.currentTarget.value)}
              class="grow rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:focus:border-gray-100"
            />
            <button
              type="submit"
              disabled={form.pending}
              class="w-fit rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
            >
              Add
            </button>
          </Form>
        </fieldset>
        {form.errors.text ? (
          <p class="text-sm text-red-600 dark:text-red-400">
            {form.errors.text}
          </p>
        ) : null}
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Adding one calls the server action in{" "}
          <code>pages/index.server.ts</code> — it runs in the Worker, never in
          the browser.
        </p>
      </section>
    </main>
  );
}
