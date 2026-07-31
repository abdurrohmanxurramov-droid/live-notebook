import { auth, defineMcp } from "@lovable.dev/mcp-js";
import students from "./tools/students";
import schedule from "./tools/schedule";
import lessons from "./tools/lessons";
import attendance from "./tools/attendance";
import finance from "./tools/finance";
import homework from "./tools/homework";
import settings from "./tools/settings";
import summaries from "./tools/summaries";
import trash from "./tools/trash";

// Direct Supabase auth issuer required (RFC 8414). VITE_SUPABASE_PROJECT_ID
// is inlined at build time via vite.config.ts. Fallback keeps the issuer
// well-formed for manifest-extract eval; the published build uses the real ref.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "livenotebook-mcp",
  title: "LiveNotebook",
  version: "0.2.0",
  instructions:
    "Tools for LiveNotebook — a teacher CRM. Read and manage your own students, weekly schedule slots, lessons, attendance, homework, payments and app settings. Every call is scoped to the signed-in teacher via Supabase RLS; there is no raw SQL access and no access to other users' data. Deletions are soft by default and restorable from trash; permanent deletion requires prepare_permanent_delete followed by confirm_permanent_delete with the returned token, and must be explicitly confirmed by the user first.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    ...students,
    ...schedule,
    ...lessons,
    ...attendance,
    ...finance,
    ...homework,
    ...settings,
    ...summaries,
    ...trash,
  ],
});
