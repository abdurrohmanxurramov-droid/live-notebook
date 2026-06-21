// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
//
// IMPORTANT: Do NOT add a manual `define` block for VITE_SUPABASE_*. The plugin
// already injects them at build time. A manual `define` reading process.env at
// vite.config evaluation time will silently override the plugin's injection
// with empty strings when those vars are not populated in the publish runner,
// producing a browser bundle with an uninitialized Supabase client and a blank UI.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
});
