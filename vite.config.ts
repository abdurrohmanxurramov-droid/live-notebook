// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
//
// Production safety net: these are public browser values (publishable key, not
// a secret). The publish runner has repeatedly produced bundles with empty
// VITE_SUPABASE_* values, so keep explicit non-empty fallbacks here to prevent
// a blank hydrated UI on the live site.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://eltunbflazenamwgyvzl.supabase.co";
const supabasePublishableKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsdHVuYmZsYXplbmFt" +
    "d2d5dnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTY0MDMsImV4cCI6MjA5NDU5MjQwM30.1zLCfnu" +
    "VrnSyhCbHLDVs5E5MA85IZrM6ZqKCQBuxLpI";
const supabaseProjectId = process.env.VITE_SUPABASE_PROJECT_ID || "eltunbflazenamwgyvzl";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabasePublishableKey),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(supabaseProjectId),
    },
  },
});
