// 絵は全部ここで描く。画像ファイルは使わない。
// 木・石・チェスト・樽の模様を、16 ピクセルを 1 升として描いて、斜め上からの絵に貼る。

import { makeProj, drawBox } from "./iso.js";

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function make(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  return { c, g, w, h };
}

const px = (g, color, x, y, w = 1, h = 1) => { g.fillStyle = color; g.fillRect(x, y, w, h); };

export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

export function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** 木の色。base が地の色、dark が板のすきま、light が上のふち、line が外のふち */
export const WOOD = {
  oak: { base: "#b8945f", dark: "#8a6a3a", light: "#d2b27b", line: "#5c4524", metal: "#c9c9c9" },
  spruce: { base: "#7a5a37", dark: "#5a4027", light: "#8f6e47", line: "#33230f", metal: "#c9c9c9" },
  birch: { base: "#d8cb8e", dark: "#b3a56c", light: "#ebe2ab", line: "#7d7345", metal: "#bdbdbd" },
  jungle: { base: "#a47349", dark: "#7d5732", light: "#bb8c5f", line: "#4a3320", metal: "#c9c9c9" },
  acacia: { base: "#b45f34", dark: "#8c4426", light: "#cf7a4c", line: "#5b2a17", metal: "#c9c9c9" },
  darkoak: { base: "#4a3720", dark: "#33250f", light: "#5f4a2b", line: "#1d1408", metal: "#b5b5b5" },
  cherry: { base: "#e8b8b8", dark: "#c58f94", light: "#f5d2d2", line: "#8c5560", metal: "#d6d6d6" },
  crimson: { base: "#7b3a5c", dark: "#5a2742", light: "#9a5078", line: "#341425", metal: "#c9c9c9" },
  warped: { base: "#2f7d78", dark: "#215a58", light: "#439a93", line: "#123635", metal: "#c9c9c9" },
  ender: { base: "#1a2c33", dark: "#0e1a1f", light: "#27414a", line: "#04090b", metal: "#2de0c9", glow: "#2de0c9" },
};

/** 板を並べた模様。boardH ごとに1枚 */
export function planks(t, pal, seed, boardH = 4) {
  const r = mulberry32(seed);
  const { g, w, h } = t;
  for (let by = 0; by < h; by += boardH) {
    const tone = 0.95 + r() * 0.1;
    const bh = Math.min(boardH, h - by);
    for (let y = 0; y < bh; y++) for (let x = 0; x < w; x++) {
      let c = shade(pal.base, tone + (r() - 0.5) * 0.07);
      if (y === bh - 1 && bh > 1) c = pal.dark;
      else if (y === 0) c = shade(pal.light, 0.98);
      px(g, c, x, by + y);
    }
    const jx = Math.floor(r() * w);
    for (let y = 1; y < bh - 1; y++) px(g, pal.dark, jx, by + y);
    for (let i = 0; i < 2; i++) px(g, shade(pal.base, 0.8), Math.floor(r() * (w - 3)), by + 1 + Math.floor(r() * Math.max(1, bh - 2)), 2 + Math.floor(r() * 3), 1);
  }
}

function border(g, w, h, color, sides) {
  if (sides.includes("t")) px(g, color, 0, 0, w, 1);
  if (sides.includes("b")) px(g, color, 0, h - 1, w, 1);
  if (sides.includes("l")) px(g, color, 0, 0, 1, h);
  if (sides.includes("r")) px(g, color, w - 1, 0, 1, h);
}

const tex = (t) => ({ c: t.c, w: t.w, h: t.h });
const chestCache = new Map();

