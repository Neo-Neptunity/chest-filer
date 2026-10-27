// 歩く人の動きと、見ている先をさがす（レイ）。画面にも本体にも触れない（node で試験できる）。
//   位置 (x, y, z) は足もと。体は、幅 0.6・高さ 1.8（しゃがむと 1.5）。目は足から 1.62（しゃがむと 1.27）

import { SOLID, CHEST } from "./blocks.js";
import { SX, SY, SZ } from "./terrain.js";

export const HALF = 0.3;
export const EYE = 1.62, EYE_SNEAK = 1.27;
export const REACH = 5.5;
const GRAVITY = 28, JUMP = 8.6, TERMINAL = 52;
const WALK = 4.3, SPRINT = 5.6, SNEAK = 1.4, FLY = 10.5, FLY_FAST = 20;

export function solidAt(blocks, x, y, z) {
  if (y < 0) return true;
  if (y >= SY) return false;
  if (x < 0 || z < 0 || x >= SX || z >= SZ) return true;
  return SOLID[blocks[(y * SZ + z) * SX + x]] === 1;
}

/** 体が、ぶつかるブロックに重なるか */
export function collides(blocks, px, py, pz, h) {
  const x0 = Math.floor(px - HALF + 1e-6), x1 = Math.floor(px + HALF - 1e-6);
  const y0 = Math.floor(py + 1e-6), y1 = Math.floor(py + h - 1e-6);
  const z0 = Math.floor(pz - HALF + 1e-6), z1 = Math.floor(pz + HALF - 1e-6);
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (solidAt(blocks, x, y, z)) return true;
  return false;
}

export function createPlayer(spawn) {
  return { x: spawn.x, y: spawn.y, z: spawn.z, vx: 0, vy: 0, vz: 0, yaw: spawn.yaw || 0, pitch: spawn.pitch || 0, onGround: false, flying: false, sneak: false, sprint: false, walked: 0 };
}

export const eyeHeight = (p) => (p.sneak ? EYE_SNEAK : EYE);
export const bodyHeight = (p) => (p.sneak ? 1.5 : 1.8);

/** 見ている向き（長さ 1） */
export function forward(p) {
  const cp = Math.cos(p.pitch);
  return [-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp];
}

/**
 * 1コマ進める。inp：{ fwd, right, up }（−1〜1。up はとぶとき）と、jump・sneak・sprint・fly
 * 戻り値：なし。p を書き換える
 */
export function step(blocks, p, inp, dt) {
  dt = Math.min(dt, 0.05);
  p.sneak = !!inp.sneak && !p.flying;
  const h = bodyHeight(p);
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  // 前と右。yaw が 0 のとき、前は北（−z）、右は東（+x）
  const fwd = inp.fwd || 0, right = inp.right || 0;
  let wx = -sy * fwd + cy * right, wz = -cy * fwd - sy * right;
  const len = Math.hypot(wx, wz);
  if (len > 1) { wx /= len; wz /= len; }
  const moving = len > 0.01;
  p.sprint = !!inp.sprint && fwd > 0 && !p.sneak;
  const speed = p.flying ? (inp.sprint ? FLY_FAST : FLY) : p.sneak ? SNEAK : p.sprint ? SPRINT : WALK;
  const tx = wx * speed, tz = wz * speed;
  const k = p.flying ? 8 : p.onGround ? 14 : 3;
  const a = Math.min(1, dt * k);
  p.vx += (tx - p.vx) * a;
  p.vz += (tz - p.vz) * a;

  if (p.flying) {
    const ty = (inp.up || 0) * speed * 0.8;
    p.vy += (ty - p.vy) * Math.min(1, dt * 8);
  } else {
    p.vy = Math.max(-TERMINAL, p.vy - GRAVITY * dt);
    if (inp.jump && p.onGround) { p.vy = JUMP; p.onGround = false; }
  }

  // 軸ごとに、細かく動かして、ぶつかったら止める
  const move = (axis, d) => {
    const n = Math.max(1, Math.ceil(Math.abs(d) / 0.08));
    const sd = d / n;
    for (let i = 0; i < n; i++) {
      const nx = p.x + (axis === 0 ? sd : 0), ny = p.y + (axis === 1 ? sd : 0), nz = p.z + (axis === 2 ? sd : 0);
      if (collides(blocks, nx, ny, nz, h)) return true;
      p.x = nx; p.y = ny; p.z = nz;
    }
    return false;
  };
  const sx0 = p.x, sz0 = p.z;
  if (move(0, p.vx * dt)) p.vx = 0;
  if (move(2, p.vz * dt)) p.vz = 0;
  const hitY = move(1, p.vy * dt);
  if (hitY) { p.onGround = p.vy < 0; p.vy = 0; } else p.onGround = false;
  // 足もとが乗っていれば、地面
  if (!p.flying && !p.onGround && p.vy <= 0 && collides(blocks, p.x, p.y - 0.02, p.z, 0.1)) p.onGround = true;
  if (p.flying && p.onGround) p.flying = false;
  p.walked += moving && p.onGround ? Math.hypot(p.x - sx0, p.z - sz0) : 0;
  if (p.y < -20) { p.y = 40; p.vy = 0; }
}

