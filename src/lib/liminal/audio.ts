import type { play, setEnabled, SoundName } from "cuelume";

export type GameSoundCue = "place" | "fill" | "miss" | "complete" | "refuse";

const STORAGE_KEY = "liminal.sound.v1";
const SOUNDS: Readonly<Record<GameSoundCue, SoundName>> = {
  place: "loading",
  fill: "bloom",
  miss: "droplet",
  complete: "success",
  refuse: "error",
};

type SoundEngine = { play: typeof play; setEnabled: typeof setEnabled };

let enabled: boolean | undefined;
let revision = 0;
let engine: SoundEngine | null = null;
let loading: Promise<SoundEngine | null> | null = null;

/** Sound is opt-in; reading the saved preference is safe during SSR or blocked storage. */
export function soundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (enabled === undefined) {
    try {
      enabled = window.localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      enabled = false;
    }
  }
  return enabled;
}

export function setSoundEnabled(value: boolean): void {
  if (typeof window === "undefined") return;
  enabled = value;
  revision++;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // The current tab can still honor the choice when storage is unavailable.
  }
  try {
    engine?.setEnabled(value);
  } catch {
    // Audio is optional, including when a browser's audio implementation fails.
  }
}

function loadEngine(): Promise<SoundEngine | null> {
  if (!loading) {
    loading = import("cuelume")
      .then((module) => {
        module.setEnabled(soundEnabled());
        engine = module;
        return module;
      })
      .catch(() => {
        loading = null;
        return null;
      });
  }
  return loading;
}

/** Call only for a player-initiated game action; visual feedback remains primary. */
export function playGameSound(cue: GameSoundCue): void {
  if (!soundEnabled()) return;

  if (engine) {
    try {
      engine.play(SOUNDS[cue]);
    } catch {
      // Playback failure must never affect the game.
    }
    return;
  }

  const requestedAt = revision;
  void loadEngine().then((module) => {
    if (!module || requestedAt !== revision || !soundEnabled()) return;
    try {
      module.play(SOUNDS[cue]);
    } catch {
      // Playback failure must never affect the game.
    }
  });
}
