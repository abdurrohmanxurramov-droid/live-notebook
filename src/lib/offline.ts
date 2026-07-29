// Offline-first snapshots (Phase 1: read-only).
// Snapshots are stored in IndexedDB via Dexie, scoped per authenticated user id.
import Dexie, { type Table } from "dexie";

import { sb } from "@/lib/sb";

export const OFFLINE_TEXT = {
  offlineWithCache: "Вы офлайн. Показаны последние сохранённые данные.",
  offlineNoCache: "Для первого входа нужен интернет.",
  mutationBlocked: "Вы офлайн. Показаны последние сохранённые данные. Изменения недоступны офлайн.",
} as const;

export type SnapshotKind =
  | "students"
  | "schedule_slots"
  | "lessons"
  | "attendance"
  | "finance"
  | "homework"
  | "user_settings";

type SnapshotRow = {
  id: string; // `${userId}::${key}`
  userId: string;
  kind: SnapshotKind;
  key: string;
  savedAt: number;
  data: unknown;
};

class OfflineDb extends Dexie {
  snapshots!: Table<SnapshotRow, string>;
  constructor() {
    super("livenotebook-offline");
    this.version(1).stores({ snapshots: "id, userId, kind" });
  }
}

let _db: OfflineDb | null = null;
function db(): OfflineDb | null {
  if (typeof indexedDB === "undefined") return null;
  if (!_db) _db = new OfflineDb();
  return _db;
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

/** Current user id, read from the locally stored Supabase session (no network). */
export async function currentUserId(): Promise<string | null> {
  try {
    const client = await sb();
    const { data } = await client.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

export function isNetworkError(err: unknown): boolean {
  if (!isOnline()) return true;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /failed to fetch|network|networkerror|load failed|fetch failed|offline|timeout/i.test(msg);
}

export async function saveSnapshot(kind: SnapshotKind, key: string, data: unknown) {
  const database = db();
  if (!database) return;
  const userId = await currentUserId();
  if (!userId) return;
  try {
    await database.snapshots.put({
      id: `${userId}::${key}`,
      userId,
      kind,
      key,
      savedAt: Date.now(),
      data: JSON.parse(JSON.stringify(data)),
    });
  } catch {
    // storage full / private mode — snapshots are best effort
  }
}

export async function readSnapshot<T>(key: string): Promise<T | undefined> {
  const database = db();
  if (!database) return undefined;
  const userId = await currentUserId();
  if (!userId) return undefined;
  try {
    const row = await database.snapshots.get(`${userId}::${key}`);
    return row?.data as T | undefined;
  } catch {
    return undefined;
  }
}

export async function hasAnySnapshot(): Promise<boolean> {
  const database = db();
  if (!database) return false;
  const userId = await currentUserId();
  if (!userId) return false;
  try {
    return (await database.snapshots.where("userId").equals(userId).count()) > 0;
  } catch {
    return false;
  }
}

/**
 * Run an online query; cache its result as a snapshot. On network failure,
 * fall back to the last snapshot instead of throwing.
 */
export async function withSnapshot<T>(
  kind: SnapshotKind,
  key: string,
  run: () => Promise<T>,
): Promise<T> {
  if (isOnline()) {
    try {
      const result = await run();
      void saveSnapshot(kind, key, result);
      return result;
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      const cached = await readSnapshot<T>(key);
      if (cached !== undefined) return cached;
      throw new Error(OFFLINE_TEXT.offlineNoCache);
    }
  }
  const cached = await readSnapshot<T>(key);
  if (cached !== undefined) return cached;
  throw new Error(OFFLINE_TEXT.offlineNoCache);
}

/** Block any write while offline — Phase 1 has no sync queue. */
export function assertOnlineForMutation() {
  if (!isOnline()) throw new Error(OFFLINE_TEXT.mutationBlocked);
}