/**
 * 見ている先をさがす。ブロックを1つずつたどる（DDA）。
 * chestBox(x, y, z)：チェストのブロックの中の箱 [x0,y0,z0,x1,y1,z1] か null
 * 戻り値：{ kind: "block" | "chest", x, y, z, nx, ny, nz, dist } か null。n は当たった面の向き
 */
export function raycast(blocks, ox, oy, oz, dx, dy, dz, maxDist = REACH, chestBox = null) {
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len; dy /= len; dz /= len;
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = dx ? Math.abs(1 / dx) : Infinity, tdy = dy ? Math.abs(1 / dy) : Infinity, tdz = dz ? Math.abs(1 / dz) : Infinity;
  let tx = dx ? ((dx > 0 ? x + 1 - ox : ox - x) * tdx) : Infinity;
  let ty = dy ? ((dy > 0 ? y + 1 - oy : oy - y) * tdy) : Infinity;
  let tz = dz ? ((dz > 0 ? z + 1 - oz : oz - z) * tdz) : Infinity;
  let nx = 0, ny = 0, nz = 0, t = 0;
  for (let i = 0; i < 64 && t <= maxDist; i++) {
    if (y >= 0 && y < SY && x >= 0 && z >= 0 && x < SX && z < SZ) {
      const id = blocks[(y * SZ + z) * SX + x];
      if (id === CHEST && chestBox) {
        const b = chestBox(x, y, z);
        const hit = b && rayBox(ox, oy, oz, dx, dy, dz, b);
        if (hit && hit.t <= maxDist) return { kind: "chest", x, y, z, nx: hit.nx, ny: hit.ny, nz: hit.nz, dist: hit.t };
      } else if (SOLID[id]) {
        return { kind: "block", x, y, z, nx, ny, nz, dist: t };
      }
      // 草やたいまつは、狙えない。通りぬける
    } else if (y < 0 || (y >= SY && dy > 0)) break;
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
    else if (ty < tz) { y += sy; t = ty; ty += tdy; nx = 0; ny = -sy; nz = 0; }
    else { z += sz; t = tz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
  }
  return null;
}

/** 光線と箱。当たれば { t, nx, ny, nz } */
export function rayBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = -Infinity, tmax = Infinity, nx = 0, ny = 0, nz = 0;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let a = 0; a < 3; a++) {
    const lo = b[a], hi = b[a + 3];
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo || o[a] > hi) return null; continue; }
    let t1 = (lo - o[a]) / d[a], t2 = (hi - o[a]) / d[a];
    let s = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
    if (t1 > tmin) { tmin = t1; nx = a === 0 ? s : 0; ny = a === 1 ? s : 0; nz = a === 2 ? s : 0; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  const t = Math.max(0, tmin);
  return { t, nx, ny, nz };
}
