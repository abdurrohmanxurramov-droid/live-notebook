// Lazy accessor to avoid SSR evaluating the supabase client (touches localStorage).
import type { SupabaseClient } from "@supabase/supabase-js";

let _sb: SupabaseClient | null = null;
let _loading: Promise<SupabaseClient> | null = null;

export async function sb(): Promise<SupabaseClient> {
  if (_sb) return _sb;
  if (!_loading) {
    _loading = import("@/integrations/supabase/client").then((m) => {
      _sb = m.supabase;
      return _sb;
    });
  }
  return _loading;
}
