import { expect, test } from "bun:test";

import { renderHtml } from "ilha/test";

import Home from "./index.tsx";

test("renders the form controls disabled until the client mounts", async () => {
  // The form is server-rendered in place; its controls stay disabled until
  // hydration attaches the submit handler, so an early fill or click waits
  // instead of falling back to a native GET submit.
  const html = await renderHtml(() => <Home todos={[]} />, {
    markers: false,
    snapshot: false,
  });
  expect(html).toContain("<fieldset disabled");
});
