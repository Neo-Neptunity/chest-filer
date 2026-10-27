// ファイルの絵（16 ピクセル）。拡張子ごとに、紙・絵・円盤・フィルム・箱・歯車・コード・禁止の印。

import { make } from "./textures.js";

const px = (g, color, x, y, w = 1, h = 1) => { g.fillStyle = color; g.fillRect(x, y, w, h); };
const K = "#2e2a3a";

/** 紙。accent があれば見出しの帯、grid なら表の罫線 */
function paper(g, accent, grid) {
  const W = "#f6f4ec", G = "#a7a9b3", S = "#d9d6cc";
  px(g, K, 3, 1, 10, 14);
  px(g, W, 4, 2, 8, 12);
  g.clearRect(11, 1, 2, 2);
  px(g, K, 10, 1, 1, 2);
  px(g, K, 11, 2, 2, 1);
  px(g, S, 11, 3, 1, 1);
  px(g, S, 10, 3, 1, 1);
  if (accent) px(g, accent, 5, 4, 6, 2);
  if (grid) {
    for (const y of [8, 10, 12]) px(g, accent || G, 5, y, 6, 1);
    px(g, accent || G, 7, 7, 1, 6);
  } else {
    for (const [y, w] of accent ? [[8, 6], [10, 6], [12, 4]] : [[4, 5], [6, 6], [8, 6], [10, 6], [12, 3]]) px(g, G, 5, y, w, 1);
  }
}

function picture(g) {
  px(g, K, 1, 2, 14, 12);
  px(g, "#8ec9f0", 2, 3, 12, 10);
  px(g, "#f6d84a", 4, 4, 2, 2);
  px(g, "#7d8a99", 8, 7, 3, 1);
  px(g, "#7d8a99", 9, 6, 1, 1);
  px(g, "#4f9a3c", 2, 10, 12, 3);
  px(g, "#3d7a2e", 2, 12, 12, 1);
  px(g, "#4f9a3c", 6, 8, 4, 2);
  px(g, "#ffffff", 2, 3, 12, 1);
}

function disc(g) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (d < 6.6) px(g, d < 1.4 ? "#0b0b10" : d < 3 ? "#e0457b" : d < 4.2 ? "#2a2a33" : d > 5.6 ? "#1b1b22" : "#33333d", x, y);
  }
  px(g, "#7a7a8a", 4, 4, 2, 1);
  px(g, "#7a7a8a", 3, 5, 1, 1);
}

function film(g) {
  px(g, K, 1, 2, 14, 12);
  px(g, "#33333d", 2, 3, 12, 10);
  for (const x of [3, 6, 9, 12]) { px(g, "#e8e8f0", x, 3, 1, 1); px(g, "#e8e8f0", x, 12, 1, 1); }
  px(g, "#78a9d8", 4, 5, 8, 6);
  px(g, "#ffffff", 7, 6, 1, 4);
  px(g, "#ffffff", 8, 7, 1, 2);
}

function bundle(g) {
  px(g, "#5c3d1c", 2, 3, 12, 11);
  px(g, "#b98a4e", 3, 4, 10, 9);
  px(g, "#d1a566", 3, 4, 10, 1);
  px(g, "#8a6330", 3, 12, 10, 1);
  for (let y = 4; y < 13; y++) px(g, y % 2 ? "#ece3d0" : "#4c4c55", 7, y, 2, 1);
  px(g, "#c4403a", 6, 2, 4, 2);
}

function gear(g) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    const tooth = Math.cos(a * 8) > 0.2 ? 1.6 : 0;
    const r = 4.7 + tooth;
    if (d < r + 0.4 && d > 2.0) px(g, d > r - 0.8 ? "#4f5668" : "#9aa3b5", x, y);
  }
  px(g, "#d5dbe8", 5, 5, 2, 1);
}

function code(g) {
  px(g, "#4a5266", 1, 1, 14, 14);
  px(g, "#1f2430", 2, 2, 12, 12);
  const G = "#6bd16b";
  for (const [x, y] of [[6, 5], [5, 6], [4, 7], [5, 8], [6, 9], [9, 5], [10, 6], [11, 7], [10, 8], [9, 9]]) px(g, G, x, y + 1);
  px(g, "#e8c25a", 7, 11, 2, 1);
}

function missing(g) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (d < 6.8 && d > 4.4) px(g, "#d8433b", x, y);
  }
  for (let i = 3; i < 13; i++) { px(g, "#d8433b", i, i); px(g, "#d8433b", i, i - 1); }
}

const DRAW = {
  paper: (g) => paper(g, null, false),
  doc: (g) => paper(g, "#3b7bd4", false),
  xls: (g) => paper(g, "#2f9e5a", true),
  ppt: (g) => paper(g, "#e3782d", false),
  pdf: (g) => paper(g, "#d8433b", false),
  md: (g) => paper(g, "#7a62c9", false),
  picture, disc, film, bundle, gear, code, missing,
};

const SETS = {
  picture: "png jpg jpeg gif webp bmp svg ico tif tiff heic avif",
  disc: "mp3 wav flac m4a ogg aac wma mid midi",
  film: "mp4 mkv avi mov wmv webm flv m4v",
  bundle: "zip rar 7z tar gz tgz bz2 xz cab iso",
  gear: "exe msi bat cmd com dll sys",
  code: "js mjs ts tsx jsx py rb go rs c h cpp java cs php html htm css json xml yml yaml toml sh ps1 sql",
  doc: "doc docx rtf odt",
  xls: "xls xlsx csv ods",
  ppt: "ppt pptx odp",
  pdf: "pdf",
  md: "md markdown",
};
const BY_EXT = new Map();
for (const [name, list] of Object.entries(SETS)) for (const e of list.split(" ")) BY_EXT.set(e, name);

/** 拡張子から、絵の名前 */
export function spriteName(ext) {
  return BY_EXT.get(String(ext || "").toLowerCase()) || "paper";
}

const cache = new Map();
/** 絵の名前から、data: の URL */
export function spriteUrl(name) {
  if (cache.has(name)) return cache.get(name);
  const t = make(16, 16);
  (DRAW[name] || DRAW.paper)(t.g);
  const url = t.c.toDataURL();
  cache.set(name, url);
  return url;
}

export const SPRITE_NAMES = Object.keys(DRAW);