/** チェストの面。body と lid に分けて持つ（ふたは開く） */
export function chestTex(kind) {
  if (chestCache.has(kind)) return chestCache.get(kind);
  const pal = WOOD[kind] || WOOD.oak;
  const seed = [...kind].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7);

  const bodySide = make(14, 8);
  planks(bodySide, pal, seed + 1, 4);
  border(bodySide.g, 14, 8, pal.line, "lrb");
  px(bodySide.g, pal.dark, 1, 7, 12, 1);

  const bodyFront = make(14, 8);
  planks(bodyFront, pal, seed + 2, 4);
  border(bodyFront.g, 14, 8, pal.line, "lrb");
  // 留め金の受け
  px(bodyFront.g, pal.line, 6, 0, 2, 3);
  px(bodyFront.g, pal.metal, 6, 0, 2, 2);
  px(bodyFront.g, shade(pal.metal, 0.6), 6, 2, 2, 1);

  const lidSide = make(14, 6);
  planks(lidSide, pal, seed + 3, 3);
  border(lidSide.g, 14, 6, pal.line, "lrt");

  const lidFront = make(14, 6);
  planks(lidFront, pal, seed + 4, 3);
  border(lidFront.g, 14, 6, pal.line, "lrt");
  // 留め金
  px(lidFront.g, pal.line, 6, 2, 2, 4);
  px(lidFront.g, pal.metal, 6, 2, 2, 3);
  px(lidFront.g, shade(pal.metal, 0.62), 6, 5, 2, 1);
  px(lidFront.g, pal.line, 6, 4, 1, 1);

  const lidTop = make(14, 14);
  planks(lidTop, pal, seed + 5, 4);
  border(lidTop.g, 14, 14, pal.line, "tblr");
  px(lidTop.g, shade(pal.light, 1.05), 1, 1, 12, 1);

  const inside = make(14, 14);
  const r = mulberry32(seed + 9);
  for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) px(inside.g, shade(pal.glow ? "#1b1030" : "#3b2813", 0.85 + r() * 0.3), x, y);
  border(inside.g, 14, 14, shade(pal.dark, 0.9), "tblr");
  px(inside.g, shade(pal.base, 0.75), 1, 1, 12, 1);

  if (pal.glow) {
    // エンダーチェストの目
    px(bodyFront.g, pal.glow, 6, 0, 2, 2);
    px(lidFront.g, pal.glow, 6, 3, 2, 2);
    px(lidFront.g, "#ffffff", 6, 3, 1, 1);
    px(lidTop.g, "#4b2a7a", 4, 4, 6, 6);
    px(lidTop.g, "#7a4cc2", 5, 5, 4, 4);
    px(lidTop.g, pal.glow, 6, 6, 2, 2);
  }

  const out = {
    body: { top: tex(inside), front: tex(bodyFront), right: tex(bodySide), left: tex(bodySide), back: tex(bodySide), bottom: tex(bodySide) },
    lid: { top: tex(lidTop), front: tex(lidFront), right: tex(lidSide), left: tex(lidSide), back: tex(lidSide), bottom: tex(inside) },
  };
  chestCache.set(kind, out);
  return out;
}

export const CHEST_H = 0.4375;

/** 床の升 (cx, cy) の中央にチェストを描く。open は 0 から 1 */
export function drawChest(ctx, proj, cx, cy, kind, open = 0) {
  const t = chestTex(kind);
  const H = CHEST_H;
  const body = { x0: cx - H, x1: cx + H, y0: cy - H, y1: cy + H, z0: 0, z1: 0.5 };
  const lid = { x0: cx - H, x1: cx + H, y0: cy - H, y1: cy + H, z0: 0.5, z1: 0.875 };
  const e = open * open * (3 - 2 * open);
  const th = e * (78 * Math.PI) / 180;
  const hy = cy - H, hz = 0.5;
  const cos = Math.cos(th), sin = Math.sin(th);
  const tf = th < 0.01 ? undefined : (x, y, z) => { const d = y - hy, f = z - hz; return [x, hy + d * cos - f * sin, hz + d * sin + f * cos]; };
  if (th > 0.5) {
    drawBox(ctx, proj, lid, t.lid, tf);
    drawBox(ctx, proj, body, t.body);
  } else {
    drawBox(ctx, proj, body, t.body);
    drawBox(ctx, proj, lid, t.lid, tf);
  }
}

export function chestBox(cx, cy, top = 0.875) {
  const H = CHEST_H;
  return { x0: cx - H, x1: cx + H, y0: cy - H, y1: cy + H, z0: 0, z1: top };
}

