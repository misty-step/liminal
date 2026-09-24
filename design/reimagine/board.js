// The Venn board: position is the feedback. Inside a circle, on its line
// (close), or outside it. The shaded region is where the answer must land.

import { splitCondition } from "./engine.js";

const W = 100;
const H = 104;
const R = 27;
const CIRCLES = [
  { x: 36.5, y: 39.5 },
  { x: 63.5, y: 39.5 },
  { x: 50, y: 62.9 },
];
const BOUNDS = { x0: 3, x1: 97, y0: 13, y1: 86 };
const MARGIN = 1.2;
const SVG = "http://www.w3.org/2000/svg";
const SPOKEN = { inside: "inside", close: "on the line", outside: "outside" };

function signedDistance(p, c) {
  return Math.hypot(p.x - c.x, p.y - c.y) - R;
}

/** How badly a word box centered at p misses its target regions. */
function regionCost(p, targets, halfW, halfH) {
  const samples = [
    p,
    { x: p.x - halfW, y: p.y },
    { x: p.x + halfW, y: p.y },
    { x: p.x, y: p.y - halfH },
    { x: p.x, y: p.y + halfH },
    { x: p.x - halfW, y: p.y - halfH },
    { x: p.x + halfW, y: p.y - halfH },
    { x: p.x - halfW, y: p.y + halfH },
    { x: p.x + halfW, y: p.y + halfH },
  ];
  let cost = 0;
  for (let i = 0; i < targets.length; i += 1) {
    const t = targets[i];
    if (t === "close") {
      cost += 1.2 * signedDistance(p, CIRCLES[i]) ** 2;
      continue;
    }
    for (const s of samples) {
      const d = signedDistance(s, CIRCLES[i]);
      cost += t === "inside" ? Math.max(0, d + MARGIN) ** 2 : Math.max(0, MARGIN - d) ** 2;
    }
  }
  return cost;
}

const GRID = [];
for (let y = BOUNDS.y0; y <= BOUNDS.y1; y += 1) {
  for (let x = BOUNDS.x0; x <= BOUNDS.x1; x += 1) GRID.push({ x, y });
}

/**
 * Greedy placement: each word takes the best free spot in its region. Some
 * verdicts have no exact spot (on all three lines at once), and crowding can
 * push a word off its region; those come back `exact: false` so the board
 * shows explicit marks instead of letting position mislead.
 */
function place(words, visible, unitsPerPx, measure) {
  const lineUnits = 26 * unitsPerPx;
  const halfH = 9 * unitsPerPx;
  const placed = [];
  for (const word of words) {
    const targets = CIRCLES.map((_, i) => (i < visible ? word.states[word.ids[i]] : "outside"));
    const width = measure(word.answer) * unitsPerPx + 3;
    const halfW = width / 2 - 1;
    let pool = GRID.filter((p) => regionCost(p, targets, halfW, halfH) < 1);
    if (!pool.length) pool = GRID.filter((p) => regionCost(p, targets, 0, 0) < 1);
    if (!pool.length) pool = GRID;
    const cx = pool.reduce((s, p) => s + p.x, 0) / pool.length;
    const cy = pool.reduce((s, p) => s + p.y, 0) / pool.length;
    let best = pool[0];
    let bestCost = Number.POSITIVE_INFINITY;
    for (const p of GRID) {
      if (p.x - width / 2 < 1 || p.x + width / 2 > W - 1) continue;
      let cost = regionCost(p, targets, halfW, halfH) + 0.03 * ((p.x - cx) ** 2 + (p.y - cy) ** 2);
      for (const q of placed) {
        const ox = (width + q.width) / 2 + 1.5 - Math.abs(p.x - q.x);
        const oy = lineUnits - Math.abs(p.y - q.y);
        if (ox > 0 && oy > 0) cost += 300 + 20 * ox * oy;
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = p;
      }
    }
    placed.push({ x: best.x, y: best.y, width, exact: regionCost(best, targets, 0, 0) < 1 });
  }
  return placed;
}

