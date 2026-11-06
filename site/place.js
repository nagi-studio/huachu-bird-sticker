/**
 * Pure layout for Where's Huachu.
 *
 * `size` is the sticker's longest side. The target is always the special
 * huachu bird (sticker 250: round bird, bucket hat, round glasses), drawn a
 * bit smaller than its neighbours. It never appears as a distractor. Cycling
 * birds 002–007 may show up as distractors only; the cycling easter sticker
 * (/easter/huachu-bike.png) is not part of the hunt.
 */

export const BIRD_COUNT = 250;
export const MAX_BIRDS = 84;
export const MIN_CELL = 44;
export const TARGET_SIZE_K = 0.86;
export const DECOY_SIZE_K = [0.94, 1.14];
export const TARGET_ID = 250;
export const TARGET_SRC = "/assets/thumbs/250.webp";
export const TARGET_FULL = "/birds/250.png";
const BIKES = [2, 3, 4, 5, 6, 7];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(list, rng) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = copy[i];
    copy[i] = copy[j];
    copy[j] = swap;
  }
  return copy;
}

export function gridFor(width, height) {
  const w = Math.max(width, 1);
  const h = Math.max(height, 1);
  // Size cells by area so small screens get a dense flock instead of a few
  // big stickers; the floor keeps each bird a comfortable tap target.
  let cell = Math.max(MIN_CELL, Math.sqrt((w * h) / MAX_BIRDS));
  const fit = (size) => {
    const cols = Math.max(3, Math.floor(w / size));
    const rows = Math.max(3, Math.floor(h / size));
    return { cols, rows, count: cols * rows };
  };
  let grid = fit(cell);
  let guard = 0;
  while (grid.count > MAX_BIRDS && guard < 48) {
    cell *= 1.07;
    grid = fit(cell);
    guard += 1;
  }
  return grid;
}

export function distractorSrc(id) {
  return `/assets/thumbs/${String(id).padStart(3, "0")}.webp`;
}

export function fullSrc(id) {
  return `/birds/${String(id).padStart(3, "0")}.png`;
}

export function pickDistractorIds(count, rng) {
  const total = Math.max(0, Math.min(BIRD_COUNT - 1, count | 0));
  if (total === 0) return [];
  const bikeTake = Math.min(total, 1 + Math.floor(rng() * 2));
  const bikes = shuffle(BIKES, rng).slice(0, bikeTake);
  const taken = new Set([TARGET_ID, ...bikes]);
  const pool = [];
  for (let id = 1; id <= BIRD_COUNT; id += 1) {
    if (!taken.has(id)) pool.push(id);
  }
  const rest = shuffle(pool, rng).slice(0, total - bikes.length);
  return shuffle(bikes.concat(rest), rng);
}

export function buildRound(width, height, rng) {
  const { cols, rows, count } = gridFor(width, height);
  const targetSlot = Math.floor(rng() * count);
  const items = [];
  let index = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const isTarget = index === targetSlot;
      items.push({
        key: index,
        col,
        row,
        jx: (rng() - 0.5) * 0.28,
        jy: (rng() - 0.5) * 0.28,
        sizeK: isTarget
          ? TARGET_SIZE_K
          : DECOY_SIZE_K[0] + rng() * (DECOY_SIZE_K[1] - DECOY_SIZE_K[0]),
        rotation: (rng() - 0.5) * 0.42,
        isTarget,
        z: 0,
        src: "",
        birdId: null,
      });
      index += 1;
    }
  }
  const ids = pickDistractorIds(count - 1, rng);
  let cursor = 0;
  for (const item of items) {
    if (item.isTarget) {
      item.src = TARGET_SRC;
      item.birdId = TARGET_ID;
    } else {
      const id = ids[cursor];
      cursor += 1;
      item.birdId = id;
      item.src = distractorSrc(id);
    }
  }
  const order = shuffle(items.map((item) => item.key), rng);
  for (let z = 0; z < order.length; z += 1) {
    items[order[z]].z = z;
  }
  return { cols, rows, count, items };
}

export function resolveLayout(round, width, height) {
  const cellW = width / round.cols;
  const cellH = height / round.rows;
  const minSide = Math.min(cellW, cellH);
  return round.items.map((item) => ({
    ...item,
    x: (item.col + 0.5 + item.jx) * cellW,
    y: (item.row + 0.5 + item.jy) * cellH,
    size: item.sizeK * minSide,
  }));
}

export function formatTime(ms) {
  const total = Math.max(0, ms) / 1000;
  if (total < 60) return `${total.toFixed(1)} 秒`;
  const minutes = Math.floor(total / 60);
  const seconds = (total - minutes * 60).toFixed(1).padStart(4, "0");
  return `${minutes}:${seconds}`;
}

export function scoreFor({ elapsedMs, misses }) {
  const seconds = Math.max(0, elapsedMs) / 1000;
  const score = Math.round(1500 - seconds * 40 - Math.max(0, misses) * 70);
  return Math.max(0, score);
}

export function judgePick(isTarget, state) {
  if (state.won || !state.ready) return "ignore";
  return isTarget ? "win" : "miss";
}
