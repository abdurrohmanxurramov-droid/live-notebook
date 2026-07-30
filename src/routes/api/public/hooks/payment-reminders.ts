import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushTo, type PushPayload } from "@/lib/push.server";
import { checkHookSecret, claimHookExecution, rejectUnsupportedHookMethod } from "@/lib/hook-auth";

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
    return { ok: true, matched: 0, sent: 0, today };
  }
  const ownerIds = Array.from(new Set(validItems.map((i) => i.owner_id)));
  const { data: settings, error: settingsError } = await supabaseAdmin
    .from("user_settings")
    .select("user_id, remind_payments")
    .in("user_id", ownerIds);
  if (settingsError) throw new Error(settingsError.message);
  const allowed = new Set(
    (settings ?? []).filter((s) => s.remind_payments !== false).map((s) => s.user_id),
  );
  // owners without a settings row default to allowed
  ownerIds.forEach((id) => {
    if (!(settings ?? []).some((s) => s.user_id === id)) allowed.add(id);
  });

  // Aggregate per owner: count + total unpaid by currency
  const byOwner = new Map<string, typeof items>();
  for (const it of validItems) {
    if (!allowed.has(it.owner_id)) continue;
    const arr = byOwner.get(it.owner_id) ?? [];
    arr.push(it);
    byOwner.set(it.owner_id, arr);
  }

  if (byOwner.size === 0) return { ok: true, matched: validItems.length, sent: 0, today };

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

  if (!(await claimHookExecution("payment-reminders", today))) {
    return { ok: true, duplicate: true, sent: 0 };
  }

  let sent = 0;
  for (const [ownerId, ownerItems] of byOwner) {
    const count = ownerItems.length;
    const payload: PushPayload = {
      title: `Неоплаченные счета: ${count}`,
      body: "Откройте LiveNotebook, чтобы проверить оплаты.",
      url: "/finance",
      tag: `payments-${today}`,
    };
    const ownerSubs = subsByOwner.get(ownerId) ?? [];
    const results = await Promise.all(ownerSubs.map((s) => sendPushTo(s, payload)));
    sent += results.filter((r) => r.ok).length;
  }

  return { ok: true, matched: validItems.length, sent };
}

export const Route = createFileRoute("/api/public/hooks/payment-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await checkHookSecret(request);
        if (denied) return denied;
        try {
          return Response.json(await handle());
        } catch (error) {
          console.error("[payment-reminders]", error);
          return Response.json({ error: "Reminder hook failed" }, { status: 500 });
        }
      },
      ANY: rejectUnsupportedHookMethod,
    },
  },
});
