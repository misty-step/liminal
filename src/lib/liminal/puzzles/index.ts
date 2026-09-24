// The bundled deck. Append only: judgments, reports, and share links name
// these puzzles by id. The daily fallback rotation is a separate frozen list
// (`FALLBACK_ROTATION` in daily.ts), so appending here never changes a date.
// `bun run puzzles:promote` appends here; do not edit by hand otherwise.
import bathVessel from "./bath-vessel.json";
import headAndFoot from "./head-and-foot.json";
import keysMusicCarry from "./keys-music-carry.json";
import shellWaterEat from "./shell-water-eat.json";
import tailFlyAlive from "./tail-fly-alive.json";
import wheelsMotorRide from "./wheels-motor-ride.json";

export const PUZZLE_FILES: readonly { file: string; data: unknown }[] = [
  { file: "bath-vessel.json", data: bathVessel },
  { file: "shell-water-eat.json", data: shellWaterEat },
  { file: "wheels-motor-ride.json", data: wheelsMotorRide },
  { file: "keys-music-carry.json", data: keysMusicCarry },
  { file: "head-and-foot.json", data: headAndFoot },
  { file: "tail-fly-alive.json", data: tailFlyAlive },
];
