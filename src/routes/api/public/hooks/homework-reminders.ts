import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushTo, type PushPayload } from "@/lib/push.server";
import { checkHookSecret } from "@/lib/hook-auth";

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

  const ownerIds = Array.from(new Set(items.map((i) => i.owner_id)));
  const { data: settings } = await supabaseAdmin
    .from("user_settings")
    .select("user_id, remind_homework")
    .in("user_id", ownerIds);
  const allowed = new Set(
    (settings ?? []).filter((s) => s.remind_homework !== false).map((s) => s.user_id),
  );
  ownerIds.forEach((id) => {
    if (!(settings ?? []).some((s) => s.user_id === id)) allowed.add(id);
  });

  const studentIds = Array.from(new Set(items.map((i) => i.student_id)));
  const { data: students } = await supabaseAdmin
    .from("students")
    .select("id, name")
    .in("id", studentIds);
  const byStudent = new Map((students ?? []).map((s) => [s.id, s]));

  const byOwner = new Map<string, typeof items>();
  for (const it of items) {
    if (!allowed.has(it.owner_id)) continue;
    const arr = byOwner.get(it.owner_id) ?? [];
    arr.push(it);
    byOwner.set(it.owner_id, arr);
  }
  if (byOwner.size === 0) return { ok: true, matched: items.length, sent: 0, today, tomorrow };

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, owner_id")
    .in("owner_id", Array.from(byOwner.keys()));
  const subsByOwner = new Map<string, NonNullable<typeof subs>>();
  (subs ?? []).forEach((s) => {
    const arr = subsByOwner.get(s.owner_id) ?? [];
    arr.push(s);
    subsByOwner.set(s.owner_id, arr);
  });

  let sent = 0;
  for (const [ownerId, ownerItems] of byOwner) {
    const todayCount = ownerItems.filter((i) => i.due_date === today).length;
    const tomorrowCount = ownerItems.filter((i) => i.due_date === tomorrow).length;
    const firstName = byStudent.get(ownerItems[0].student_id)?.name ?? "ученик";
    const parts2: string[] = [];
    if (todayCount) parts2.push(`сегодня: ${todayCount}`);
    if (tomorrowCount) parts2.push(`завтра: ${tomorrowCount}`);
    const payload: PushPayload = {
      title: `Домашние задания (${ownerItems.length})`,
      body: `${firstName} и др. — ${parts2.join(", ")}`,
      url: "/homework",
      tag: `homework-${today}`,
    };
    const ownerSubs = subsByOwner.get(ownerId) ?? [];
    const results = await Promise.all(ownerSubs.map((s) => sendPushTo(s, payload)));
    sent += results.filter((r) => r.ok).length;
  }

  return { ok: true, matched: items.length, sent };
}

export const Route = createFileRoute("/api/public/hooks/homework-reminders")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await checkHookSecret(request);
        if (denied) return denied;
        return Response.json(await handle());
      },
      POST: async ({ request }) => {
        const denied = await checkHookSecret(request);
        if (denied) return denied;
        return Response.json(await handle());
      },
    },
  },
});
