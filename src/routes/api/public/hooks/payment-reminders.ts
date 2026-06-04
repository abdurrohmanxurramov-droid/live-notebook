import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushTo, type PushPayload } from "@/lib/push.server";
import { checkHookSecret } from "@/lib/hook-auth";

// Daily payment reminders. Notifies owners about unpaid finance records
// whose pay_date is today or in the past (overdue) and skips owners
// who disabled the remind_payments preference.
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

  const { data: items, error } = await supabaseAdmin
    .from("finance")
    .select("id, student_id, owner_id, amount, currency, pay_date, is_paid, deleted_at")
    .eq("is_paid", false)
    .is("deleted_at", null)
    .lte("pay_date", today)
    .not("pay_date", "is", null);
  if (error) throw new Error(error.message);

  if (!items || items.length === 0) {
    return { ok: true, matched: 0, sent: 0, today };
  }

  const ownerIds = Array.from(new Set(items.map((i) => i.owner_id)));
  const { data: settings } = await supabaseAdmin
    .from("user_settings")
    .select("user_id, remind_payments")
    .in("user_id", ownerIds);
  const allowed = new Set(
    (settings ?? [])
      .filter((s) => s.remind_payments !== false)
      .map((s) => s.user_id)
  );
  // owners without a settings row default to allowed
  ownerIds.forEach((id) => {
    if (!(settings ?? []).some((s) => s.user_id === id)) allowed.add(id);
  });

  const studentIds = Array.from(new Set(items.map((i) => i.student_id)));
  const { data: students } = await supabaseAdmin
    .from("students")
    .select("id, name")
    .in("id", studentIds);
  const byStudent = new Map((students ?? []).map((s) => [s.id, s]));

  // Aggregate per owner: count + total unpaid by currency
  const byOwner = new Map<string, typeof items>();
  for (const it of items) {
    if (!allowed.has(it.owner_id)) continue;
    const arr = byOwner.get(it.owner_id) ?? [];
    arr.push(it);
    byOwner.set(it.owner_id, arr);
  }

  if (byOwner.size === 0) return { ok: true, matched: items.length, sent: 0, today };

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
    const count = ownerItems.length;
    const firstName = byStudent.get(ownerItems[0].student_id)?.name ?? "ученик";
    const payload: PushPayload = {
      title: `Неоплаченные счета: ${count}`,
      body:
        count === 1
          ? `${firstName} — есть просроченная оплата`
          : `${firstName} и ещё ${count - 1} — проверьте оплаты`,
      url: "/finance",
      tag: `payments-${today}`,
    };
    const ownerSubs = subsByOwner.get(ownerId) ?? [];
    const results = await Promise.all(ownerSubs.map((s) => sendPushTo(s, payload)));
    sent += results.filter((r) => r.ok).length;
  }

  return { ok: true, matched: items.length, sent };
}

export const Route = createFileRoute("/api/public/hooks/payment-reminders")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = checkHookSecret(request);
        if (denied) return denied;
        return Response.json(await handle());
      },
      POST: async ({ request }) => {
        const denied = checkHookSecret(request);
        if (denied) return denied;
        return Response.json(await handle());
      },
    },
  },
});
