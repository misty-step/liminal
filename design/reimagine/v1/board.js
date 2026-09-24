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
const BOUNDS = { x0: 3, x1: 97, y0: 13, y1: 90 };
const MARGIN = 1.2;
const SVG = "http://www.w3.org/2000/svg";

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
      cost += 3 * signedDistance(p, CIRCLES[i]) ** 2;
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

/** Greedy placement: each word takes the best free spot in its region. */
function place(words, visible, unitsPerPx, measure) {
  const lineUnits = 24 * unitsPerPx;
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
        if (ox > 0 && oy > 0) cost += 60 + ox * oy;
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = p;
      }
    }
    placed.push({ x: best.x, y: best.y, width });
  }
  return placed;
}

function svgEl(name, attrs) {
  const el = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
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
    const ring = svgEl("circle", {
      cx: c.x,
      cy: c.y,
      r: R,
      class: `ring ring-${i + 1}`,
      pathLength: 100,
    });
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

  let shownVisible = 0;
  let last = null;

  function update(model) {
    last = model;
    const { visible, words, solved } = model;
    const revealing = visible > shownVisible && shownVisible > 0;
    root.dataset.visible = String(visible);
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
      for (let i = 0; i < Math.min(visible, CIRCLES.length); i += 1) {
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
      Math.min(visible, CIRCLES.length),
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
        el.textContent = word.answer;
        el.addEventListener("click", () => onWord(i, el));
        el.style.left = "50%";
        el.style.top = "100%";
        wordLayer.append(el);
      }
      const verdicts = ids
        .slice(0, visible)
        .map((id, k) => `${splitCondition(puzzle.conditions[k].text).label}: ${word.states[id]}`)
        .join("; ");
      el.setAttribute("aria-label", `${word.answer}. ${verdicts}`);
      el.classList.toggle("won", solved && i === words.length - 1);
      el.style.transitionDelay = revealing && !fresh ? "550ms" : "0ms";
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

  let timer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => last && update(last), 120);
  });

  return { update };
}
