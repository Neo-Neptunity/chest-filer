// ブロックの種類と、絵の層の名前。画面にも本体にも触れない（node で試験できる）。

import { KIND_IDS } from "./consts.js";

export const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, PLANKS = 4, BRICK = 5, GLASS = 6, LOG = 7, LEAVES = 8, PAD = 9, GLOW = 10,
  SHELF = 11, DARK = 12, TORCH = 13, TALL = 14, ROSE = 15, DAISY = 16, CHEST = 17, SAND = 18;

const BASE_LAYERS = [
  "grass_top", "grass_side", "dirt", "stone", "planks", "stonebrick", "glass", "log_side", "log_top", "leaves", "pad", "glowstone",
  "bookshelf", "planks_dark", "torch", "flame", "tallgrass", "rose", "daisy", "sand",
];
/** チェストの面の層。種類ごとに 6 面：体の横・体の前・ふたの横・ふたの前・ふたの上・中 */
export const CHEST_FACES = ["bs", "bf", "ls", "lf", "lt", "in"];
export const LAYER_NAMES = [...BASE_LAYERS, ...KIND_IDS.flatMap((k) => CHEST_FACES.map((f) => `chest_${k}_${f}`))];
export const LAYER = Object.fromEntries(LAYER_NAMES.map((n, i) => [n, i]));
export const chestLayer = (kind, face) => LAYER[`chest_${kind}_${face}`] ?? LAYER[`chest_oak_${face}`];

/**
 * 種類ごとの決まり
 *   solid：ぶつかる　opaque：光と、となりの面をさえぎる　kind：cube・cross・torch・chest・none
 *   cut：透けた穴のある絵（葉）　blend：半透明（ガラス）　emit：光る強さ 0〜15
 *   top・bottom・side：絵の層の名前
 */
const def = (o) => ({ solid: false, opaque: false, kind: "cube", cut: false, blend: false, emit: 0, ...o });
export const DEF = [];
DEF[AIR] = def({ kind: "none" });
DEF[GRASS] = def({ solid: true, opaque: true, top: "grass_top", bottom: "dirt", side: "grass_side" });
DEF[DIRT] = def({ solid: true, opaque: true, top: "dirt", bottom: "dirt", side: "dirt" });
DEF[STONE] = def({ solid: true, opaque: true, top: "stone", bottom: "stone", side: "stone" });
DEF[PLANKS] = def({ solid: true, opaque: true, top: "planks", bottom: "planks", side: "planks" });
DEF[BRICK] = def({ solid: true, opaque: true, top: "stonebrick", bottom: "stonebrick", side: "stonebrick" });
DEF[GLASS] = def({ solid: true, blend: true, top: "glass", bottom: "glass", side: "glass" });
DEF[LOG] = def({ solid: true, opaque: true, top: "log_top", bottom: "log_top", side: "log_side" });
DEF[LEAVES] = def({ solid: true, cut: true, top: "leaves", bottom: "leaves", side: "leaves" });
DEF[PAD] = def({ solid: true, opaque: true, top: "pad", bottom: "pad", side: "pad" });
DEF[GLOW] = def({ solid: true, opaque: true, emit: 15, top: "glowstone", bottom: "glowstone", side: "glowstone" });
DEF[SHELF] = def({ solid: true, opaque: true, top: "planks", bottom: "planks", side: "bookshelf" });
DEF[DARK] = def({ solid: true, opaque: true, top: "planks_dark", bottom: "planks_dark", side: "planks_dark" });
DEF[TORCH] = def({ kind: "torch", emit: 14 });
DEF[TALL] = def({ kind: "cross", cut: true, side: "tallgrass" });
DEF[ROSE] = def({ kind: "cross", cut: true, side: "rose" });
DEF[DAISY] = def({ kind: "cross", cut: true, side: "daisy" });
DEF[CHEST] = def({ solid: true, kind: "chest" });
DEF[SAND] = def({ solid: true, opaque: true, top: "sand", bottom: "sand", side: "sand" });

export const SOLID = new Uint8Array(256);
export const OPAQUE = new Uint8Array(256);
export const EMIT = new Uint8Array(256);
for (let i = 0; i < DEF.length; i++) { if (!DEF[i]) continue; SOLID[i] = DEF[i].solid ? 1 : 0; OPAQUE[i] = DEF[i].opaque ? 1 : 0; EMIT[i] = DEF[i].emit; }
