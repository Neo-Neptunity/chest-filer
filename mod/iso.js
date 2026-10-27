// 斜め上から見た絵（アイソメ）の部品。x・y が床、z が上。
//   画面の点  sx = cx + (x − y) · 32k    sy = cy + (x + y) · 16k − z · 32k
// 見ている向きは (1,1,1)。この向きに向いた面だけが見える。

export const TW = 64;   // 1升の幅（k = 1 のとき）
export const TH = 32;
export const TZ = 32;   // 高さ1の長さ

export function makeProj(cx, cy, k) {
  return (x, y, z = 0) => [cx + (x - y) * (TW / 2) * k, cy + (x + y) * (TH / 2) * k - z * TZ * k];
}

/** 画像（tw × th の絵）を、点 o を左上、u を右上、v を左下とする平行四辺形に貼る */
export function quad(ctx, tex, tw, th, o, u, v) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.transform((u[0] - o[0]) / tw, (u[1] - o[1]) / tw, (v[0] - o[0]) / th, (v[1] - o[1]) / th, o[0], o[1]);
  ctx.drawImage(tex, 0, 0);
  ctx.restore();
}

/** 平行四辺形を塗る */
export function fillQuad(ctx, o, u, v, fill) {
  ctx.beginPath();
  ctx.moveTo(o[0], o[1]);
  ctx.lineTo(u[0], u[1]);
  ctx.lineTo(u[0] + v[0] - o[0], u[1] + v[1] - o[1]);
  ctx.lineTo(v[0], v[1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

export function quadPath(ctx, o, u, v) {
  ctx.beginPath();
  ctx.moveTo(o[0], o[1]);
  ctx.lineTo(u[0], u[1]);
  ctx.lineTo(u[0] + v[0] - o[0], u[1] + v[1] - o[1]);
  ctx.lineTo(v[0], v[1]);
  ctx.closePath();
}

const IDENT = (x, y, z) => [x, y, z];
const VIEW = [1, 1, 1];

/**
 * 箱の6つの面。tf で回してから返す。
 * 面の絵は、左上 o・右上 u・左下 v（どれも3Dの点）。n は外向きの法線で、見える面は n·(1,1,1) > 0
 */
export function boxFaces(b, tf = IDENT) {
  const raw = [
    { key: "top", o: [b.x0, b.y0, b.z1], u: [b.x1, b.y0, b.z1], v: [b.x0, b.y1, b.z1], n: [0, 0, 1] },
    { key: "front", o: [b.x0, b.y1, b.z1], u: [b.x1, b.y1, b.z1], v: [b.x0, b.y1, b.z0], n: [0, 1, 0] },
    { key: "right", o: [b.x1, b.y1, b.z1], u: [b.x1, b.y0, b.z1], v: [b.x1, b.y1, b.z0], n: [1, 0, 0] },
    { key: "back", o: [b.x1, b.y0, b.z1], u: [b.x0, b.y0, b.z1], v: [b.x1, b.y0, b.z0], n: [0, -1, 0] },
    { key: "left", o: [b.x0, b.y0, b.z1], u: [b.x0, b.y1, b.z1], v: [b.x0, b.y0, b.z0], n: [-1, 0, 0] },
    { key: "bottom", o: [b.x0, b.y1, b.z0], u: [b.x1, b.y1, b.z0], v: [b.x0, b.y0, b.z0], n: [0, 0, -1] },
  ];
  const c = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2];
  const c2 = tf(...c);
  return raw.map((f) => {
    const n2 = tf(c[0] + f.n[0], c[1] + f.n[1], c[2] + f.n[2]);
    const n = [n2[0] - c2[0], n2[1] - c2[1], n2[2] - c2[2]];
    return { key: f.key, o: tf(...f.o), u: tf(...f.u), v: tf(...f.v), n, vis: n[0] * VIEW[0] + n[1] * VIEW[1] + n[2] * VIEW[2] > 1e-6 };
  });
}

// 光は、左手前の上から。上の面は暗くならず、右の面がいちばん暗い
const L = (() => { const v = [0.25, 0.55, 0.8]; const m = Math.hypot(...v); return v.map((x) => x / m); })();
export function darkness(n) {
  const m = Math.hypot(n[0], n[1], n[2]) || 1;
  const d = (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / m;
  return Math.max(0, Math.min(0.6, (1 - Math.max(0, d) / 0.8) * 0.6));
}

/**
 * 箱を描く。tex[key] = { c: canvas, w, h }。見える面だけ。
 * shade を false にすると、面の暗さを付けない
 */
export function drawBox(ctx, proj, b, tex, tf = IDENT, { shade = true, alpha = 1 } = {}) {
  const faces = boxFaces(b, tf);
  // 奥の面から
  const order = faces.filter((f) => f.vis).sort((a, c) => (a.o[0] + a.o[1] + a.o[2]) - (c.o[0] + c.o[1] + c.o[2]));
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const f of order) {
    const t = tex[f.key] || tex.side;
    if (!t) continue;
    const o = proj(...f.o), u = proj(...f.u), v = proj(...f.v);
    quad(ctx, t.c, t.w, t.h, o, u, v);
    const dark = shade ? darkness(f.n) : 0;
    if (dark > 0.01) fillQuad(ctx, o, u, v, `rgba(8,6,20,${dark.toFixed(3)})`);
  }
  ctx.restore();
  return order;
}

/** 点が、箱の見える3面のどれかの中にあるか */
export function hitBox(proj, b, px, py, tf = IDENT) {
  for (const f of boxFaces(b, tf)) {
    if (!f.vis) continue;
    const o = proj(...f.o), u = proj(...f.u), v = proj(...f.v);
    const w = [u[0] + v[0] - o[0], u[1] + v[1] - o[1]];
    if (inQuad(px, py, o, u, w, v)) return true;
  }
  return false;
}

function inQuad(px, py, a, b, c, d) {
  const s = (p, q) => (q[0] - p[0]) * (py - p[1]) - (q[1] - p[1]) * (px - p[0]);
  const v = [s(a, b), s(b, c), s(c, d), s(d, a)];
  return v.every((x) => x >= 0) || v.every((x) => x <= 0);
}

/** 箱の外ぶち（見える面の輪郭）をなぞる */
export function outlineBox(ctx, proj, b, tf = IDENT) {
  for (const f of boxFaces(b, tf)) {
    if (!f.vis) continue;
    const o = proj(...f.o), u = proj(...f.u), v = proj(...f.v);
    quadPath(ctx, o, u, v);
    ctx.stroke();
  }
}
