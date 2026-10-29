import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";

/** A server function: this handler runs in the Worker, never in the browser;
 * the client calls it like a local async function. */
const serverInfo = createServerFn().handler(() => ({
  at: new Date().toISOString(),
  runtime: navigator.userAgent,
}));

export const Route = createFileRoute("/")({
  component: Home,
});

const CARD =
  "flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900";

function Home() {
  const [name, setName] = useState("");
  const [answer, setAnswer] = useState("");

  const callServer = async () => {
    const { at, runtime } = await serverInfo();
    setAnswer(`Answered at ${at} by ${runtime}`);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-6 py-16">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-wide text-gray-500 uppercase">
          Noite template
        </p>
        <h1 className="text-2xl font-semibold">TanStack Start on Noite</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Edit <code>src/routes/index.tsx</code>, then <code>git push</code> to
          deploy.
        </p>
      </header>

      <section className={CARD}>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Your name
          <input
            className="rounded-md border border-gray-300 bg-white px-3 py-2 font-normal outline-none focus:border-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:focus:border-gray-100"
            name="name"
            onChange={(event) => setName(event.currentTarget.value)}
            value={name}
          />
        </label>
        <p className="text-lg">
          Hello, <span className="font-semibold">{name || "Noite"}</span>!
        </p>
      </section>

      <section className={CARD}>
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold">Server</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Runs in the Worker, never in the browser.
          </p>
        </div>
        <button
          className="w-fit rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
          onClick={callServer}
          type="button"
        >
          Call the server
        </button>
        {answer === "" ? null : (
          <p className="text-sm break-all text-gray-600 dark:text-gray-400">
            {answer}
          </p>
        )}
      </section>
    </main>
  );
}
