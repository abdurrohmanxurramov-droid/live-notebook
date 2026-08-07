import { describe, expect, it } from "vitest";
import { buildRequestSchema, operationNames } from "./registry";
import { QUERY_OPS } from "./ops/queries";
import { MUTATE_OPS } from "./ops/mutations";
import { WORKFLOW_OPS } from "./ops/workflows";
import { BULK_MAX, fromMinutes, overlaps, sanitizeSearch, toMinutes } from "./schemas";

const query = buildRequestSchema("resource", QUERY_OPS);
const mutate = buildRequestSchema("operation", MUTATE_OPS);
const workflow = buildRequestSchema("workflow", WORKFLOW_OPS);
const ID = "11111111-1111-4111-8111-111111111111";

describe("operation surface", () => {
  it("keeps every legacy operation and adds the new ones", () => {
    const q = operationNames(QUERY_OPS);
    for (const name of [
      "students.list",
      "students.get",
      "schedule_slots.list",
      "lessons.today",
      "reports.period_summary",
      "trash.list",
      "students.search",
      "students.summary",
      "schedule.week",
      "schedule.free_slots",
      "schedule.conflicts",
      "lessons.stats",
      "attendance.stats",
      "finance.period_summary",
      "finance.student_balance",
      "homework.stats",
      "dashboard.summary",
      "reports.student_summary",
      "search.global",
      "trash.get",
    ]) {
      expect(q).toContain(name);
    }
    expect(q).toHaveLength(31);

    const m = operationNames(MUTATE_OPS);
    for (const name of [
      "students.bulk_update_status",
      "attendance.bulk_mark",
      "finance.bulk_set_paid",
      "lessons.bulk_set_status",
      "lessons.bulk_move",
      "homework.bulk_update_status",
    ]) {
      expect(m).toContain(name);
    }
    expect(m).toHaveLength(27);

    const w = operationNames(WORKFLOW_OPS);
    expect(w).toEqual([
      "onboard_student",
      "complete_lesson",
      "reschedule_lesson",
      "record_payment",
      "archive_student",
      "request_permanent_delete",
      "schedule.reschedule_day",
      "student.full_profile",
      "finance.reconcile_student",
    ]);
  });
});

describe("new read schemas", () => {
  it("accepts a valid analytics request", () => {
    expect(
      query.safeParse({ resource: "lessons.stats", from: "2026-01-01", to: "2026-01-31" }).success,
    ).toBe(true);
    expect(query.safeParse({ resource: "schedule.week", week_start: "2026-01-05" }).success).toBe(
      true,
    );
  });

  it("rejects unknown fields and bad dates", () => {
    expect(query.safeParse({ resource: "schedule.week", week_start: "05-01-2026" }).success).toBe(
      false,
    );
    expect(query.safeParse({ resource: "dashboard.summary", raw_sql: "select 1" }).success).toBe(
      false,
    );
  });

  it("requires a minimum search term length", () => {
    expect(query.safeParse({ resource: "search.global", query: "a" }).success).toBe(false);
    expect(query.safeParse({ resource: "search.global", query: "ана" }).success).toBe(true);
  });
});

describe("bulk schemas", () => {
  it(`caps batches at ${BULK_MAX} items`, () => {
    const ids = Array.from({ length: BULK_MAX + 1 }, () => ID);
    expect(
      mutate.safeParse({
        operation: "students.bulk_update_status",
        student_ids: ids,
        status: "paused",
      }).success,
    ).toBe(false);
    expect(
      mutate.safeParse({
        operation: "students.bulk_update_status",
        student_ids: [ID],
        status: "paused",
      }).success,
    ).toBe(true);
  });

  it("rejects empty batches", () => {
    expect(mutate.safeParse({ operation: "attendance.bulk_mark", entries: [] }).success).toBe(
      false,
    );
  });

  it("validates nested bulk entries strictly", () => {
    expect(
      mutate.safeParse({
        operation: "attendance.bulk_mark",
        entries: [{ student_id: ID, date: "2026-02-01", status: "present" }],
      }).success,
    ).toBe(true);
    expect(
      mutate.safeParse({
        operation: "attendance.bulk_mark",
        entries: [{ student_id: ID, date: "2026-02-01", status: "teleported" }],
      }).success,
    ).toBe(false);
    expect(
      mutate.safeParse({
        operation: "lessons.bulk_move",
        moves: [{ lesson_id: ID, scheduled_date: "2026-02-01", scheduled_time: "10:00", x: 1 }],
      }).success,
    ).toBe(false);
  });
});

describe("new workflow schemas", () => {
  it("makes the destructive day reschedule opt-in", () => {
    const parsed = workflow.safeParse({
      workflow: "schedule.reschedule_day",
      from_date: "2026-02-01",
      to_date: "2026-02-02",
    });
    expect(parsed.success).toBe(true);
    expect((parsed as { data: { confirm?: boolean } }).data.confirm).toBeUndefined();
  });

  it("accepts a reconcile preview request", () => {
    expect(
      workflow.safeParse({
        workflow: "finance.reconcile_student",
        student_id: ID,
        amount: 2500,
        currency: "RUB",
      }).success,
    ).toBe(true);
  });
});

describe("time helpers", () => {
  it("round-trips minutes", () => {
    expect(toMinutes("09:30")).toBe(570);
    expect(fromMinutes(570)).toBe("09:30");
    expect(toMinutes("09:30:00")).toBe(570);
  });

  it("detects overlapping intervals only", () => {
    expect(overlaps(600, 60, 630, 60)).toBe(true);
    expect(overlaps(600, 60, 660, 60)).toBe(false);
    expect(overlaps(660, 60, 600, 60)).toBe(false);
  });

  it("strips PostgREST filter metacharacters", () => {
    expect(sanitizeSearch("a,b)or(c%")).toBe("a b or c");
  });
});
