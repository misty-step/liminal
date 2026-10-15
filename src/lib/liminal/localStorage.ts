/** null means absent; undefined means unavailable (not evidence of a first visit). */
export function readLocalItem(key: string): string | null | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return undefined;
  }
}

/** Best effort only. Callers keep their current state even when nothing is persisted. */
export function writeLocalItem(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage access, reads, and writes are independent browser capabilities.
  }
}
