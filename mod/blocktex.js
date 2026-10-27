// ブロックの絵（16 × 16 ピクセル）を全部コードで描く。画像ファイルは使わない。
// 描いたものは、3D の描画が 1 枚の「絵の束」（テクスチャ配列）にまとめて使う。

import { KIND_IDS } from "./consts.js";
import { LAYER_NAMES, CHEST_FACES } from "./blocks.js";
import { make, mulberry32, shade, WOOD, planks, chestTex } from "./textures.js";

const px = (g, color, x, y, w = 1, h = 1) => { g.fillStyle = color; g.fillRect(x, y, w, h); };
const noise = (g, base, amp, r) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(g, shade(base, 1 - amp + r() * amp * 2), x, y); };

const PAINT = {
  grass_top(g, r) {
    noise(g, "#6aa84a", 0.12, r);
    for (let i = 0; i < 26; i++) px(g, shade("#4f8a35", 0.9 + r() * 0.2), Math.floor(r() * 16), Math.floor(r() * 16));
    for (let i = 0; i < 10; i++) px(g, shade("#86c260", 0.95 + r() * 0.1), Math.floor(r() * 16), Math.floor(r() * 16));
  },
  grass_side(g, r) {
    noise(g, "#8a5e37", 0.14, r);
    for (let i = 0; i < 18; i++) px(g, shade("#6b4526", 0.9 + r() * 0.2), Math.floor(r() * 16), 3 + Math.floor(r() * 13));
    for (let x = 0; x < 16; x++) {
      const h = 3 + (r() < 0.5 ? 1 : 0) + (r() < 0.2 ? 1 : 0);
      for (let y = 0; y < h; y++) px(g, shade("#6aa84a", 0.88 + r() * 0.24), x, y);
    }
  },
  dirt(g, r) {
    noise(g, "#8a5e37", 0.14, r);
    for (let i = 0; i < 24; i++) px(g, shade("#6b4526", 0.88 + r() * 0.2), Math.floor(r() * 16), Math.floor(r() * 16));
    for (let i = 0; i < 8; i++) px(g, shade("#a77a4c", 0.95 + r() * 0.1), Math.floor(r() * 16), Math.floor(r() * 16));
  },
  stone(g, r) {
    noise(g, "#8c8c8c", 0.07, r);
    for (let k = 0; k < 5; k++) {
      const cx = Math.floor(r() * 14), cy = Math.floor(r() * 14);
      for (let i = 0; i < 5; i++) px(g, shade("#6f6f6f", 0.9 + r() * 0.2), cx + Math.floor(r() * 3), cy + Math.floor(r() * 3));
    }
  },
  planks(g, r) { const t = { g, w: 16, h: 16 }; planks(t, WOOD.oak, 4101, 4); void r; },
  planks_dark(g, r) { const t = { g, w: 16, h: 16 }; planks(t, { base: "#5a4126", dark: "#3d2b17", light: "#6a4d2e" }, 4102, 4); void r; },
  stonebrick(g, r) {
    noise(g, "#8b8b93", 0.07, r);
    const mortar = "#5c5c66";
    for (const y of [7, 15]) px(g, mortar, 0, y, 16, 1);
    for (let y = 0; y < 7; y++) px(g, mortar, 7, y);
    for (let y = 8; y < 15; y++) { px(g, mortar, 3, y); px(g, mortar, 11, y); }
    for (let i = 0; i < 6; i++) px(g, shade("#8b8b93", 1.12), Math.floor(r() * 15), Math.floor(r() * 15));
  },
  glass(g) {
    g.clearRect(0, 0, 16, 16);
    px(g, "rgba(190,225,240,0.20)", 0, 0, 16, 16);
    px(g, "rgba(235,247,252,0.95)", 0, 0, 16, 1);
    px(g, "rgba(235,247,252,0.95)", 0, 15, 16, 1);
    px(g, "rgba(235,247,252,0.95)", 0, 0, 1, 16);
    px(g, "rgba(235,247,252,0.95)", 15, 0, 1, 16);
    for (const [x, y] of [[3, 2], [4, 3], [5, 4], [3, 5], [4, 6], [10, 11], [11, 12]]) px(g, "rgba(255,255,255,0.65)", x, y);
  },
  log_side(g, r) {
    for (let x = 0; x < 16; x++) {
      const tone = 0.85 + ((x * 7) % 5) * 0.06 + (r() - 0.5) * 0.08;
      for (let y = 0; y < 16; y++) px(g, shade("#6b5232", tone + (r() - 0.5) * 0.06), x, y);
    }
    for (const x of [2, 6, 9, 13]) for (let y = 0; y < 16; y++) if (r() < 0.8) px(g, "#4a3720", x, y);
  },
  log_top(g, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      const c = d > 6.5 ? "#6b5232" : Math.floor(d) % 2 ? "#b8945f" : "#9c7a4a";
      px(g, shade(c, 0.96 + r() * 0.08), x, y);
    }
  },
  leaves(g, r) {
    g.clearRect(0, 0, 16, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (r() < 0.2) continue;
      px(g, shade(r() < 0.3 ? "#2f7a24" : "#43932f", 0.85 + r() * 0.3), x, y);
    }
  },
  pad(g, r) {
    noise(g, "#a9a9b4", 0.035, r);
    px(g, "#6c6c78", 0, 0, 16, 1); px(g, "#6c6c78", 0, 15, 16, 1); px(g, "#6c6c78", 0, 0, 1, 16); px(g, "#6c6c78", 15, 0, 1, 16);
    px(g, "#c8c8d2", 1, 1, 14, 1); px(g, "#c8c8d2", 1, 1, 1, 14);
    px(g, "#8e8e9a", 2, 14, 13, 1); px(g, "#8e8e9a", 14, 2, 1, 13);
    for (let i = 0; i < 6; i++) px(g, shade("#a9a9b4", 0.9), 2 + Math.floor(r() * 12), 2 + Math.floor(r() * 12));
  },
  glowstone(g, r) {
    for (let by = 0; by < 8; by++) for (let bx = 0; bx < 8; bx++) {
      const c = ["#f6d878", "#e8b84a", "#d9a441", "#b57f2a", "#f9e69a"][Math.floor(r() * 5)];
      px(g, c, bx * 2, by * 2, 2, 2);
    }
    for (let i = 0; i < 18; i++) px(g, "#fff3b8", Math.floor(r() * 16), Math.floor(r() * 16));
  },
  bookshelf(g, r) {
    const t = { g, w: 16, h: 16 };
    planks(t, WOOD.oak, 4103, 4);
    for (const [y0, y1] of [[2, 7], [9, 14]]) {
      px(g, "#2a1d10", 0, y0, 16, y1 - y0);
      let x = 0;
      while (x < 16) {
        const w = 1 + Math.floor(r() * 3);
        const c = ["#8b2f2f", "#2f5f8b", "#3d7a3d", "#8b6a2f", "#6b3d8b", "#8b8b8b", "#a0522d"][Math.floor(r() * 7)];
        px(g, shade(c, 0.85 + r() * 0.3), x, y0 + Math.floor(r() * 2), Math.min(w, 16 - x), y1 - y0 - (r() < 0.3 ? 1 : 0));
        x += w;
      }
    }
  },
  torch(g) {
    g.clearRect(0, 0, 16, 16);
    px(g, "#3b2a14", 0, 0, 2, 2);
    px(g, "#7a5a2e", 0, 2, 2, 8);
    px(g, "#5c4322", 1, 2, 1, 8);
  },
  flame(g, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(g, ["#ffb02e", "#ffe36a", "#ff8a1f", "#fff0a0"][Math.floor(r() * 4)], x, y);
  },
  tallgrass(g, r) {
    g.clearRect(0, 0, 16, 16);
    for (let k = 0; k < 9; k++) {
      const x = 1 + Math.floor(r() * 14), h = 5 + Math.floor(r() * 8);
      for (let y = 0; y < h; y++) px(g, shade(y > h - 3 ? "#7ec04f" : "#4f9a34", 0.85 + r() * 0.3), x + (y > h - 3 && r() < 0.5 ? (r() < 0.5 ? -1 : 1) : 0), 15 - y);
    }
  },
  rose(g) {
    g.clearRect(0, 0, 16, 16);
    for (let y = 7; y < 16; y++) px(g, "#3f8a2a", 7, y, 1, 1);
    px(g, "#4f9a34", 5, 11, 2, 1); px(g, "#4f9a34", 8, 13, 2, 1);
    px(g, "#c4232b", 5, 3, 5, 5); px(g, "#e03c43", 6, 4, 3, 2); px(g, "#8a1218", 7, 5, 1, 2);
  },
  daisy(g) {
    g.clearRect(0, 0, 16, 16);
    for (let y = 7; y < 16; y++) px(g, "#3f8a2a", 7, y, 1, 1);
    px(g, "#4f9a34", 5, 12, 2, 1); px(g, "#4f9a34", 8, 10, 2, 1);
    px(g, "#f4f4ee", 5, 3, 5, 5); px(g, "#f6d84a", 6, 4, 3, 3); px(g, "#e0a820", 7, 5, 1, 1);
  },
  sand(g, r) {
    noise(g, "#dccf9a", 0.05, r);
    for (let i = 0; i < 16; i++) px(g, shade("#c8ba84", 0.95 + r() * 0.1), Math.floor(r() * 16), Math.floor(r() * 16));
  },
};

