import { mountGallery } from "./gallery.js";
import { createSound } from "./sound.js";

const galleryView = document.querySelector("#gallery-view");
const playView = document.querySelector("#play-view");
const links = [...document.querySelectorAll("[data-view]")];
const live = document.querySelector("#live");
const mute = document.querySelector("#mute");
const sound = createSound();
let gameApi = null;
let gamePromise = null;

function syncMute() {
  const muted = sound.muted;
  mute.setAttribute("aria-pressed", muted ? "true" : "false");
  mute.setAttribute("aria-label", muted ? "打开声音" : "关闭声音");
}

syncMute();
mute.addEventListener("click", () => {
  sound.muted = !sound.muted;
  syncMute();
  live.textContent = sound.muted ? "声音已关闭" : "声音已打开";
});
document.addEventListener("pointerdown", () => sound.prime(), { once: true });

function viewFromHash() {
  return location.hash === "#play" ? "play" : "gallery";
}

function setView(view) {
  const play = view === "play";
  galleryView.hidden = play;
  playView.hidden = !play;
  document.body.classList.toggle("mode-play", play);
  document.title = play ? "Where's Huachu · huachu bird" : "观鸟 · huachu bird";
  for (const link of links) {
    const current = link.dataset.view === view;
    if (current) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (play) {
    ensureGame().then((api) => api.syncVisibility());
  } else if (gameApi) {
    gameApi.syncVisibility();
  }
}

function ensureGame() {
  if (!gamePromise) {
    gamePromise = import("./game.js").then(({ mountGame }) =>
      mountGame({
        stage: document.querySelector("#stage"),
        status: document.querySelector("#stage-status"),
        win: document.querySelector("#win"),
        winStats: document.querySelector("#win-stats"),
        winReplay: document.querySelector("#win-replay"),
        timer: document.querySelector("#timer"),
        misses: document.querySelector("#misses"),
        replay: document.querySelector("#replay"),
        live,
        sound,
      }).then((api) => {
        gameApi = api;
        return api;
      }),
    );
  }
  return gamePromise;
}

document.querySelector('[data-view="play"]').addEventListener(
  "pointerenter",
  () => {
    import("./game.js");
  },
  { once: true },
);

window.addEventListener("hashchange", () => setView(viewFromHash()));
setView(viewFromHash());

mountGallery(
  document.querySelector("#gallery"),
  document.querySelector("#gallery-status"),
  document.querySelector("#gallery-empty"),
  document.querySelector("#shown"),
  document.querySelector("#q"),
  document.querySelector("#filter-all"),
  document.querySelector("#filter-bike"),
);
