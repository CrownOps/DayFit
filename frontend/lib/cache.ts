/**
 * Tiny "show the last copy, then refresh" cache for screen data.
 *
 * Every request to the server costs at least one trans-Pacific round trip, so
 * re-opening a screen used to mean staring at an empty widget until it came
 * back. Screens now seed their state from the last copy they saw and replace it
 * when the fresh response lands.
 *
 * Kept in memory for in-app navigation and mirrored to sessionStorage so a
 * reload of the tab benefits too. Cleared on logout (see `setToken`).
 */
const PREFIX = "dayfit-cache:";
const memory = new Map<string, unknown>();

export function peek<T>(key: string): T | null {
  if (memory.has(key)) return memory.get(key) as T;
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const value = JSON.parse(raw) as T;
    memory.set(key, value);
    return value;
  } catch {
    return null;
  }
}

export function remember(key: string, value: unknown) {
  memory.set(key, value);
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — the in-memory copy still works */
  }
}

export function clearCache() {
  memory.clear();
  if (typeof window === "undefined") return;
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(PREFIX)) sessionStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}