/** 14 × h の絵を、16 × 16 の層の左上に置いて、あまりは縁をのばして埋める（遠くで、となりの絵が混ざらないように） */
function padded(src) {
  const t = make(16, 16);
  t.g.drawImage(src.c, 0, 0);
  if (src.w < 16) t.g.drawImage(src.c, src.w - 1, 0, 1, src.h, src.w, 0, 16 - src.w, src.h);
  if (src.h < 16) t.g.drawImage(t.c, 0, src.h - 1, 16, 1, 0, src.h, 16, 16 - src.h);
  return t.c;
}

/** 層の名前から、16 × 16 の canvas */
export function paintLayer(name) {
  const m = /^chest_(\w+)_(bs|bf|ls|lf|lt|in)$/.exec(name);
  if (m && KIND_IDS.includes(m[1])) {
    const ct = chestTex(m[1]);
    const src = { bs: ct.body.right, bf: ct.body.front, ls: ct.lid.right, lf: ct.lid.front, lt: ct.lid.top, in: ct.body.top }[m[2]];
    return padded(src);
  }
  const t = make(16, 16);
  const seed = [...name].reduce((a, c) => a * 31 + c.charCodeAt(0), 17);
  (PAINT[name] || PAINT.stone)(t.g, mulberry32(seed));
  return t.c;
}

/** すべての層。LAYER_NAMES の並びのとおり */
export function paintAll() {
  return LAYER_NAMES.map(paintLayer);
}

export { CHEST_FACES };
