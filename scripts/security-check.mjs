import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const packageJson = JSON.parse(read("package.json"));
assert.equal(packageJson.overrides.seroval, "1.5.6");
assert.equal(packageJson.overrides["seroval-plugins"], "1.5.6");
assert.equal(packageJson.engines.node, ">=22.12.0");
assert.equal(packageJson.packageManager, "bun@1.3.14");
assert.equal(existsSync(join(root, "package-lock.json")), false);
const bunLock = read("bun.lock");
assert.match(bunLock, /"seroval": \["seroval@1\.5\.6"/);
assert.match(bunLock, /"seroval-plugins": \["seroval-plugins@1\.5\.6"/);
const ci = read(".github/workflows/ci.yml");
assert.match(ci, /node-version: "24"/);
assert.match(ci, /bun-version: 1\.3\.14/);
assert.match(ci, /bun install --frozen-lockfile/);
assert.match(ci, /supabase\/setup-cli@v3/);

const migration = read(
  "supabase/migrations/20260730135521_144ae4f8-44d5-499e-89b1-c4b8fe3bb6dd.sql",
);
const cronInspectMigration = read(
  "supabase/migrations/20260617052120_e01158fc-1548-4eee-bbf5-c4a0684b45e2.sql",
);
const cronSnapshotMigration = read(
  "supabase/migrations/20260617052131_ce18fa85-96b1-4d40-88dd-2d023b6cc07e.sql",
);
const cronMigration = read(
  "supabase/migrations/20260617052157_c8d3f2fd-4851-4421-9bd6-ecebe2c20b34.sql",
);
assert.match(cronInspectMigration, /to_regclass\('cron\.job'\) IS NOT NULL/);
assert.match(cronSnapshotMigration, /to_regclass\('cron\.job'\) IS NOT NULL/);
assert.match(cronMigration, /to_regclass\('cron\.job'\) IS NOT NULL/);
assert.match(cronMigration, /FOR job_id IN[\s\S]*FROM cron\.job/);
assert.doesNotMatch(cronMigration, /cron\.unschedule\('lesson-reminders'\)/);
assert.match(cronMigration, /IF public\.get_hook_secret\(\) IS NOT NULL THEN/);

for (const constraint of [
  "schedule_slots_student_owner_fk",
  "finance_student_owner_fk",
  "attendance_student_owner_fk",
  "homework_student_owner_fk",
  "lessons_student_owner_fk",
]) {
  assert.match(migration, new RegExp(`\\b${constraint}\\b`));
}
assert.match(migration, /consume_app_rate_limit/);
assert.match(migration, /claim_hook_execution/);
assert.match(migration, /set_lesson_status_with_attendance/);
assert.match(migration, /set_student_deleted_state/);
assert.match(migration, /Security ownership preflight failed/);
assert.match(migration, /VALIDATE CONSTRAINT lessons_source_slot_owner_fk/);
assert.match(migration, /ON DELETE SET NULL \(source_slot_id\)/);
assert.match(migration, /ON DELETE SET NULL \(moved_from_id\)/);
assert.match(migration, /ALTER COLUMN owner_id SET NOT NULL/);
assert.match(migration, /attendance_status_check/);
assert.match(migration, /homework_status_check/);
assert.match(migration, /rates_values_check/);
assert.match(migration, /finance_active_amount_nonnegative_check/);
assert.match(migration, /CHECK \(amount >= 0 OR deleted_at IS NOT NULL\)/);
assert.match(migration, /REVOKE ALL ON TABLE public\.%I FROM anon/);
assert.match(migration, /to_regclass\('public\.lessons_conducted'\)/);
assert.doesNotMatch(migration, /SET amount = abs\(amount\)/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.set_user_id/);
assert.match(migration, /NEW\.owner_id := caller_id/);
assert.match(migration, /NEW\.user_id := caller_id/);
assert.doesNotMatch(migration, /FUNCTION public\.set_owner_id\(\)[\s\S]{0,120}SECURITY DEFINER/);
assert.doesNotMatch(migration, /CREATE POLICY[\s\S]{0,120}(?:USING|WITH CHECK)\s*\(\s*true\s*\)/i);
assert.doesNotMatch(migration, /enforce_student_owner_reference/);

const offline = read("src/lib/offline.ts");
assert.match(offline, /snapshotGeneration/);
assert.match(offline, /clearOfflineSnapshots/);
assert.match(offline, /saveSnapshotForUser\(userId, generation/);

const rootRoute = read("src/routes/__root.tsx");
assert.match(rootRoute, /SIGNED_OUT[\s\S]{0,180}clearOfflineSnapshots/);
assert.match(rootRoute, /SIGNED_OUT[\s\S]{0,240}unsubscribePushLocally/);

for (const hook of ["lesson-reminders", "payment-reminders", "homework-reminders"]) {
  const source = read(`src/routes/api/public/hooks/${hook}.ts`);
  assert.match(source, /\bANY:\s*rejectUnsupportedHookMethod/);
  assert.match(source, /checkHookSecret/);
  assert.match(source, /claimHookExecution/);
  assert.match(source, /owner_id/);
  assert.match(source, /from\("students"\)[\s\S]{0,120}\.is\("deleted_at", null\)/);
}
const hookAuth = read("src/lib/hook-auth.ts");
assert.match(hookAuth, /status:\s*405/);
assert.match(hookAuth, /Allow:\s*"POST"/);
assert.match(hookAuth, /"Cache-Control":\s*"no-store"/);
assert.match(hookAuth, /body\?\.getReader\(\)/);
assert.match(hookAuth, /reader\.cancel\(\)/);
assert.match(
  read("src/routes/api/public/hooks/lesson-reminders.ts"),
  /from\("lessons"\)[\s\S]{0,260}\.is\("deleted_at", null\)/,
);

const serviceWorker = read("public/sw.js");
for (const privatePath of ["/api/", "/mcp", "/_serverFn", "/auth"]) {
  assert.match(serviceWorker, new RegExp(privatePath.replace("/", "\\/")));
}
assert.match(serviceWorker, /canCacheShellResponse/);
assert.match(serviceWorker, /candidate\.origin === self\.location\.origin/);

const backup = read("src/lib/backup.functions.ts");
assert.doesNotMatch(backup, /push_subscriptions/);
assert.match(backup, /MAX_BACKUP_BYTES/);
assert.match(backup, /consumeByteBudget/);
assert.match(backup, /enforceRateLimit\(userId, "backup_import"\)/);
assert.match(backup, /importedSlotStudentById/);
assert.match(backup, /row\.owner_id = userId/);

const server = read("src/server.ts");
assert.match(server, /MAX_REQUEST_BODY_BYTES = 8_000_000/);
assert.match(server, /total > MAX_REQUEST_BODY_BYTES/);

const mcpSupabase = read("src/lib/mcp/supabase.ts");
assert.doesNotMatch(mcpSupabase, /SERVICE_ROLE/);
assert.match(mcpSupabase, /SUPABASE_PUBLISHABLE_KEY/);
assert.match(mcpSupabase, /Authorization: `Bearer \$\{token\}`/);
assert.match(mcpSupabase, /checkRateLimit\(userId, "mcp_write"\)/);


const push = read("src/lib/push.ts");
assert.match(push, /ownsPushSubscription/);
assert.match(push, /unsubscribePushLocally/);
assert.match(push, /PUSH_OWNER_STORAGE_KEY/);
assert.match(push, /strictOwnership && storedOwnerId !== currentUserId/);
assert.match(push, /finally\s*\{[\s\S]{0,100}unsubscribeLocally\(sub\)/);

const logout = read("src/lib/logout.ts");
assert.match(logout, /if \(error\) await forceLocalSignOut\(\)/);
assert.match(logout, /localStorage\.removeItem\(SUPABASE_AUTH_STORAGE_KEY\)/);
assert.match(logout, /clearOfflineSnapshots\(\)/);
assert.match(logout, /BroadcastChannel\(SUPABASE_AUTH_STORAGE_KEY\)/);

const auth = read("src/routes/auth.tsx");
assert.match(auth, /resolved\.origin !== origin/);
assert.match(auth, /next\.includes\("\\\\"\)/);

const allSecuritySensitiveSources = [
  "src/integrations/supabase/client.server.ts",
  "src/lib/push.server.ts",
  "src/lib/mcp/supabase.ts",
  "vite.config.ts",
  ".env.example",
]
  .map(read)
  .join("\n");
assert.doesNotMatch(
  allSecuritySensitiveSources,
  /VITE_(?:SUPABASE_SERVICE_ROLE_KEY|VAPID_PRIVATE_KEY|OPENAI_API_KEY|HOOK_SECRET)/,
);

const rlsTest = read("supabase/tests/rls_user_isolation.sql");
assert.doesNotMatch(rlsTest, /WHEN OTHERS/);
assert.match(rlsTest, /insufficient_privilege/);
assert.match(rlsTest, /foreign_key_violation/);
assert.match(rlsTest, /set_lesson_status_with_attendance/);
assert.match(rlsTest, /set_student_deleted_state/);
assert.match(rlsTest, /v_lessons_conducted/);
assert.match(rlsTest, /Negative active finance amount was not rejected/);
assert.match(rlsTest, /Archived negative finance row was restored as active/);
assert.match(rlsTest, /Archived negative finance row was restored by student RPC/);
assert.match(rlsTest, /Anonymous role retains access to private CRM relations/);
assert.match(rlsTest, /Forged user_id was not rejected/);

const preflight = read("supabase/preflight/security_hardening_preflight.sql");
assert.match(preflight, /lessons\.source_slot/);
assert.match(preflight, /push_subscriptions\.owner_id_null/);

console.log("Security static checks passed.");
