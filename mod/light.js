// 光。空からの光（sky）と、たいまつなどの光（blk）。マイクラと同じく、1ブロックごとに 1 ずつ弱くなる。
// 画面にも本体にも触れない。

import { OPAQUE, EMIT } from "./blocks.js";
import { SX, SY, SZ } from "./terrain.js";

const NX = [1, -1, 0, 0, 0, 0], NY = [0, 0, 1, -1, 0, 0], NZ = [0, 0, 0, 0, 1, -1];

function spread(blocks, arr, queue) {
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h];
    const l = arr[i];
    if (l <= 1) continue;
    const x = i % SX, z = ((i / SX) | 0) % SZ, y = (i / (SX * SZ)) | 0;
    for (let k = 0; k < 6; k++) {
      const nx = x + NX[k], ny = y + NY[k], nz = z + NZ[k];
      if (nx < 0 || ny < 0 || nz < 0 || nx >= SX || ny >= SY || nz >= SZ) continue;
      const j = (ny * SZ + nz) * SX + nx;
      if (OPAQUE[blocks[j]] || arr[j] >= l - 1) continue;
      arr[j] = l - 1;
      queue.push(j);
    }
  }
}

/** 光の強さ 0〜15 を、ブロックごとに。{ sky, blk } */
export function computeLight(blocks) {
  const N = SX * SY * SZ;
  const sky = new Uint8Array(N), blk = new Uint8Array(N);
  // 空から。上から下へ、さえぎるブロックに当たるまで 15
  for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
    for (let y = SY - 1; y >= 0; y--) {
      const i = (y * SZ + z) * SX + x;
      if (OPAQUE[blocks[i]]) break;
      sky[i] = 15;
    }
  }
  const q = [];
  for (let i = 0; i < N; i++) {
    if (sky[i] !== 15) continue;
    const x = i % SX, z = ((i / SX) | 0) % SZ, y = (i / (SX * SZ)) | 0;
    // よこに、まだ暗い所があれば、そこから広げる
    for (let k = 0; k < 6; k++) {
      if (k === 2) continue;
      const nx = x + NX[k], ny = y + NY[k], nz = z + NZ[k];
      if (nx < 0 || ny < 0 || nz < 0 || nx >= SX || ny >= SY || nz >= SZ) continue;
      const j = (ny * SZ + nz) * SX + nx;
      if (!OPAQUE[blocks[j]] && sky[j] < 14) { q.push(i); break; }
    }
  }
  spread(blocks, sky, q);
  // たいまつ・光るブロックから
  const q2 = [];
  for (let i = 0; i < N; i++) {
    const e = EMIT[blocks[i]];
    if (e) { blk[i] = e; q2.push(i); }
  }
  spread(blocks, blk, q2);
  return { sky, blk };
}
