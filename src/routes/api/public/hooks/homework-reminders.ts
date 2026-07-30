import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushTo, type PushPayload } from "@/lib/push.server";
import { checkHookSecret, claimHookExecution, rejectUnsupportedHookMethod } from "@/lib/hook-auth";

// Daily homework reminders. Notifies owners about homework due today or tomorrow
// that is still in 'assigned' status. Skips owners with remind_homework disabled.
async function handle() {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const today = `${get("year")}-${get("month")}-${get("day")}`;
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tParts = fmt.formatToParts(tomorrowDate);
  const tget = (t: string) => tParts.find((p) => p.type === t)?.value ?? "";
  const tomorrow = `${tget("year")}-${tget("month")}-${tget("day")}`;

  const { data: items, error } = await supabaseAdmin
    .from("homework")
    .select("id, student_id, owner_id, due_date, task, status, deleted_at")
    .eq("status", "assigned")
    .is("deleted_at", null)
    .in("due_date", [today, tomorrow]);
  if (error) throw new Error(error.message);

  if (!items || items.length === 0) {
    return { ok: true, matched: 0, sent: 0, today, tomorrow };
  }

  const studentIds = Array.from(new Set(items.map((i) => i.student_id)));
  const { data: students, error: studentsError } = await supabaseAdmin
    .from("students")
    .select("id, owner_id")
    .is("deleted_at", null)
    .in("id", studentIds);
  if (studentsError) throw new Error(studentsError.message);
  const byStudent = new Map((students ?? []).map((s) => [`${s.owner_id}:${s.id}`, s]));
  const validItems = items.filter((item) => byStudent.has(`${item.owner_id}:${item.student_id}`));
  if (validItems.length === 0) {
    return { ok: true, matched: 0, sent: 0, today, tomorrow };
  }
  const ownerIds = Array.from(new Set(validItems.map((i) => i.owner_id)));
  const { data: settings, error: settingsError } = await supabaseAdmin
    .from("user_settings")
    .select("user_id, remind_homework")
    .in("user_id", ownerIds);
  if (settingsError) throw new Error(settingsError.message);
  const allowed = new Set(
    (settings ?? []).filter((s) => s.remind_homework !== false).map((s) => s.user_id),
  );
  ownerIds.forEach((id) => {
    if (!(settings ?? []).some((s) => s.user_id === id)) allowed.add(id);
  });

  const byOwner = new Map<string, typeof items>();
  for (const it of validItems) {
    if (!allowed.has(it.owner_id)) continue;
    const arr = byOwner.get(it.owner_id) ?? [];
    arr.push(it);
    byOwner.set(it.owner_id, arr);
  }
  if (byOwner.size === 0) return { ok: true, matched: validItems.length, sent: 0, today, tomorrow };

  const { data: subs, error: subscriptionsError } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, owner_id")
    .in("owner_id", Array.from(byOwner.keys()));
  if (subscriptionsError) throw new Error(subscriptionsError.message);
  const subsByOwner = new Map<string, NonNullable<typeof subs>>();
  (subs ?? []).forEach((s) => {
    const arr = subsByOwner.get(s.owner_id) ?? [];
    arr.push(s);
    subsByOwner.set(s.owner_id, arr);
  });

  if (!(await claimHookExecution("homework-reminders", today))) {
    return { ok: true, duplicate: true, sent: 0 };
  }

  let sent = 0;
  for (const [ownerId, ownerItems] of byOwner) {
    const todayCount = ownerItems.filter((i) => i.due_date === today).length;
    const tomorrowCount = ownerItems.filter((i) => i.due_date === tomorrow).length;
    const parts2: string[] = [];
    if (todayCount) parts2.push(`сегодня: ${todayCount}`);
    if (tomorrowCount) parts2.push(`завтра: ${tomorrowCount}`);
    const payload: PushPayload = {
      title: `Домашние задания (${ownerItems.length})`,
      body: `Срок: ${parts2.join(", ")}. Откройте приложение для подробностей.`,
      url: "/homework",
      tag: `homework-${today}`,
    };
    const ownerSubs = subsByOwner.get(ownerId) ?? [];
    const results = await Promise.all(ownerSubs.map((s) => sendPushTo(s, payload)));
    sent += results.filter((r) => r.ok).length;
  }

  return { ok: true, matched: validItems.length, sent };
}

export const Route = createFileRoute("/api/public/hooks/homework-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await checkHookSecret(request);
        if (denied) return denied;
        try {
          return Response.json(await handle());
        } catch (error) {
          console.error("[homework-reminders]", error);
          return Response.json({ error: "Reminder hook failed" }, { status: 500 });
        }
      },
      ANY: rejectUnsupportedHookMethod,
    },
  },
});
