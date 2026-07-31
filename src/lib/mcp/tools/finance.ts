import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  assertOwnStudent,
  dbError,
  fail,
  guardWrite,
  isToolResult,
  ok,
  requireCaller,
} from "../supabase";
import { amountSchema, compact, currencySchema, dateStr, uuid } from "../schemas";

const FINANCE_COLUMNS =
  "id, student_id, amount, currency, is_paid, pay_date, entry_type, cycle_number, created_at";
const READ = { readOnlyHint: true, idempotentHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, idempotentHint: true, openWorldHint: false } as const;

export const listFinance = defineTool({
  name: "list_finance",
  title: "List payments",
  description: "List finance records, optionally filtered by student or paid state.",
  inputSchema: {
    student_id: uuid.optional(),
    is_paid: z.boolean().optional(),
    limit: z.number().int().min(1).max(200).optional(),
  },
  annotations: READ,
  handler: async ({ student_id, is_paid, limit }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    let query = caller.supabase
      .from("finance")
      .select(FINANCE_COLUMNS)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit ?? 100);
    if (student_id) query = query.eq("student_id", student_id);
    if (is_paid !== undefined) query = query.eq("is_paid", is_paid);
    const { data, error } = await query;
    if (error) return dbError("list_finance", error);
    return ok({ finance: data ?? [] });
  },
});

export const listDebts = defineTool({
  name: "list_debts",
  title: "List outstanding payments",
  description: "List unpaid finance records grouped per student, with totals per currency.",
  inputSchema: {},
  annotations: READ,
  handler: async (_input, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const { data, error } = await caller.supabase
      .from("finance")
      .select("id, student_id, amount, currency, created_at")
      .is("deleted_at", null)
      .eq("is_paid", false)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return dbError("list_debts", error);
    const totals: Record<string, number> = {};
    for (const row of data ?? []) {
      const key = String(row.currency);
      totals[key] = (totals[key] ?? 0) + Number(row.amount ?? 0);
    }
    return ok({ unpaid: data ?? [], totals_by_currency: totals });
  },
});

export const createFinanceEntry = defineTool({
  name: "create_finance_entry",
  title: "Create payment record",
  description: "Create a manual payment/charge record for one of the teacher's students.",
  inputSchema: {
    student_id: uuid,
    amount: amountSchema,
    currency: currencySchema,
    is_paid: z.boolean().optional(),
    pay_date: dateStr.optional(),
  },
  annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ student_id, ...rest }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    if (!(await assertOwnStudent(caller.supabase, student_id))) return fail("Ученик не найден.");
    const { data, error } = await caller.supabase
      .from("finance")
      .insert(compact({ student_id, owner_id: caller.userId, entry_type: "manual", ...rest }))
      .select(FINANCE_COLUMNS)
      .maybeSingle();
    if (error) return dbError("create_finance_entry", error);
    return ok({ entry: data });
  },
});

export const updateFinanceEntry = defineTool({
  name: "update_finance_entry",
  title: "Update payment record",
  description: "Update the amount, currency or payment date of an existing finance record.",
  inputSchema: {
    finance_id: uuid,
    amount: amountSchema.optional(),
    currency: currencySchema.optional(),
    pay_date: dateStr.nullable().optional(),
  },
  annotations: WRITE,
  handler: async ({ finance_id, ...patch }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    const fields = compact(patch);
    if (Object.keys(fields).length === 0) return fail("Нечего обновлять.");
    const { data, error } = await caller.supabase
      .from("finance")
      .update(fields)
      .eq("id", finance_id)
      .is("deleted_at", null)
      .select(FINANCE_COLUMNS)
      .maybeSingle();
    if (error) return dbError("update_finance_entry", error);
    if (!data) return fail("Запись не найдена.");
    return ok({ entry: data });
  },
});

export const setFinancePaid = defineTool({
  name: "set_finance_paid",
  title: "Mark payment paid or unpaid",
  description: "Mark a finance record as paid or unpaid. Repeating the call is safe.",
  inputSchema: {
    finance_id: uuid,
    is_paid: z.boolean(),
    pay_date: dateStr.optional().describe("Payment date; defaults to today when marking paid"),
  },
  annotations: WRITE,
  handler: async ({ finance_id, is_paid, pay_date }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    const patch = is_paid
      ? { is_paid: true, pay_date: pay_date ?? new Date().toISOString().slice(0, 10) }
      : { is_paid: false, pay_date: null };
    const { data, error } = await caller.supabase
      .from("finance")
      .update(patch)
      .eq("id", finance_id)
      .is("deleted_at", null)
      .select(FINANCE_COLUMNS)
      .maybeSingle();
    if (error) return dbError("set_finance_paid", error);
    if (!data) return fail("Запись не найдена.");
    return ok({ entry: data });
  },
});

export default [listFinance, listDebts, createFinanceEntry, updateFinanceEntry, setFinancePaid];
