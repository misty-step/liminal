import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { GameSoundCue } from "../audio";

const soundEngine = vi.hoisted(() => ({
  play: vi.fn(),
  setEnabled: vi.fn(),
}));

vi.mock("cuelume", () => soundEngine);

function stubSoundPreference(value: string | null) {
  const getItem = vi.fn(() => value);
  vi.stubGlobal("window", {
    localStorage: {
      getItem,
      setItem: vi.fn(),
    },
  });
  return getItem;
}

describe("game audio (US-010)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is silent when sound is off and keeps the saved preference key", async () => {
    const getItem = stubSoundPreference("false");
    const { playGameSound } = await import("../audio");

    playGameSound("place");

    expect(getItem).toHaveBeenCalledWith("liminal.sound.v1");
    expect(soundEngine.setEnabled).not.toHaveBeenCalled();
    expect(soundEngine.play).not.toHaveBeenCalled();
  });

  it("keeps the five game cue names and their playback mappings", async () => {
    type ExpectedCue = "place" | "fill" | "miss" | "complete" | "refuse";
    expectTypeOf<GameSoundCue>().toEqualTypeOf<ExpectedCue>();
    stubSoundPreference("true");
    const { playGameSound } = await import("../audio");

    const cues = ["place", "fill", "miss", "complete", "refuse"] satisfies GameSoundCue[];
    for (const cue of cues) playGameSound(cue);

    await vi.waitFor(() => expect(soundEngine.play).toHaveBeenCalledTimes(5));
    expect(soundEngine.play.mock.calls.map(([sound]) => sound)).toEqual([
      "loading",
      "bloom",
      "droplet",
      "success",
      "error",
    ]);
  });
});
