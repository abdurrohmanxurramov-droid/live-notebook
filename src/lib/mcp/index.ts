import { auth, defineMcp } from "@lovable.dev/mcp-js";
import queryTool from "./tools/query";
import mutateTool from "./tools/mutate";
import workflowTool from "./tools/workflow";

// Direct Supabase auth issuer required (RFC 8414). VITE_SUPABASE_PROJECT_ID
// is inlined at build time via vite.config.ts. Fallback keeps the issuer
// well-formed for manifest-extract eval; the published build uses the real ref.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "livenotebook",
  title: "LiveNotebook",
  version: "0.4.0",
  instructions:
    "Tools for LiveNotebook — a teacher CRM — exposed as exactly three tools. Use `query` for all reads and analytics (students, schedule, free slots, conflicts, lessons, attendance, finance, homework, dashboard snapshot, per-student and period reports, global search, trash). Use `mutate` for typed writes, including bulk operations capped at 100 items that return per-item results. Use `workflow` for multi-step routines (onboard_student, complete_lesson, reschedule_lesson, record_payment, archive_student, request_permanent_delete, schedule.reschedule_day, student.full_profile, finance.reconcile_student). Every call is scoped to the signed-in teacher via Supabase RLS; there is no raw SQL and no access to other users' data. Deletion is soft and restorable by default; permanent deletion requires record.prepare_permanent_delete followed by record.confirm_permanent_delete with the returned token and explicit user confirmation — workflows never delete permanently. schedule.reschedule_day only previews unless confirm=true, and finance.reconcile_student never writes.",

  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [queryTool, mutateTool, workflowTool],
});
