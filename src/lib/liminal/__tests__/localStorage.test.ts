import { afterEach, describe, expect, it, vi } from "vitest";
import { readLocalItem, writeLocalItem } from "../localStorage";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("best-effort local preferences", () => {
  it("distinguishes an absent marker from unavailable storage", () => {
    vi.stubGlobal("window", undefined);
    expect(readLocalItem("liminal.visited.v1")).toBeUndefined();
    vi.stubGlobal("window", { localStorage: { getItem: () => null } });
    expect(readLocalItem("liminal.visited.v1")).toBeNull();
    vi.stubGlobal("window", {
      get localStorage() {
        throw new DOMException("Storage denied", "SecurityError");
      },
    });
    expect(readLocalItem("liminal.visited.v1")).toBeUndefined();
  });

  it("preserves the existing preference keys and values", () => {
    const items = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => items.set(key, value),
      },
    });
    for (const [key, value] of [
      ["liminal.visited.v1", "1"],
      ["liminal.howto.v2", "1"],
      ["liminal.sound.v1", "true"],
    ]) {
      writeLocalItem(key, value);
      expect(readLocalItem(key)).toBe(value);
      expect(items.get(key)).toBe(value);
    }
  });

  it.each(["getter", "read", "write"])(
    "keeps sound opt-in and honors this tab's choice with denied %s",
    async (fault) => {
      vi.stubGlobal("window", {
        get localStorage() {
          if (fault === "getter") throw new DOMException("Denied", "SecurityError");
          return {
            getItem() {
              if (fault === "read") throw new DOMException("Denied", "SecurityError");
              return null;
            },
            setItem() {
              if (fault === "write") throw new DOMException("Full", "QuotaExceededError");
            },
          };
        },
      });
      const { soundEnabled, setSoundEnabled } = await import("../audio");
      expect(soundEnabled()).toBe(false);
      expect(() => setSoundEnabled(true)).not.toThrow();
      expect(soundEnabled()).toBe(true);
      setSoundEnabled(false);
      expect(soundEnabled()).toBe(false);
    },
  );
});
