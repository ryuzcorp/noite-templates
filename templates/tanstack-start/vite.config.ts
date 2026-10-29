import { convertToWranglerConfig, loadAndParseConfig } from "@cloudflare/config";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(async ({ isPreview, mode }) => {
  // The Worker lives in `cloudflare.config.ts`: convert it to the Wrangler
  // shape the Cloudflare plugin reads, so the project needs no wrangler file.
  const { result } = await loadAndParseConfig(
    new URL("cloudflare.config.ts", import.meta.url).pathname,
    { isPreview: isPreview ?? false, mode }
  );
  if (!result.success) {
    throw new Error(`cloudflare.config.ts is invalid:\n${result.error.message}`);
  }
  const worker = convertToWranglerConfig(result.data);

  return {
    resolve: {
      tsconfigPaths: true,
    },
    plugins: [
      tailwindcss(),
      cloudflare({
        config: (config) => {
          Object.assign(config, structuredClone(worker));
        },
        viteEnvironment: { name: "ssr" },
      }),
      tanstackStart(),
      viteReact(),
    ],
  };
});
