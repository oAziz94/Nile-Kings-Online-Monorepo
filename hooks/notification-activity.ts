/**
 * Backlog 10.52 — "is anyone touching this tab?" for the bell's poll. A dashboard tab left open
 * overnight must stop polling so Neon can reach its idle timeout. Module-level (one set of
 * passive window listeners per page, however many bells mount).
 */
export const POLL_MS = 20_000;
export const IDLE_AFTER_MS = 30 * 60_000;

/** The `refetchInterval` value: poll every 20 s while active in the last 30 min, else stop. */
export function pollIntervalFor(lastActivityAt: number, now: number): number | false {
  return now - lastActivityAt < IDLE_AFTER_MS ? POLL_MS : false;
}

const EVENTS = ["pointerdown", "keydown", "touchstart", "scroll", "visibilitychange"] as const;

let lastActivityAt = Date.now();
let installed = false;
const resumeListeners = new Set<() => void>();

function onActivity() {
  const now = Date.now();
  const wasIdle = pollIntervalFor(lastActivityAt, now) === false;
  lastActivityAt = now;
  if (wasIdle) resumeListeners.forEach((fn) => fn());
}

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  for (const ev of EVENTS) window.addEventListener(ev, onActivity, { passive: true });
}

/** Current interval for the unread-count query. */
export function currentPollInterval(): number | false {
  install();
  return pollIntervalFor(lastActivityAt, Date.now());
}

/** Subscribe to "first activity after an idle pause". Returns an unsubscribe function. */
export function onActivityResume(fn: () => void): () => void {
  install();
  resumeListeners.add(fn);
  return () => {
    resumeListeners.delete(fn);
  };
}
