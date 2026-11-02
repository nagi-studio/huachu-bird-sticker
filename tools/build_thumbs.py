#!/usr/bin/env python3
"""Build site/birds.json and display-sized WebP thumbnails.

Runtime pages keep using /birds and /easter for full stickers. Thumbnails
exist so the gallery and Where's Huachu do not download the original PNGs.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
BIRDS = ROOT / "birds"
EASTER = ROOT / "easter" / "huachu-bike.png"
MANIFEST = ROOT / "manifest.json"
OUT_DIR = ROOT / "site" / "assets" / "thumbs"
META_PATH = ROOT / "site" / "birds.json"
ICON_PATH = ROOT / "site" / "apple-touch-icon.png"
MAX_SIDE = 480


def knock_out(im: Image.Image) -> Image.Image:
    """Remove a flat near-white backdrop without punching the bird body."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()

    def is_bg(x: int, y: int) -> bool:
        r, g, b, a = px[x, y]
        return a > 200 and r > 236 and g > 236 and b > 236

    corners = ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))
    if not any(is_bg(x, y) for x, y in corners):
        return im

    backup = im.copy()
    cx, cy = w // 2, h // 2
    center_alpha = px[cx, cy][3]
    seeds: list[tuple[int, int]] = []
    for x in range(0, w, 10):
        seeds.append((x, 0))
        seeds.append((x, h - 1))
    for y in range(0, h, 10):
        seeds.append((0, y))
        seeds.append((w - 1, y))
    for x, y in seeds:
        if is_bg(x, y):
            ImageDraw.floodfill(im, (x, y), (255, 255, 255, 0), thresh=14)
    if center_alpha > 180 and px[cx, cy][3] < 30:
        return backup

    px = im.load()
    for _ in range(3):
        kill: list[tuple[int, int]] = []
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a < 16 or r < 234 or g < 234 or b < 234:
                    continue
                edge = False
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if nx < 0 or ny < 0 or nx >= w or ny >= h or px[nx, ny][3] < 16:
                        edge = True
                        break
                if edge:
                    kill.append((x, y))
        if not kill:
            break
        for x, y in kill:
            r, g, b, _a = px[x, y]
            px[x, y] = (r, g, b, 0)
        if center_alpha > 180 and px[cx, cy][3] < 30:
            return backup
    return im


def to_thumb(src: Path) -> tuple[Image.Image, int, int]:
    with Image.open(src) as raw:
        raw.load()
        width, height = raw.size
        im = raw.convert("RGBA")
    im.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
    im = knock_out(im)
    return im, width, height


def save_webp(im: Image.Image, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "WEBP", quality=74, method=4)


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    birds = manifest["birds"]
    if len(birds) != 249:
        raise SystemExit(f"expected 249 birds, found {len(birds)}")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    records = []
    for bird in birds:
        number = int(bird["id"])
        file_id = f"{number:03d}"
        if "huashu" in file_id:
            raise SystemExit(file_id)
        src = ROOT / bird["path"]
        im, width, height = to_thumb(src)
        save_webp(im, OUT_DIR / f"{file_id}.webp")
        name_zh = (bird.get("name_zh") or "").strip()
        records.append(
            {
                "id": file_id,
                "name": name_zh or f"贴纸 {file_id}",
                "en": bird.get("species", "") if name_zh else "",
                "sci": bird.get("scientific_name", "") if name_zh else "",
                "w": width,
                "h": height,
                "bike": bird.get("variant") == "bike",
            }
        )
        print(file_id, flush=True)

    huachu, _w, _h = to_thumb(EASTER)
    save_webp(huachu, OUT_DIR / "huachu.webp")
    icon = Image.new("RGBA", (180, 180), (243, 236, 223, 255))
    mark = huachu.copy()
    mark.thumbnail((150, 150), Image.Resampling.LANCZOS)
    icon.alpha_composite(mark, ((180 - mark.width) // 2, (180 - mark.height) // 2))
    icon.convert("RGB").save(ICON_PATH, "PNG")
    META_PATH.write_text(
        json.dumps({"birds": records}, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {len(records)} thumbs")


if __name__ == "__main__":
    main()
