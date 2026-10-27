// ブロックの面を、描く三角形に変える。画面にも本体にも触れない（node で試験できる）。
//
// 1つの頂点は 10 個の数：位置(3)・絵の座標(2)・絵の層(1)・光(4)
// 光の 4 つは、空の光・たいまつの光・かげ（まわりのブロックでの暗さ）・面の向きの明るさ。
// 光はなめらかに混ぜる。マイクラの「スムースライティング」と同じ考えかた。

import { DEF, OPAQUE, LAYER, AIR, GLASS, LEAVES, TORCH, CHEST, chestLayer, CHEST_FACES } from "./blocks.js";
import { SX, SY, SZ } from "./terrain.js";

export const STRIDE = 10;
export const CHUNK = 16;
export const CHUNKS_X = SX / CHUNK, CHUNKS_Z = SZ / CHUNK;

/** 面。n：外向き  v：4つの角（反時計まわり）  uv：絵の座標  shade：向きの明るさ */
const FACES = [
  { n: [0, 1, 0], v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], uv: [[0, 1], [1, 1], [1, 0], [0, 0]], shade: 1.0, part: "top" },
  { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]], shade: 0.5, part: "bottom" },
  { n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], uv: [[0, 1], [1, 1], [1, 0], [0, 0]], shade: 0.8, part: "side" },
  { n: [0, 0, -1], v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], uv: [[0, 1], [1, 1], [1, 0], [0, 0]], shade: 0.8, part: "side" },
  { n: [1, 0, 0], v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], uv: [[0, 1], [1, 1], [1, 0], [0, 0]], shade: 0.6, part: "side" },
  { n: [-1, 0, 0], v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], uv: [[0, 1], [1, 1], [1, 0], [0, 0]], shade: 0.6, part: "side" },
];

/** 伸びる入れもの */
export class Buf {
  constructor() { this.v = new Float32Array(1 << 16); this.n = 0; this.i = []; this.verts = 0; }
  vert(x, y, z, u, w, layer, a, b, c, d) {
    if (this.n + STRIDE > this.v.length) { const nv = new Float32Array(this.v.length * 2); nv.set(this.v); this.v = nv; }
    const v = this.v, o = this.n;
    v[o] = x; v[o + 1] = y; v[o + 2] = z; v[o + 3] = u; v[o + 4] = w; v[o + 5] = layer; v[o + 6] = a; v[o + 7] = b; v[o + 8] = c; v[o + 9] = d;
    this.n += STRIDE;
    return this.verts++;
  }
  quad(a, b, c, d, flip = false) {
    if (flip) this.i.push(b, c, d, b, d, a);
    else this.i.push(a, b, c, a, c, d);
  }
  done() { return { verts: this.v.slice(0, this.n), index: Uint32Array.from(this.i), count: this.i.length }; }
}

/**
 * 1つの箱を出す。faces[向きの番号] = { layer, u1, v1 }。向きの番号は FACES の並び。
 * light：{ sky, blk, ao, shade? } shade を省くと、面の向きのとおり
 */
export function emitBox(buf, x0, y0, z0, x1, y1, z1, faces, light) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  FACES.forEach((f, k) => {
    const t = faces[k];
    if (!t) return;
    const base = buf.verts;
    f.v.forEach((c, j) => {
      buf.vert(x0 + c[0] * dx, y0 + c[1] * dy, z0 + c[2] * dz, f.uv[j][0] * (t.u1 ?? 1), f.uv[j][1] * (t.v1 ?? 1), t.layer, light.sky, light.blk, light.ao, light.shade ?? f.shade);
    });
    buf.quad(base, base + 1, base + 2, base + 3);
  });
}

/** チェスト 1 つ分の形。体とふたに分かれ、ふたは後ろのふちを軸に開く。形は 1 ブロックの中で、前は +z（南） */
export function chestGeometry(kind) {
  const L = (face, u1, v1) => ({ layer: chestLayer(kind, face), u1, v1 });
  const U = 14 / 16;
  const body = new Buf(), lid = new Buf();
  const light = { sky: 1, blk: 0, ao: 1 };
  //                 +y(top)         -y(bottom)       +z(front)         -z               +x               -x
  emitBox(body, 1 / 16, 0, 1 / 16, 15 / 16, 0.5, 15 / 16, [L("in", U, U), L("bs", U, U), L("bf", U, 8 / 16), L("bs", U, 8 / 16), L("bs", U, 8 / 16), L("bs", U, 8 / 16)], light);
  emitBox(lid, 1 / 16, 0.5, 1 / 16, 15 / 16, 0.875, 15 / 16, [L("lt", U, U), L("in", U, U), L("lf", U, 6 / 16), L("ls", U, 6 / 16), L("ls", U, 6 / 16), L("ls", U, 6 / 16)], light);
  return { body: body.done(), lid: lid.done() };
}

// ── 1つの区画（16 × 16 の柱）を作る ──────────────────────────────────────

/**
 * w = { blocks, sky, blk, torches }
 * 戻り値：{ main, blend, minY, maxY }。main は、ふつうの面と、穴のある面と、草。blend は、半透明（ガラス）
 */
