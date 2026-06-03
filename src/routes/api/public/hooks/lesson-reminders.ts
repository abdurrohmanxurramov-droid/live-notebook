import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { broadcast, sendPushTo, type PushPayload } from "@/lib/push.server";

// Runs every minute (pg_cron). Finds lessons starting in ~10 minutes
// in Europe/Moscow time and sends Web Push to all subscribed devices of each owner.
async function handle() {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dateStr = `${get("year")}-${get("month")}-${get("day")}`;
  const hh = get("hour");
  const mm = get("minute");
  const nowMin = parseInt(hh, 10) * 60 + parseInt(mm, 10);
  const targetMin = nowMin + 10;
  const targetHH = String(Math.floor(targetMin / 60) % 24).padStart(2, "0");
  const targetMM = String(targetMin % 60).padStart(2, "0");
  const targetTime = `${targetHH}:${targetMM}:00`;

  // Only planned lessons at exact target time today
  const { data: lessons, error } = await supabaseAdmin
    .from("lessons")
    .select("id, student_id, owner_id, scheduled_date, scheduled_time, status")
    .eq("scheduled_date", dateStr)
    .eq("scheduled_time", targetTime)
    .eq("status", "planned");
  if (error) throw new Error(error.message);

  if (!lessons || lessons.length === 0) {
    return { ok: true, matched: 0, sent: 0, dateStr, targetTime };
  }

  const ids = Array.from(new Set(lessons.map((l) => l.student_id)));
  const { data: students } = await supabaseAdmin
    .from("students")
    .select("id, name, subject")
    .in("id", ids);
  const byId = new Map((students ?? []).map((s) => [s.id, s]));

  const ownerIds = Array.from(new Set(lessons.map((l) => l.owner_id)));
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, owner_id")
    .in("owner_id", ownerIds);
  const subsByOwner = new Map<string, NonNullable<typeof subs>>();
  (subs ?? []).forEach((s) => {
    const arr = subsByOwner.get(s.owner_id) ?? [];
    arr.push(s);
    subsByOwner.set(s.owner_id, arr);
  });

  let sent = 0;
  for (const l of lessons) {
    const student = byId.get(l.student_id);
    const startHH = String(l.scheduled_time).slice(0, 5);
    const payload: PushPayload = {
      title: `Через 10 минут — ${student?.name ?? "урок"}`,
      body: `${student?.subject ? student.subject + " · " : ""}Начало в ${startHH}`,
      url: "/schedule",
      tag: `lesson-${l.id}`,
    };
    const ownerSubs = subsByOwner.get(l.owner_id) ?? [];
    const results = await Promise.all(ownerSubs.map((s) => sendPushTo(s, payload)));
    sent += results.filter((r) => r.ok).length;
  }

  return { ok: true, matched: lessons.length, sent };
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
