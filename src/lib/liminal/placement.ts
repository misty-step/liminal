import { CONDITION_IDS } from "./regions";
import type { ConditionId, ConditionState } from "./types";

/**
 * Board geometry and word placement. Units: the board is 100 wide and 104
 * tall; circle spacing equals the radius (a classic three-set diagram). Pure,
 * so the page only supplies measured word widths.
 */
export const BOARD_W = 100;
export const BOARD_H = 104;
export const RADIUS = 27;
export const CIRCLES: Record<ConditionId, { x: number; y: number }> = {
  c1: { x: 36.5, y: 39.5 },
  c2: { x: 63.5, y: 39.5 },
  c3: { x: 50, y: 62.9 },
};

// Keep words clear of the circle labels above and below the diagram.
const BOUNDS = { x0: 3, x1: 97, y0: 13, y1: 86 };
const MARGIN = 1.2;

const GRID: { x: number; y: number }[] = [];
for (let y = BOUNDS.y0; y <= BOUNDS.y1; y += 1) {
  for (let x = BOUNDS.x0; x <= BOUNDS.x1; x += 1) GRID.push({ x, y });
}

function signedDistance(p: { x: number; y: number }, id: ConditionId): number {
  const c = CIRCLES[id];
  return Math.hypot(p.x - c.x, p.y - c.y) - RADIUS;
}

/** How badly a word box centered at p misses the regions its verdicts name. */
function regionCost(
  p: { x: number; y: number },
  states: Record<ConditionId, ConditionState>,
  halfW: number,
  halfH: number,
): number {
  const samples = [-1, 0, 1].flatMap((dx) =>
    [-1, 0, 1].map((dy) => ({ x: p.x + dx * halfW, y: p.y + dy * halfH })),
  );
  let cost = 0;
  for (const id of CONDITION_IDS) {
    const state = states[id];
    if (state === "close") {
      cost += 1.2 * signedDistance(p, id) ** 2;
      continue;
    }
    for (const sample of samples) {
      const d = signedDistance(sample, id);
      cost += state === "inside" ? Math.max(0, d + MARGIN) ** 2 : Math.max(0, MARGIN - d) ** 2;
    }
  }
  return cost;
}

export interface PlacementInput {
  states: Record<ConditionId, ConditionState>;
  /** Measured word width in board units. */
  width: number;
}

export interface Spot {
  x: number;
  y: number;
  /**
   * False when the word's center is not in the region its verdicts name: no
   * point lies on all three lines at once, and crowding can push a word off
   * its region. The board then shows explicit marks instead of trusting position.
   */
  exact: boolean;
}

/** Greedy placement: each word, in guess order, takes the best free spot in its region. */
export function placeWords(words: readonly PlacementInput[], lineHeight: number): Spot[] {
  const halfH = lineHeight * 0.35;
  const placed: (Spot & { width: number })[] = [];
  for (const word of words) {
    const halfW = word.width / 2 - 1;
    let pool = GRID.filter((p) => regionCost(p, word.states, halfW, halfH) < 1);
    if (!pool.length) pool = GRID.filter((p) => regionCost(p, word.states, 0, 0) < 1);
    if (!pool.length) pool = GRID;
    const cx = pool.reduce((sum, p) => sum + p.x, 0) / pool.length;
    const cy = pool.reduce((sum, p) => sum + p.y, 0) / pool.length;
    let best = pool[0];
    let bestCost = Number.POSITIVE_INFINITY;
    for (const p of GRID) {
      if (p.x - word.width / 2 < 1 || p.x + word.width / 2 > BOARD_W - 1) continue;
      let cost =
        regionCost(p, word.states, halfW, halfH) + 0.03 * ((p.x - cx) ** 2 + (p.y - cy) ** 2);
      for (const q of placed) {
        const ox = (word.width + q.width) / 2 + 1.5 - Math.abs(p.x - q.x);
        const oy = lineHeight - Math.abs(p.y - q.y);
        if (ox > 0 && oy > 0) cost += 300 + 20 * ox * oy;
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = p;
      }
    }
    placed.push({
      x: best.x,
      y: best.y,
      width: word.width,
      exact: regionCost(best, word.states, 0, 0) < 1,
    });
  }
  return placed.map(({ x, y, exact }) => ({ x, y, exact }));
}