export function buildChunk(w, cx, cz) {
  const { blocks, sky, blk, torches } = w;
  const main = new Buf(), blend = new Buf();
  const X0 = cx * CHUNK, Z0 = cz * CHUNK;
  let minY = SY, maxY = 0;

  const idx = (x, y, z) => (y * SZ + z) * SX + x;
  const blockAt = (x, y, z) => (x < 0 || z < 0 || x >= SX || z >= SZ || y < 0 ? 3 : y >= SY ? AIR : blocks[idx(x, y, z)]);
  const opq = (x, y, z) => OPAQUE[blockAt(x, y, z)] === 1;
  const clampI = (x, y, z) => idx(Math.max(0, Math.min(SX - 1, x)), Math.max(0, Math.min(SY - 1, y)), Math.max(0, Math.min(SZ - 1, z)));
  const lskyAt = (x, y, z) => (y >= SY ? 15 : sky[clampI(x, y, z)]);
  const lblkAt = (x, y, z) => (y >= SY ? 0 : blk[clampI(x, y, z)]);

  for (let y = 0; y < SY; y++) for (let z = Z0; z < Z0 + CHUNK; z++) for (let x = X0; x < X0 + CHUNK; x++) {
    const id = blocks[idx(x, y, z)];
    if (id === AIR || id === CHEST) continue;
    const d = DEF[id];
    if (!d) continue;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;

    if (d.kind === "cube") {
      const out = d.blend ? blend : main;
      for (let k = 0; k < 6; k++) {
        const f = FACES[k];
        const nx = x + f.n[0], ny = y + f.n[1], nz = z + f.n[2];
        const nb = blockAt(nx, ny, nz);
        if (OPAQUE[nb]) continue;
        if ((d.blend && nb === id) || (d.cut && nb === id)) continue;
        const layer = LAYER[d[f.part]];
        // 面の 4 つの角それぞれの、光とかげ。axes は、面の中の 2 つの軸（0:x 1:y 2:z）。法線の軸以外
        const axes = f.n[0] ? [1, 2] : f.n[1] ? [0, 2] : [0, 1];
        const e = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
        const ao = [], ls = [], lb = [];
        for (let j = 0; j < 4; j++) {
          const c = f.v[j];
          const o1 = c[axes[0]] ? 1 : -1, o2 = c[axes[1]] ? 1 : -1;
          const cell = [[0, 0], [o1, 0], [0, o2], [o1, o2]].map(([a, b]) => [nx + e[axes[0]][0] * a + e[axes[1]][0] * b, ny + e[axes[0]][1] * a + e[axes[1]][1] * b, nz + e[axes[0]][2] * a + e[axes[1]][2] * b]);
          const oa = opq(...cell[1]), ob = opq(...cell[2]), oc = opq(...cell[3]);
          ao.push(oa && ob ? 0 : 3 - (oa ? 1 : 0) - (ob ? 1 : 0) - (oc ? 1 : 0));
          let s = 0, bsum = 0, n = 0;
          for (let m = 0; m < 4; m++) {
            if (m === 3 && oa && ob) continue;
            if (m > 0 && opq(...cell[m])) continue;
            s += lskyAt(...cell[m]); bsum += lblkAt(...cell[m]); n++;
          }
          ls.push(n ? s / n / 15 : 0); lb.push(n ? bsum / n / 15 : 0);
        }
        const base = out.verts;
        for (let j = 0; j < 4; j++) {
          out.vert(x + f.v[j][0], y + f.v[j][1], z + f.v[j][2], f.uv[j][0], f.uv[j][1], layer, ls[j], lb[j], [0.45, 0.62, 0.8, 1][ao[j]], f.shade);
        }
        out.quad(base, base + 1, base + 2, base + 3, ao[0] + ao[2] < ao[1] + ao[3]);
      }
    } else if (d.kind === "cross") {
      const layer = LAYER[d.side];
      const s = lskyAt(x, y, z) / 15, b = lblkAt(x, y, z) / 15;
      const q = (v) => {
        const base = main.verts;
        const uv = [[0, 1], [1, 1], [1, 0], [0, 0]];
        v.forEach((c, j) => main.vert(x + c[0], y + c[1], z + c[2], uv[j][0], uv[j][1], layer, s, b, 1, 0.95));
        main.quad(base, base + 1, base + 2, base + 3);
        const back = main.verts;
        [3, 2, 1, 0].forEach((j) => main.vert(x + v[j][0], y + v[j][1], z + v[j][2], uv[j][0], uv[j][1], layer, s, b, 1, 0.95));
        main.quad(back, back + 1, back + 2, back + 3);
      };
      q([[0.05, 0, 0.05], [0.95, 0, 0.95], [0.95, 1, 0.95], [0.05, 1, 0.05]]);
      q([[0.95, 0, 0.05], [0.05, 0, 0.95], [0.05, 1, 0.95], [0.95, 1, 0.05]]);
    } else if (d.kind === "torch") {
      const t = torches.get(idx(x, y, z)) || { ax: 0, az: 0 };
      const cxm = x + 0.5 + t.ax * 0.43, czm = z + 0.5 + t.az * 0.43;
      const s = lskyAt(x, y, z) / 15, b = lblkAt(x, y, z) / 15;
      const stick = { layer: LAYER.torch, u1: 2 / 16, v1: 10 / 16 };
      const faces = [{ layer: LAYER.torch, u1: 2 / 16, v1: 2 / 16 }, null, stick, stick, stick, stick];
      emitBox(main, cxm - 1 / 16, y + 3 / 16, czm - 1 / 16, cxm + 1 / 16, y + 13 / 16, czm + 1 / 16, faces, { sky: s, blk: b, ao: 1 });
      const fl = { layer: LAYER.flame, u1: 1, v1: 1 };
      emitBox(main, cxm - 1 / 16, y + 13 / 16, czm - 1 / 16, cxm + 1 / 16, y + 15 / 16, czm + 1 / 16, [fl, null, fl, fl, fl, fl], { sky: 0, blk: 1, ao: 1, shade: 1 });
    }
  }
  return { main: main.done(), blend: blend.done(), minY, maxY, cx, cz };
}

export { CHEST_FACES, TORCH, GLASS, LEAVES };
