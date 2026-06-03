import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { broadcast, sendPushTo, type PushPayload } from "@/lib/push.server";

// Runs every minute (pg_cron). Finds schedule slots starting in ~10 minutes
// in Europe/Moscow time and sends a Web Push to all subscribed devices.
async function handle() {
  // Current moment in Europe/Moscow
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Moscow",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  // Convert weekday short name to schedule's 0=Mon..6=Sun
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const dow = map[wd] ?? 0;
  const nowMin = parseInt(hh, 10) * 60 + parseInt(mm, 10);
  const targetMin = nowMin + 10; // lessons starting 10 min from now

  // Pull today's slots; filter in JS (time math with timezone is awkward in SQL)
  const { data: slots, error } = await supabaseAdmin
    .from("schedule_slots")
    .select("id, student_id, owner_id, day_of_week, start_time, duration_min");
  if (error) throw new Error(error.message);

  const matches = (slots ?? []).filter((s) => {
    if (s.day_of_week !== dow) return false;
    const [shStr, smStr] = String(s.start_time).split(":");
    const slotMin = parseInt(shStr, 10) * 60 + parseInt(smStr, 10);
    return slotMin === targetMin;
  });

  if (matches.length === 0) {
    return { ok: true, checked: slots?.length ?? 0, matched: 0, sent: 0 };
  }

  const ids = Array.from(new Set(matches.map((m) => m.student_id)));
  const { data: students } = await supabaseAdmin
    .from("students")
    .select("id, name, subject")
    .in("id", ids);
  const byId = new Map((students ?? []).map((s) => [s.id, s]));

  // Get all subscriptions, group by owner_id
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, owner_id");
  const subsByOwner = new Map<string, typeof subs>();
  (subs ?? []).forEach((s) => {
    const arr = subsByOwner.get(s.owner_id) ?? [];
    arr.push(s);
    subsByOwner.set(s.owner_id, arr as any);
  });

  let sent = 0;
  for (const m of matches) {
    const student = byId.get(m.student_id);
    const startHH = String(m.start_time).slice(0, 5);
    const payload: PushPayload = {
      title: `Через 10 минут — ${student?.name ?? "урок"}`,
      body: `${student?.subject ? student.subject + " · " : ""}Начало в ${startHH}`,
      url: "/schedule",
      tag: `lesson-${m.id}-${dow}-${startHH}`,
    };
    const ownerSubs = subsByOwner.get(m.owner_id) ?? [];
    const results = await Promise.all(ownerSubs.map((s) => sendPushTo(s, payload)));
    sent += results.filter((r) => r.ok).length;
  }

  return { ok: true, matched: matches.length, sent };
}

export const Route = createFileRoute("/api/public/hooks/lesson-reminders")({
  server: {
    handlers: {
      GET: async () => {
        const res = await handle();
        return Response.json(res);
      },
      POST: async () => {
        const res = await handle();
        return Response.json(res);
      },
    },
  },
});

// Reference unused imports to keep tree-shaking happy
void broadcast;
