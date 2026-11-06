import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";
import {
  BIRD_COUNT,
  MAX_BIRDS,
  MIN_CELL,
  TARGET_ID,
  TARGET_SRC,
  buildRound,
  formatTime,
  gridFor,
  judgePick,
  mulberry32,
  pickDistractorIds,
  resolveLayout,
  scoreFor,
} from "../site/place.js";

const VIEWPORTS = [
  [390, 700],
  [768, 900],
  [1280, 720],
  [1440, 900],
  [2560, 800],
  [800, 420],
];

function assertRound(round, width, height) {
  assert.equal(round.items.length, round.cols * round.rows);
  assert.ok(round.items.length <= MAX_BIRDS);
  assert.ok(round.items.length >= 9);
  const targets = round.items.filter((item) => item.isTarget);
  assert.equal(targets.length, 1);
  const target = targets[0];
  assert.equal(target.src, TARGET_SRC);
  assert.equal(target.birdId, TARGET_ID);
  const rest = round.items.filter((item) => !item.isTarget);
  assert.ok(rest.every((item) => item.sizeK > target.sizeK));
  assert.ok(rest.some((item) => item.birdId >= 2 && item.birdId <= 7));
  const ids = rest.map((item) => item.birdId);
  assert.equal(new Set(ids).size, ids.length);
  const zs = new Set(round.items.map((item) => item.z));
  assert.equal(zs.size, round.items.length);
  const placed = resolveLayout(round, width, height);
  for (const item of placed) {
    assert.ok(item.x > item.col * (width / round.cols));
    assert.ok(item.x < (item.col + 1) * (width / round.cols));
    assert.ok(item.y > item.row * (height / round.rows));
    assert.ok(item.y < (item.row + 1) * (height / round.rows));
    assert.ok(Math.abs(item.jx) <= 0.14 + 1e-9);
    assert.ok(Math.abs(item.jy) <= 0.14 + 1e-9);
    assert.equal(item.src.includes("huashu"), false);
  }
  const targetBox = placed.find((item) => item.isTarget);
  assert.ok(placed.filter((item) => !item.isTarget).every((item) => item.size > targetBox.size));
}

test("rounds fill the sheet with one smaller huachu", () => {
  for (const [width, height] of VIEWPORTS) {
    for (const seed of [1, 2, 7, 42]) {
      assertRound(buildRound(width, height, mulberry32(seed)), width, height);
    }
  }
});

test("the same seed is the same round", () => {
  const a = buildRound(1200, 760, mulberry32(99));
  const b = buildRound(1200, 760, mulberry32(99));
  assert.deepEqual(a, b);
  const c = buildRound(1200, 760, mulberry32(100));
  assert.notDeepEqual(a, c);
});

test("layout stretches when the stage size changes", () => {
  const round = buildRound(1000, 800, mulberry32(5));
  const wide = resolveLayout(round, 1400, 600);
  const tall = resolveLayout(round, 420, 900);
  assert.equal(wide.length, tall.length);
  assert.notEqual(wide[0].x, tall[0].x);
  const target = wide.find((item) => item.isTarget);
  assert.ok(wide.every((item) => item.isTarget || item.size > target.size));
});

test("huachu is not drawn as bird 007", () => {
  let sawPelican = false;
  for (let seed = 1; seed <= 80; seed += 1) {
    const round = buildRound(1100, 760, mulberry32(seed));
    const decoy = round.items.find((item) => item.birdId === 7);
    if (!decoy) continue;
    sawPelican = true;
    assert.equal(decoy.isTarget, false);
    assert.equal(decoy.src, "/assets/thumbs/007.webp");
    assert.notEqual(decoy.src, TARGET_SRC);
  }
  assert.equal(sawPelican, true);
});

test("distractors stay inside the flock and include a bike", () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const ids = pickDistractorIds(24, mulberry32(seed));
    assert.equal(ids.length, 24);
    assert.equal(new Set(ids).size, 24);
    assert.ok(ids.every((id) => id >= 1 && id <= BIRD_COUNT));
    assert.equal(ids.includes(TARGET_ID), false);
    assert.ok(ids.some((id) => id >= 2 && id <= 7));
  }
});

test("grid caps the flock on very wide stages", () => {
  const grid = gridFor(3840, 900);
  assert.ok(grid.count <= MAX_BIRDS);
  assert.equal(grid.count, grid.cols * grid.rows);
});

test("phone-sized stages still get a dense flock", () => {
  for (const [width, height] of [[360, 420], [371, 520], [414, 640]]) {
    const grid = gridFor(width, height);
    assert.ok(grid.count >= 60, `${width}x${height} only got ${grid.count}`);
    assert.ok(grid.count <= MAX_BIRDS);
    assert.ok(Math.min(width / grid.cols, height / grid.rows) >= MIN_CELL);
  }
});

test("huachu is only a little smaller than the flock", () => {
  const round = buildRound(390, 600, mulberry32(3));
  const target = round.items.find((item) => item.isTarget);
  const smallest = Math.min(...round.items.filter((item) => !item.isTarget).map((item) => item.sizeK));
  assert.ok(target.sizeK / smallest > 0.85);
});

test("score and time", () => {
  assert.equal(formatTime(0), "0.0 秒");
  assert.equal(formatTime(1500), "1.5 秒");
  assert.equal(formatTime(61500), "1:01.5");
  assert.equal(scoreFor({ elapsedMs: 0, misses: 0 }), 1500);
  assert.ok(scoreFor({ elapsedMs: 10000, misses: 2 }) < scoreFor({ elapsedMs: 10000, misses: 0 }));
  assert.equal(scoreFor({ elapsedMs: 120000, misses: 30 }), 0);
});

test("picks ignore a finished or unready round", () => {
  assert.equal(judgePick(true, { won: false, ready: true }), "win");
  assert.equal(judgePick(false, { won: false, ready: true }), "miss");
  assert.equal(judgePick(true, { won: true, ready: true }), "ignore");
  assert.equal(judgePick(true, { won: false, ready: false }), "ignore");
});

test("catalog, thumbs, sounds, and filenames", async () => {
  const root = new URL("../site/", import.meta.url);
  const data = JSON.parse(await readFile(new URL("birds.json", root), "utf8"));
  assert.equal(data.birds.length, BIRD_COUNT);
  assert.equal(data.birds[0].id, "001");
  assert.equal(data.birds.at(-1).id, "250");
  assert.equal(data.birds.at(-1).name, "Huachu");
  assert.equal(data.birds.filter((bird) => bird.bike).length, 6);
  await access(new URL("assets/thumbs/250.webp", root));
  await access(new URL("assets/sfx/miss.mp3", root));
  await access(new URL("assets/sfx/win.mp3", root));
  for (const bird of data.birds) {
    assert.equal(bird.id.includes("huashu"), false);
    await access(new URL(`assets/thumbs/${bird.id}.webp`, root));
  }
  const names = await readdir(new URL("assets/thumbs/", root));
  assert.equal(names.length, BIRD_COUNT);
  assert.equal(names.some((name) => name.toLowerCase().includes("huashu")), false);
  assert.equal(names.includes("huachu.webp"), false);
});
