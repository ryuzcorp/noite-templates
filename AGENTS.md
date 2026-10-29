# AGENTS.md

One repo for every Noite app template. Each template is a folder under `templates/`; the folder name is the template id Noite resolves (`templates.ts` + `path`).

## Layout

- `templates/ilha-void/` — Ilha + Void (Vite) template.
- `templates/tanstack-start/` — TanStack Start template.
- `.github/workflows/check.yml` — CI: `bun run check` in every template folder.

## Adding or changing a template

- A new template is a new `templates/<id>/` folder: complete project, own `package.json`, `AGENTS.md`, `LICENSE`, `README.md`, and a `check` script (`typecheck + lint + test` where the stack has them).
- Update the root `README.md` table and Noite's `apps/noite/src/lib/apps/templates.ts` (id, name, description, stack) in the same change; the creator test (`create-source.test.ts`) pins the id list.
- Verify like Noite does: `bun install && bun run check` in the folder, plus a real create-from-template against a dev install before merging.
- Never reference anything outside the folder: the runner extracts only `templates/<id>/` into the new app.
