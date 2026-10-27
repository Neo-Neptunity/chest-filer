// ワールドの地形。広間（チェストの部屋）と、そのまわりの草原。画面にも本体にも触れない。
//   x が東、z が南、y が上。ブロック1つが 1 の大きさ。歩く人の目の高さは 1.62。

import { ROOM_N } from "./consts.js";
import { AIR, GRASS, DIRT, STONE, PLANKS, BRICK, GLASS, LOG, LEAVES, PAD, GLOW, SHELF, DARK, TORCH, TALL, ROSE, DAISY } from "./blocks.js";

export const SX = 128, SY = 32, SZ = 128;
export const FLOOR = 8;                              // 広間の床のブロックの高さ。床の上の面は FLOOR + 1
export const HALL = { x0: 56, z0: 44, w: ROOM_N * 2 + 1, d: ROOM_N * 2 + 1 };   // 中の空間の、北西のすみ。大きさ
export const DOOR = { x: HALL.x0 + 8, w: 3 };        // 南の壁の入口。中央の x と幅

export const index = (x, y, z) => (y * SZ + z) * SX + x;
export const inside = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < SX && y < SY && z < SZ;

/** チェストの升 (cx, cy) の台座のブロック */
export function cellBlock(cx, cy) {
  return { x: HALL.x0 + 1 + 2 * cx, y: FLOOR, z: HALL.z0 + 1 + 2 * cy };
}

/** 広間の中のブロック (bx, bz) が属する升。広間の外なら null。台座そのものなら exact */
export function cellOfBlock(bx, bz) {
  const ix = bx - HALL.x0, iz = bz - HALL.z0;
  if (ix < 0 || iz < 0 || ix >= HALL.w || iz >= HALL.d) return null;
  const cx = Math.min(ROOM_N - 1, ix >> 1), cy = Math.min(ROOM_N - 1, iz >> 1);
  return { cx, cy, exact: (ix & 1) === 1 && (iz & 1) === 1 };
}