// ── 樽（本物のフォルダ） ──
let barrelT = null;
export function barrelTex() {
  if (barrelT) return barrelT;
  const side = make(14, 14);
  const r = mulberry32(77);
  for (let x = 0; x < 14; x++) {
    const stave = Math.floor(x / 3.5);
    const tone = 0.9 + (stave % 2) * 0.1 + (r() - 0.5) * 0.04;
    for (let y = 0; y < 14; y++) px(side.g, shade("#a07a44", tone + (r() - 0.5) * 0.06), x, y);
    if (x % 3.5 < 1) px(side.g, "#6b4f2a", x, 0, 1, 14);
  }
  for (const y of [2, 11]) { px(side.g, "#4a4a52", 0, y, 14, 2); px(side.g, "#8a8a94", 0, y, 14, 1); }
  border(side.g, 14, 14, "#4a3a20", "lr");
  const top = make(14, 14);
  for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) {
    const d = Math.hypot(x - 6.5, y - 6.5);
    const c = d < 3.2 ? "#24170a" : d < 5 ? "#6b4f2a" : shade("#a07a44", 0.95 + r() * 0.1);
    px(top.g, c, x, y);
  }
  border(top.g, 14, 14, "#4a3a20", "tblr");
  barrelT = { top: tex(top), front: tex(side), right: tex(side), left: tex(side), back: tex(side), bottom: tex(side) };
  return barrelT;
}

export function drawBarrel(ctx, proj, cx, cy) {
  const H = CHEST_H;
  drawBox(ctx, proj, { x0: cx - H, x1: cx + H, y0: cy - H, y1: cy + H, z0: 0, z1: 0.875 }, barrelTex());
}

// ── 部屋の床と壁 ──
const roomCache = {};
export function floorTile(i) {
  const key = `f${i % 2}`;
  if (roomCache[key]) return roomCache[key];
  const t = make(16, 16);
  const pal = i % 2 ? { base: "#6a4d2f", dark: "#4b341e", light: "#7b5b3a" } : { base: "#7c5a37", dark: "#58401f", light: "#8d6a44" };
  planks(t, pal, 100 + (i % 2) * 17, 4);
  return (roomCache[key] = tex(t));
}

export function wallTile(night) {
  const key = night ? "wn" : "wd";
  if (roomCache[key]) return roomCache[key];
  const t = make(16, 16);
  const r = mulberry32(night ? 5 : 6);
  const base = "#8b8b93";
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(t.g, shade(base, 0.93 + r() * 0.14), x, y);
  const mortar = "#5c5c66";
  for (const y of [7, 15]) px(t.g, mortar, 0, y, 16, 1);
  for (let y = 0; y < 7; y++) px(t.g, mortar, 7, y, 1, 1);
  for (let y = 8; y < 15; y++) { px(t.g, mortar, 3, y, 1, 1); px(t.g, mortar, 11, y, 1, 1); }
  for (let i = 0; i < 6; i++) px(t.g, shade(base, 1.12), Math.floor(r() * 15), Math.floor(r() * 15), 1, 1);
  return (roomCache[key] = tex(t));
}

export function woolTile(color = "#a3302f") {
  const key = `wool${color}`;
  if (roomCache[key]) return roomCache[key];
  const t = make(16, 16);
  const r = mulberry32(31);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(t.g, shade(color, 0.92 + r() * 0.16), x, y);
  return (roomCache[key] = tex(t));
}

// ── 小さな絵として使う（スロットの中・ボタン） ──
const iconCache = new Map();

/** スロットの中のチェストの絵。種類と、開いているかで決まる */
export function chestIcon(kind, open = false) {
  const key = `chest:${kind}:${open ? 1 : 0}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const S = 32;
  const t = make(S, S);
  const k = 0.54;
  const proj = makeProj(S / 2, S / 2 + 14 * k + (open ? 2 : 0), k);
  drawChest(t.g, proj, 0, 0, kind, open ? 1 : 0);
  const url = t.c.toDataURL();
  iconCache.set(key, url);
  return url;
}

export function barrelIcon() {
  if (iconCache.has("barrel")) return iconCache.get("barrel");
  const S = 32;
  const t = make(S, S);
  const k = 0.54;
  drawBarrel(t.g, makeProj(S / 2, S / 2 + 14 * k, k), 0, 0);
  const url = t.c.toDataURL();
  iconCache.set("barrel", url);
  return url;
}
