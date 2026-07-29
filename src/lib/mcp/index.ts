import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listStudents from "./tools/list-students";
import listLessons from "./tools/list-lessons";
import listFinance from "./tools/list-finance";
import listHomework from "./tools/list-homework";


// Direct Supabase auth issuer required (RFC 8414). VITE_SUPABASE_PROJECT_ID
// is inlined at build time via vite.config.ts. Fallback keeps the issuer
// well-formed for manifest-extract eval; the published build uses the real ref.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "livenotebook-mcp",
  title: "LiveNotebook",
  version: "0.1.0",
  instructions:
    "Tools for LiveNotebook — a teacher CRM. Read-only access to your own students, lessons, homework, and payments. All calls are scoped to the signed-in user via Supabase RLS.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listStudents, listLessons, listFinance, listHomework],
});