function hash(x, z, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z, seed) {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const fx = x - x0, fz = z - z0;
  const s = (t) => t * t * (3 - 2 * t);
  const a = hash(x0, z0, seed), b = hash(x0 + 1, z0, seed), c = hash(x0, z0 + 1, seed), d = hash(x0 + 1, z0 + 1, seed);
  const u = s(fx), v = s(fz);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (t) => t * t * (3 - 2 * t);

/** 広間のまわり（壁を含む）からの距離 */
function hallDistance(x, z) {
  const dx = Math.max(HALL.x0 - 1 - x, 0, x - (HALL.x0 + HALL.w));
  const dz = Math.max(HALL.z0 - 1 - z, 0, z - (HALL.z0 + HALL.d));
  return Math.hypot(dx, dz);
}

/** 地面の高さ。広間と入口の道のまわりは平らにする */
export function groundHeight(x, z, seed = 7) {
  const t = smooth(clamp((hallDistance(x, z) - 3) / 14, 0, 1));
  let flat = t;
  if (z > HALL.z0 + HALL.d) {
    const dc = Math.abs(x - DOOR.x);
    const wc = clamp((7 - dc) / 3, 0, 1) * clamp((26 - (z - HALL.z0 - HALL.d)) / 8, 0, 1);
    flat = t * (1 - wc);
  }
  const n = vnoise(x / 20, z / 20, seed) * 4 + vnoise(x / 8, z / 8, seed + 1) * 1.6 - 2.6;
  return clamp(FLOOR + Math.round(n * flat), 2, 14);
}

/**
 * 地形を作る。
 * 戻り値：{ blocks, torches: Map(index → { ax, az }), spawn: { x, y, z, yaw } }
 *   torches の ax・az は、たいまつから壁へ向かう向き
 */
export function generate(seed = 7) {
  const blocks = new Uint8Array(SX * SY * SZ);
  const torches = new Map();
  const get = (x, y, z) => (inside(x, y, z) ? blocks[index(x, y, z)] : AIR);
  const set = (x, y, z, b) => { if (inside(x, y, z)) blocks[index(x, y, z)] = b; };
  const fillBox = (x0, y0, z0, x1, y1, z1, b) => { for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) set(x, y, z, b); };

  // 地面
  const surface = new Int16Array(SX * SZ);
  for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
    const h = groundHeight(x, z, seed);
    surface[z * SX + x] = h;
    for (let y = 0; y <= h; y++) set(x, y, z, y === h ? GRASS : y > h - 4 ? DIRT : STONE);
  }

  // 広間
  const { x0, z0, w, d } = HALL;
  const x1 = x0 + w - 1, z1 = z0 + d - 1;               // 中の空間のはし
  const Y = FLOOR;
  fillBox(x0 - 1, Y, z0 - 1, x1 + 1, Y + 6, z1 + 1, BRICK);        // 壁と屋根のかたまり
  fillBox(x0, Y + 1, z0, x1, Y + 5, z1, AIR);                       // 中をくりぬく
  fillBox(x0, Y, z0, x1, Y, z1, PLANKS);                            // 床
  fillBox(x0, Y + 6, z0, x1, Y + 6, z1, DARK);                      // 天井
  for (let cy = 0; cy < ROOM_N; cy++) for (let cx = 0; cx < ROOM_N; cx++) { const b = cellBlock(cx, cy); set(b.x, b.y, b.z, PAD); }
  // 天井の明かり
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) set(x0 + 2 + 4 * i, Y + 6, z0 + 2 + 4 * j, GLOW);
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) set(x0 + 4 + 4 * i, Y + 6, z0 + 4 + 4 * j, GLOW);
  // 南の壁の入口
  const dx0 = DOOR.x - 1, dx1 = DOOR.x + 1;
  fillBox(dx0, Y + 1, z1 + 1, dx1, Y + 3, z1 + 1, AIR);
  fillBox(dx0 - 1, Y + 1, z1 + 1, dx0 - 1, Y + 4, z1 + 1, DARK);
  fillBox(dx1 + 1, Y + 1, z1 + 1, dx1 + 1, Y + 4, z1 + 1, DARK);
  fillBox(dx0, Y + 4, z1 + 1, dx1, Y + 4, z1 + 1, DARK);
  fillBox(dx0, Y, z1 + 1, dx1, Y, z1 + 1, PLANKS);
  // 入口から外への道
  for (let z = z1 + 2; z <= z1 + 12; z++) for (let x = dx0; x <= dx1; x++) {
    const h = surface[z * SX + x];
    set(x, h, z, PAD);
  }
  // 窓。ガラス
  const win = (xa, ya, za, xb, yb, zb) => fillBox(xa, ya, za, xb, yb, zb, GLASS);
  for (const a of [2, 12]) {
    win(x0 - 1, Y + 2, z0 + a, x0 - 1, Y + 3, z0 + a + 2);          // 西
    win(x1 + 1, Y + 2, z0 + a, x1 + 1, Y + 3, z0 + a + 2);          // 東
    win(x0 + a, Y + 3, z0 - 1, x0 + a + 2, Y + 4, z0 - 1);          // 北（本棚の上）
  }
  win(x0 + 1, Y + 2, z1 + 1, x0 + 3, Y + 3, z1 + 1);                // 南の入口のよこ
  win(x1 - 3, Y + 2, z1 + 1, x1 - 1, Y + 3, z1 + 1);
  // 北の壁に本棚
  fillBox(x0, Y + 1, z0 - 1, x1, Y + 2, z0 - 1, SHELF);
  // たいまつ（壁に付く）
  const torch = (x, y, z, ax, az) => { set(x, y, z, TORCH); torches.set(index(x, y, z), { ax, az }); };
  for (const o of [6, 10]) {
    torch(x0, Y + 3, z0 + o, -1, 0);                // 西の壁の内がわ
    torch(x1, Y + 3, z0 + o, 1, 0);                 // 東
    torch(x0 + o, Y + 3, z0, 0, -1);                // 北
  }
  for (const o of [5, 11]) torch(x0 + o, Y + 3, z1, 0, 1);          // 南の入口のよこ（内がわ）
  for (const o of [dx0 - 2, dx1 + 2]) torch(o, Y + 3, z1 + 2, 0, -1);   // 入口の外がわ。壁の南の面
  // 外の道ばたの柱の明かりは、いらない

  // 草原：木・草・花
  const nearHall = (x, z, m) => hallDistance(x, z) < m || (z > z1 && Math.abs(x - DOOR.x) < 5 && z - z1 < 30);
  const trees = [];
  for (let k = 0; k < 400 && trees.length < 70; k++) {
    const x = 6 + Math.floor(hash(k, 1, seed) * (SX - 12)), z = 6 + Math.floor(hash(k, 2, seed) * (SZ - 12));
    if (nearHall(x, z, 9) || trees.some((t) => Math.hypot(t.x - x, t.z - z) < 4.5)) continue;
    const h = surface[z * SX + x];
    if (get(x, h, z) !== GRASS) continue;
    trees.push({ x, z });
    const ht = 4 + Math.floor(hash(k, 3, seed) * 3);
    for (let y = 1; y <= ht; y++) set(x, h + y, z, LOG);
    for (let dy = ht - 2; dy <= ht + 1; dy++) {
      const r = dy >= ht ? 1 : 2;
      for (let dxl = -r; dxl <= r; dxl++) for (let dzl = -r; dzl <= r; dzl++) {
        if (r === 2 && Math.abs(dxl) === 2 && Math.abs(dzl) === 2 && hash(x + dxl, z + dzl + dy, seed) < 0.5) continue;
        if (dy === ht + 1 && Math.abs(dxl) + Math.abs(dzl) > 1) continue;
        if (get(x + dxl, h + dy, z + dzl) === AIR) set(x + dxl, h + dy, z + dzl, LEAVES);
      }
    }
  }
  for (let z = 1; z < SZ - 1; z++) for (let x = 1; x < SX - 1; x++) {
    const h = surface[z * SX + x];
    if (get(x, h, z) !== GRASS || get(x, h + 1, z) !== AIR || nearHall(x, z, 2)) continue;
    const r = hash(x, z, seed + 9);
    if (r < 0.14) set(x, h + 1, z, TALL);
    else if (r < 0.155) set(x, h + 1, z, ROSE);
    else if (r < 0.172) set(x, h + 1, z, DAISY);
  }

  return { blocks, torches, spawn: { x: DOOR.x + 0.5, y: FLOOR + 1, z: z1 + 0.5, yaw: 0, pitch: 0 }, surface };
}
