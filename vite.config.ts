// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";
import path from "node:path";

// Server configuration stays in process.env, never in client define values.
Object.assign(process.env, loadEnv(process.env['NODE_ENV'] === "production" ? "production" : "development", process.cwd(), ""));

export default defineConfig({
  vite: {
    resolve: {
      alias: [
        { find: "entities/lib/decode.js", replacement: path.resolve("node_modules/entities/lib/decode.js") },
        { find: "entities/lib/encode.js", replacement: path.resolve("node_modules/entities/lib/encode.js") },
        // Match only the root import. parse5 needs its own newer entities/decode export.
        { find: /^entities$/, replacement: path.resolve("node_modules/entities/lib/esm/index.js") },
      ],
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
