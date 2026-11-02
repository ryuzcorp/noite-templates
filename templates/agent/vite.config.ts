import { defineConfig } from "vite";
import { voidPlugin } from "void";

// Stock Void build: `vite build` writes `dist/ssr/wrangler.json` (read
// natively by Noite) + `dist/client/`. No celld-config plugin here.
export default defineConfig({
  plugins: [voidPlugin()],
});