function svgEl(name, attrs) {
  const el = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** Which words render as finds: every find in Reach, the last word otherwise. */
function wonMap({ words, solved, finds }) {
  if (finds) return new Map(finds.map((f) => [f.index, f.listed ? "listed" : "unlisted"]));
  return solved ? new Map([[words.length - 1, "listed"]]) : new Map();
}

export function createBoard(root, puzzle, { onWord }) {
  root.classList.add("board");
  root.innerHTML = "";
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, "aria-hidden": "true" });
  const defs = svgEl("defs", {});
  CIRCLES.forEach((c, i) => {
    const clip = svgEl("clipPath", { id: `clip-${i}` });
    clip.append(svgEl("circle", { cx: c.x, cy: c.y, r: R }));
    defs.append(clip);
  });
  svg.append(defs);
  const targetLayer = svgEl("g", {});
  svg.append(targetLayer);
  const rings = CIRCLES.map((c, i) => {
    const ring = svgEl("circle", { cx: c.x, cy: c.y, r: R, class: `ring ring-${i + 1}` });
    ring.addEventListener("animationend", () => ring.classList.remove("drawing"));
    svg.append(ring);
    return ring;
  });
  root.append(svg);

  const labels = puzzle.conditions.map((condition, i) => {
    const { label, detail } = splitCondition(condition.text);
    const el = document.createElement("div");
    el.className = `circle-label label-${i + 1}`;
    el.innerHTML = `<span class="label-main"></span>${detail ? '<span class="label-detail"></span>' : ""}`;
    el.querySelector(".label-main").textContent = label;
    if (detail) el.querySelector(".label-detail").textContent = detail;
    root.append(el);
    return el;
  });

  const wordLayer = document.createElement("div");
  wordLayer.className = "word-layer";
  root.append(wordLayer);

  const canvas = document.createElement("canvas").getContext("2d");
  const measure = (text) => {
    canvas.font = getComputedStyle(root).getPropertyValue("--word-font").trim() || "500 17px serif";
    return canvas.measureText(text).width;
  };

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const STEP_MS = 1100;
  let shownVisible = 0;
  let last = null;
  let timers = [];

  /** `won` maps word index to "listed" or "unlisted" for words shown as finds. */
  function render(words, visible, solved, won) {
    const revealing = visible > shownVisible && shownVisible > 0;
    root.classList.toggle("solved", solved);

    rings.forEach((ring, i) => {
      const was = ring.classList.contains("shown");
      ring.classList.toggle("shown", i < visible);
      ring.classList.toggle("ghost", i >= visible);
      if (i < visible && !was && shownVisible > 0) ring.classList.add("drawing");
    });
    labels.forEach((label, i) => {
      label.classList.toggle("shown", i < visible);
    });

    if (visible !== shownVisible) {
      targetLayer.innerHTML = "";
      let group = targetLayer;
      for (let i = 0; i < visible; i += 1) {
        const g = svgEl("g", { "clip-path": `url(#clip-${i})` });
        group.append(g);
        group = g;
      }
      group.append(svgEl("rect", { x: 0, y: 0, width: W, height: H, class: "target" }));
    }

    const unitsPerPx = W / root.clientWidth;
    const ids = puzzle.conditions.map((c) => c.id);
    const spots = place(
      words.map((w) => ({ ...w, ids })),
      visible,
      unitsPerPx,
      measure,
    );

    words.forEach((word, i) => {
      let el = wordLayer.children[i];
      const fresh = !el;
      if (fresh) {
        el = document.createElement("button");
        el.type = "button";
        el.className = "word entering";
        el.innerHTML =
          '<span class="word-text"></span><span class="word-marks" aria-hidden="true"></span>';
        el.querySelector(".word-text").textContent = word.answer;
        el.addEventListener("click", () => onWord(i, el));
        el.style.left = "50%";
        el.style.top = "100%";
        wordLayer.append(el);
      }
      const shown = ids.slice(0, visible);
      const verdicts = shown
        .map(
          (id, k) =>
            `${splitCondition(puzzle.conditions[k].text).label}: ${SPOKEN[word.states[id]]}`,
        )
        .join("; ");
      const find = won.get(i);
      const found = find ? (find === "unlisted" ? " Found, not on our list." : " Found.") : "";
      el.setAttribute("aria-label", `${word.answer}. ${verdicts}.${found}`);
      el.classList.toggle(
        "on-line",
        shown.some((id) => word.states[id] === "close"),
      );
      const exact = spots[i].exact || Boolean(find);
      el.classList.toggle("inexact", !exact);
      el.querySelector(".word-marks").innerHTML = exact
        ? ""
        : shown.map((id, k) => `<span class="mark c-${k + 1} ${word.states[id]}"></span>`).join("");
      el.classList.toggle("won", Boolean(find));
      el.classList.toggle("unlisted", find === "unlisted");
      el.style.transitionDelay = revealing && !fresh ? "450ms" : "0ms";
      const apply = () => {
        el.classList.remove("entering");
        el.style.left = `${spots[i].x}%`;
        el.style.top = `${(spots[i].y / H) * 100}%`;
      };
      if (fresh) requestAnimationFrame(() => requestAnimationFrame(apply));
      else apply();
    });
    while (wordLayer.children.length > words.length) wordLayer.lastChild.remove();

    shownVisible = visible;
  }

  /**
   * One orchestrated sequence per guess: the word lands among the circles it
   * was aimed at, then each newly opened circle draws in turn and the words
   * migrate, then the center fills. Returns the sequence length in ms.
   */
  function update(model) {
    for (const t of timers) clearTimeout(t);
    timers = [];
    last = model;
    const { words, solved } = model;
    const visible = Math.min(model.visible, CIRCLES.length);
    const won = wonMap(model);
    const added = words.length > wordLayer.children.length;
    if (shownVisible === 0 || reduceMotion.matches || (!added && visible === shownVisible)) {
      render(words, visible, solved, won);
      return 0;
    }
    // While the new word lands, earlier finds keep their pills and the center
    // stays filled if it already was; the new find lights up at the end.
    const wasSolved = root.classList.contains("solved");
    const before = new Map(won);
    before.delete(words.length - 1);
    const frames = [shownVisible];
    for (let v = shownVisible + 1; v <= visible; v += 1) frames.push(v);
    frames.forEach((v, k) => {
      timers.push(setTimeout(() => render(words, v, wasSolved, before), k * STEP_MS));
    });
    if (!solved) return (frames.length - 1) * STEP_MS;
    const end = frames.length * STEP_MS - 300;
    timers.push(setTimeout(() => render(words, visible, true, won), end));
    return end;
  }

  // Re-place only when the board width changes; mobile toolbars resize height.
  let timer = 0;
  let width = root.clientWidth;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!last || root.clientWidth === width) return;
      width = root.clientWidth;
      for (const t of timers) clearTimeout(t);
      render(last.words, Math.min(last.visible, CIRCLES.length), last.solved, wonMap(last));
    }, 120);
  });

  return { update };
}
