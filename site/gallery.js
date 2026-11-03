import PhotoSwipeLightbox from "./vendor/photoswipe-lightbox.esm.min.js";
import { fullSrc } from "./place.js";

export async function mountGallery(root, status, empty, shown, search, filterAll, filterBike, filterHuachu) {
  let birds = [];
  try {
    const response = await fetch("/birds.json");
    if (!response.ok) throw new Error(String(response.status));
    birds = (await response.json()).birds;
  } catch {
    status.textContent = "贴纸名单没有加载出来。";
    return;
  }

  const fragment = document.createDocumentFragment();
  const cards = [];
  birds.forEach((bird, index) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.className = "card";
    link.href = fullSrc(bird.id);
    link.dataset.pswpWidth = String(bird.w);
    link.dataset.pswpHeight = String(bird.h);
    const hay = `${bird.id} ${Number(bird.id)} ${bird.name} ${bird.en} ${bird.sci}`.toLowerCase();
    link.dataset.hay = hay;
    link.dataset.bike = bird.bike ? "1" : "0";
    link.dataset.huachu = bird.id === "250" || String(bird.name).toLowerCase() === "huachu" ? "1" : "0";

    const img = document.createElement("img");
    img.src = `/assets/thumbs/${bird.id}.webp`;
    img.alt = bird.bike ? `${bird.id} ${bird.name}，骑行` : `${bird.id} ${bird.name}`;
    img.width = 480;
    img.height = 480;
    img.decoding = "async";
    if (index < 8) {
      img.loading = "eager";
      if (index < 2) img.setAttribute("fetchpriority", "high");
    } else {
      img.loading = "lazy";
    }
    img.draggable = false;

    const cap = document.createElement("span");
    cap.className = "cap";
    cap.setAttribute("aria-hidden", "true");
    const num = document.createElement("span");
    num.className = "num";
    num.textContent = bird.id;
    cap.append(num, document.createTextNode(` ${bird.name}`));
    if (bird.sci) {
      const sci = document.createElement("i");
      sci.lang = "en";
      sci.textContent = bird.sci;
      cap.append(sci);
    }
    if (link.dataset.huachu === "1") {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "huachu";
      cap.append(badge);
    } else if (bird.bike) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "骑行";
      cap.append(badge);
    }

    link.append(img, cap);
    item.append(link);
    fragment.append(item);
    cards.push({ item, link });
  });
  root.append(fragment);
  status.hidden = true;

  const lightbox = new PhotoSwipeLightbox({
    gallery: root,
    children: "li:not([hidden]) > a.card",
    pswpModule: () => import("./vendor/photoswipe.esm.min.js"),
    bgOpacity: 1,
    padding: { top: 52, bottom: 84, left: 16, right: 16 },
    closeTitle: "关闭",
    zoomTitle: "缩放",
    arrowPrevTitle: "上一张",
    arrowNextTitle: "下一张",
    errorMsg: "这张贴纸没有加载出来",
  });
  lightbox.on("afterInit", () => {
    const pswp = lightbox.pswp;
    if (!pswp || pswp.options.showHideAnimationType !== "none") return;
    pswp.element.style.opacity = "1";
    pswp.applyBgOpacity(1);
    if (pswp.opener?.isOpening) {
      pswp.opener.isOpening = false;
      pswp.dispatch("openingAnimationEnd");
    }
  });
  lightbox.on("uiRegister", () => {
    lightbox.pswp.ui.registerElement({
      name: "custom-caption",
      order: 9,
      isButton: false,
      appendTo: "root",
      onInit(el, pswp) {
        el.classList.add("pswp-caption");
        pswp.on("change", () => {
          const alt = pswp.currSlide?.data?.element?.querySelector("img")?.alt || "";
          el.textContent = alt;
        });
      },
    });
  });
  lightbox.init();

  let mode = "all";

  function setPressed() {
    filterAll.setAttribute("aria-pressed", mode === "all" ? "true" : "false");
    filterBike.setAttribute("aria-pressed", mode === "bike" ? "true" : "false");
    filterHuachu.setAttribute("aria-pressed", mode === "huachu" ? "true" : "false");
  }

  function apply() {
    const query = search.value.trim().toLowerCase();
    let visible = 0;
    for (const card of cards) {
      const match = !query || card.link.dataset.hay.includes(query);
      const kind =
        mode === "all" ||
        (mode === "bike" && card.link.dataset.bike === "1") ||
        (mode === "huachu" && card.link.dataset.huachu === "1");
      const show = match && kind;
      card.item.hidden = !show;
      if (show) visible += 1;
    }
    shown.textContent = `${visible} / ${birds.length}`;
    empty.hidden = visible !== 0;
  }

  search.addEventListener("input", apply);
  filterAll.addEventListener("click", () => {
    mode = "all";
    setPressed();
    apply();
  });
  filterBike.addEventListener("click", () => {
    mode = "bike";
    setPressed();
    apply();
  });
  filterHuachu.addEventListener("click", () => {
    mode = "huachu";
    setPressed();
    apply();
  });
  setPressed();
  apply();
}
