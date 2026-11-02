import { defineMiddleware } from "void";

/**
 * Every response is JSON — including errors. Hono answers unknown routes
 * and wrong methods with a plain-text 404/405; rewrite those (and only
 * those) to the template's `{error}` shape. The human page is a 200 and
 * passes through untouched.
 */
export default defineMiddleware(async (c, next) => {
  await next();
  if (c.res.status !== 404 && c.res.status !== 405) {
    return;
  }
  const contentType = c.res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return;
  }
  const status = c.res.status === 405 ? 405 : 404;
  c.res = c.json({ error: status === 405 ? "method not allowed" : "not found" }, status);
});
