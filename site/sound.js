const STORAGE_KEY = "haishu-dog-muted";

function readMuted() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMuted(muted) {
  try {
    localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
  } catch {
    /* private mode */
  }
}

export function createSound() {
  const miss = new Audio("/assets/sfx/miss.mp3");
  const win = new Audio("/assets/sfx/win.mp3");
  miss.preload = "auto";
  win.preload = "auto";
  miss.volume = 0.45;
  win.volume = 0.72;
  let muted = readMuted();

  function play(audio) {
    if (muted) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  return {
    get muted() {
      return muted;
    },
    set muted(value) {
      muted = Boolean(value);
      writeMuted(muted);
      if (muted) {
        miss.pause();
        win.pause();
      }
    },
    prime() {
      miss.load();
      win.load();
    },
    miss() {
      play(miss);
    },
    win() {
      play(win);
    },
  };
}
