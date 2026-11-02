import { Application, Assets, Sprite } from "./vendor/pixi.min.mjs";
import confetti from "./vendor/confetti.module.mjs";
import {
  buildRound,
  formatTime,
  judgePick,
  mulberry32,
  resolveLayout,
  scoreFor,
} from "./place.js";

const CONFETTI = ["#e36a2e", "#2c6e90", "#f0c2b2", "#6b4a32", "#f7f1e6", "#f2c14e"];

function randomSeed() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}

async function mapPool(items, limit, fn) {
  let cursor = 0;
  const errors = [];
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        await fn(items[index], index);
      } catch (error) {
        errors.push(error);
      }
    }
  }
  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return errors;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export async function mountGame(els) {
  const { stage, status, win, winStats, winReplay, timer, misses, replay, live, sound } = els;
  const app = new Application();
  await app.init({
    background: 0xf7f1e6,
    resizeTo: stage,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    accessibilityOptions: {
      enabledByDefault: false,
      debug: false,
      activateOnTab: true,
      deactivateOnMouseMove: true,
    },
  });
  app.canvas.classList.add("play-canvas");
  app.canvas.setAttribute("aria-label", "找 Huachu 的贴纸画布");
  stage.append(app.canvas);
  app.stage.eventMode = "passive";
  app.stage.sortableChildren = true;

  let roundGen = 0;
  let round = null;
  let sprites = [];
  let heldUrls = [];
  let running = false;
  let won = false;
  let ready = false;
  let pendingStart = false;
  let startedAt = 0;
  let elapsedBase = 0;
  let missCount = 0;
  let raf = 0;
  let bootTries = 0;
  let lastPick = { t: 0, key: -1 };
  let replayAt = 0;

  function currentElapsed() {
    if (!running) return elapsedBase;
    return elapsedBase + (performance.now() - startedAt);
  }

  function updateMeters() {
    timer.textContent = formatTime(currentElapsed());
    misses.textContent = `点错 ${missCount}`;
  }

  function stopClock() {
    if (running) elapsedBase = currentElapsed();
    running = false;
    cancelAnimationFrame(raf);
    updateMeters();
  }

  function playVisible() {
    return !document.hidden && document.body.classList.contains("mode-play");
  }

  function tick() {
    if (!running) return;
    updateMeters();
    raf = requestAnimationFrame(tick);
  }

  function tryStartTimer() {
    if (won || running || !ready) return;
    if (!playVisible()) {
      pendingStart = true;
      return;
    }
    pendingStart = false;
    running = true;
    startedAt = performance.now();
    tick();
  }

  function clearSprites() {
    for (const entry of sprites) {
      entry.sprite.removeAllListeners();
      entry.sprite.destroy();
    }
    sprites = [];
    app.stage.removeChildren();
  }

  async function release(urls) {
    await Promise.all(urls.map((url) => Assets.unload(url).catch(() => {})));
  }

  function layoutSprites() {
    if (!round || stage.clientWidth < 40 || stage.clientHeight < 40) return;
    const placed = resolveLayout(round, stage.clientWidth, stage.clientHeight);
    const byKey = new Map(placed.map((item) => [item.key, item]));
    for (const entry of sprites) {
      const item = byKey.get(entry.item.key);
      if (!item) continue;
      entry.item = item;
      const aspect = entry.sprite.texture.height / Math.max(1, entry.sprite.texture.width);
      if (aspect >= 1) {
        entry.sprite.height = item.size;
        entry.sprite.width = item.size / aspect;
      } else {
        entry.sprite.width = item.size;
        entry.sprite.height = item.size * aspect;
      }
      entry.sprite.position.set(item.x, item.y);
    }
  }

  function missFeedback(sprite) {
    if (prefersReducedMotion()) {
      const base = sprite.alpha;
      sprite.alpha = 0.45;
      window.setTimeout(() => {
        if (sprite.alpha === 0.45) sprite.alpha = base;
      }, 140);
      return;
    }
    const origin = sprite.x;
    const began = performance.now();
    const step = (now) => {
      const t = (now - began) / 280;
      if (t >= 1 || won) {
        sprite.x = origin;
        return;
      }
      sprite.x = origin + Math.sin(t * Math.PI * 6) * 6 * (1 - t);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function onPick(entry, event) {
    const now = performance.now();
    if (lastPick.key === entry.item.key && now - lastPick.t < 280) return;
    lastPick = { t: now, key: entry.item.key };
    const verdict = judgePick(entry.item.isTarget, { won, ready });
    if (verdict === "ignore") return;
    if (verdict === "miss") {
      missCount += 1;
      updateMeters();
      sound.miss();
      missFeedback(entry.sprite);
      live.textContent = `不是这只，已经点错 ${missCount} 次`;
      return;
    }
    won = true;
    ready = false;
    stopClock();
    for (const other of sprites) {
      other.sprite.eventMode = "none";
      other.sprite.alpha = other.item.isTarget ? 1 : 0.34;
    }
    if (!prefersReducedMotion()) {
      const scale = entry.sprite.scale.x;
      entry.sprite.scale.set(scale * 1.08);
    }
    const elapsed = elapsedBase;
    const score = scoreFor({ elapsedMs: elapsed, misses: missCount });
    const line = `用时 ${formatTime(elapsed)} · 点错 ${missCount} 次 · 得分 ${score}`;
    winStats.textContent = line;
    win.hidden = false;
    live.textContent = `找到 Huachu 了。${line}`;
    sound.win();
    winReplay.focus({ preventScroll: true });
    const x = (event?.clientX || window.innerWidth / 2) / window.innerWidth;
    const y = (event?.clientY || window.innerHeight * 0.62) / window.innerHeight;
    const burst = {
      spread: 80,
      origin: { x, y },
      colors: CONFETTI,
      disableForReducedMotion: true,
      scalar: 0.9,
    };
    confetti({ ...burst, particleCount: 130, ticks: 190 });
    confetti({
      ...burst,
      particleCount: 50,
      spread: 110,
      startVelocity: 32,
      origin: { x, y: Math.max(0.12, y - 0.05) },
    });
  }

  async function startRound() {
    const gen = ++roundGen;
    won = false;
    ready = false;
    pendingStart = false;
    stopClock();
    elapsedBase = 0;
    missCount = 0;
    updateMeters();
    win.hidden = true;
    status.hidden = false;
    status.textContent = "鸟群正在落下来…";
    clearSprites();

    if (stage.clientWidth < 40 || stage.clientHeight < 40) {
      bootTries += 1;
      if (bootTries > 30) {
        status.textContent = "画面尺寸不对。刷新后再试。";
        return;
      }
      window.setTimeout(() => {
        if (gen === roundGen) void startRound();
      }, 50);
      return;
    }
    bootTries = 0;

    round = buildRound(stage.clientWidth, stage.clientHeight, mulberry32(randomSeed()));
    const urls = [...new Set(round.items.map((item) => item.src))];
    const drop = heldUrls.filter((url) => !urls.includes(url));
    heldUrls = urls;
    await release(drop);
    if (gen !== roundGen) return;
    const textures = new Map();
    let done = 0;
    const errors = await mapPool(urls, 6, async (url) => {
      const texture = await Assets.load(url);
      if (gen !== roundGen) return;
      textures.set(url, texture);
      done += 1;
      status.textContent = `鸟群正在落下来… ${done} / ${urls.length}`;
    });
    if (gen !== roundGen) return;
    const target = round.items.find((item) => item.isTarget);
    if (!textures.has(target.src)) {
      status.textContent = errors.length
        ? "有鸟没飞进来。再来一局试试。"
        : "Huachu 没有出现。再来一局试试。";
      return;
    }
    heldUrls = [...textures.keys()];
    const placed = resolveLayout(round, stage.clientWidth, stage.clientHeight);
    const ordered = placed.slice().sort((a, b) => a.z - b.z);
    for (const item of ordered) {
      const texture = textures.get(item.src);
      if (!texture) continue;
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.eventMode = "static";
      sprite.cursor = "pointer";
      sprite.rotation = item.rotation;
      sprite.zIndex = item.z;
      sprite.accessible = true;
      sprite.accessibleType = "button";
      sprite.accessibleText = "贴纸";
      sprite.accessibleTitle = "贴纸";
      sprite.tabIndex = 0;
      const entry = { sprite, item };
      sprite.on("pointertap", (event) => onPick(entry, event));
      app.stage.addChild(sprite);
      sprites.push(entry);
    }
    layoutSprites();
    status.hidden = true;
    ready = true;
    live.textContent = "鸟群到齐了。找出比较小的、骑车的 Huachu。";
    tryStartTimer();
  }

  function requestReplay() {
    const now = performance.now();
    if (now - replayAt < 350) return;
    replayAt = now;
    void startRound();
  }

  replay.addEventListener("click", requestReplay);
  winReplay.addEventListener("click", () => {
    requestReplay();
    replay.focus({ preventScroll: true });
  });

  const resize = new ResizeObserver(() => layoutSprites());
  resize.observe(stage);
  document.addEventListener("visibilitychange", () => syncVisibility());

  function syncVisibility() {
    if (!playVisible()) {
      if (running) stopClock();
      else if (ready && !won) pendingStart = true;
      return;
    }
    if (pendingStart || (ready && !won && !running)) tryStartTimer();
  }

  await startRound();

  return {
    replay: requestReplay,
    syncVisibility,
  };
}
