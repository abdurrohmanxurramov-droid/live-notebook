// Offline-first snapshots (Phase 1: read-only).
// Snapshots are stored in IndexedDB via Dexie, scoped per authenticated user id.
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

type OfflineDb = {
  snapshots: import("dexie").Table<SnapshotRow, string>;
};

let _dbPromise: Promise<OfflineDb | null> | null = null;
let snapshotGeneration = 0;

/**
 * Dexie весит ~150 КБ и нужен только для офлайн-снимков, поэтому грузим его
 * динамически — он не попадает в основной бандл и не тормозит первый рендер.
 */
function db(): Promise<OfflineDb | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!_dbPromise) {
    _dbPromise = import("dexie")
      .then(({ default: Dexie }) => {
        const instance = new Dexie("livenotebook-offline");
        instance.version(1).stores({ snapshots: "id, userId, kind" });
        return instance as unknown as OfflineDb;
      })
      .catch(() => null);
  }
  return _dbPromise;
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

async function saveSnapshotForUser(
  userId: string,
  generation: number,
  kind: SnapshotKind,
  key: string,
  data: unknown,
) {
  const database = await db();
  if (!database || generation !== snapshotGeneration) return;
  try {
    if (generation !== snapshotGeneration) return;
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

export async function saveSnapshot(kind: SnapshotKind, key: string, data: unknown) {
  const userId = await currentUserId();
  if (!userId) return;
  await saveSnapshotForUser(userId, snapshotGeneration, kind, key, data);
}

export async function readSnapshot<T>(key: string): Promise<T | undefined> {
  const database = await db();
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
  const database = await db();
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
 * Remove private offline data on logout. The generation guard also cancels
 * pending snapshot writes that started before the logout event.
 */
export async function clearOfflineSnapshots(): Promise<void> {
  snapshotGeneration += 1;
  const database = await db();
  if (!database) return;
  try {
    await database.snapshots.clear();
  } catch {
    // IndexedDB may be unavailable in private mode.
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
    // Bind the request and its result to one user. Looking up the user only
    // after the request creates a cross-account race on shared devices.
    const userId = await currentUserId();
    const generation = snapshotGeneration;
    try {
      const result = await run();
      if (userId) {
        void saveSnapshotForUser(userId, generation, kind, key, result);
      }
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
