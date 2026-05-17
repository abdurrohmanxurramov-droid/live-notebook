// Lazy proxy to avoid loading the supabase client (which references
// localStorage at module init) during SSR.
import type { SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  // Only resolve in browser; throw if accidentally used in SSR.
  if (typeof window === "undefined") {
    throw new Error("Supabase client accessed during SSR");
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("@/integrations/supabase/client") as { supabase: SupabaseClient };
  _client = mod.supabase;
  return _client;
}

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    const c = getClient() as unknown as Record<string, unknown>;
    const value = c[prop as string];
    return typeof value === "function" ? (value as Function).bind(c) : value;
  },
});
