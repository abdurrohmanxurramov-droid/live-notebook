import { useEffect, useState } from "react";

import { OFFLINE_TEXT, hasAnySnapshot, isOnline } from "@/lib/offline";

export function OfflineIndicator() {
  const [online, setOnline] = useState(true);
  const [hasCache, setHasCache] = useState(true);

  useEffect(() => {
    setOnline(isOnline());
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  useEffect(() => {
    if (online) return;
    let cancelled = false;
    hasAnySnapshot().then((has) => {
      if (!cancelled) setHasCache(has);
    });
    return () => {
      cancelled = true;
    };
  }, [online]);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[60] px-3 pt-[env(safe-area-inset-top)]"
    >
      <div className="mx-auto max-w-2xl rounded-b-xl border border-border bg-card/95 px-3 py-2 text-center text-xs text-foreground shadow-sm">
        {hasCache ? OFFLINE_TEXT.offlineWithCache : OFFLINE_TEXT.offlineNoCache}
      </div>
    </div>
  );
}
