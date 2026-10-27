// 部屋。斜め上から見た床と壁にチェストを並べる。canvas に描く。
// 見る向きは 4 通り。壁はいつも奥にあって、向きを変えるとチェストが回りこむ。

import { ROOM_N as N } from "./consts.js";
import { makeProj, TW, TH, TZ, quad, fillQuad, quadPath, hitBox, boxFaces } from "./iso.js";
import { drawChest, chestBox, floorTile, wallTile, mulberry32 } from "./textures.js";

export const FONT = '"BIZ UDGothic","MS Gothic","Yu Gothic UI","Meiryo UI",sans-serif';
const WALL_H = 2;

/** 元の升（連続した座標）を、見る向きに合わせて回す */
export function rotPt(x, y, rot) {
  switch (rot & 3) {
    case 0: return [x, y];
    case 1: return [N - y, x];
    case 2: return [N - x, N - y];
    default: return [y, N - x];
  }
}
export function unrotPt(X, Y, rot) {
  switch (rot & 3) {
    case 0: return [X, Y];
    case 1: return [Y, N - X];
    case 2: return [N - X, N - Y];
    default: return [N - Y, X];
  }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * hooks = {
 *   world(): World, night(): boolean, lights(): boolean,
 *   onOpen(cid), onContext(cid | null, event), onMove(cid, x, y), onNest(cid, intoCid), onBackground(),
 *   onHover(cid | null), onCamera()
 * }
 */
export function createRoom(canvas, hooks) {
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1;
  const cam = { rot: 0, zoom: 1, panX: 0, panY: 0 };
  const inset = { left: 0, right: 0, cur: { left: 0, right: 0 } };
  const open = new Map();            // cid → 0..1（ふたの開き）
  const pulses = new Map();          // cid → 始めた時刻
  const flashes = new Map();
  let openCid = null, hoverCid = null, dropHint = null;
  let press = null, drag = null, pan = null, pointer = null;
  let last = 0, raf = 0, t0 = performance.now();
  let layoutCache = null;
  let paused = false;

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  function layout() {
    const availW = Math.max(200, W - inset.cur.left - inset.cur.right);
    const kw = (availW * 0.94) / (N * TW);
    const kh = (H - 150) / (N * TH + WALL_H * TZ);
    const k = Math.max(0.3, Math.min(kw, kh) * cam.zoom);
    const cx = inset.cur.left + availW / 2 + cam.panX;
    const cy = H / 2 + 6 - ((N * TH - WALL_H * TZ) * k) / 2 + cam.panY;
    layoutCache = { k, cx, cy, proj: makeProj(cx, cy, k) };
    return layoutCache;
  }

  // ── チェストの並び（奥から手前） ──
  function placed() {
    const w = hooks.world();
    return w.room
      .map((r) => { const [X, Y] = rotPt(r.x + 0.5, r.y + 0.5, cam.rot); return { cid: r.cid, x: r.x, y: r.y, X, Y }; })
      .sort((a, b) => (a.X + a.Y) - (b.X + b.Y));
  }

  function chestAtPoint(px, py, skip) {
    const { proj } = layoutCache || layout();
    const list = placed();
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      if (c.cid === skip) continue;
      if (hitBox(proj, chestBox(c.X, c.Y, 0.875), px, py)) return c.cid;
    }
    return null;
  }

  /** 画面の点が指す、床の升（元の升）。部屋の外なら null */
  function cellAtPoint(px, py) {
    const { k, cx, cy } = layoutCache || layout();
    const a = (px - cx) / ((TW / 2) * k);
    const b = (py - cy) / ((TH / 2) * k);
    const [x, y] = unrotPt((a + b) / 2, (b - a) / 2, cam.rot);
    const gx = Math.floor(x), gy = Math.floor(y);
    return gx < 0 || gy < 0 || gx >= N || gy >= N ? null : { x: gx, y: gy, fx: x, fy: y };
  }

  /** 画面の点にあるもの。chest のほか、空いた升も */
  function pointAt(px, py) {
    const rect = canvas.getBoundingClientRect();
    const x = px - rect.left, y = py - rect.top;
    const cid = chestAtPoint(x, y);
    return { cid, cell: cellAtPoint(x, y), inside: x >= 0 && y >= 0 && x <= rect.width && y <= rect.height };
  }

  /** 升の中央の画面上の位置（CSS ピクセル。canvas の左上から） */
  function cellScreen(gx, gy) {
    const { proj } = layoutCache || layout();
    const [X, Y] = rotPt(gx + 0.5, gy + 0.5, cam.rot);
    const [x, y] = proj(X, Y, 0);
    return { x, y };
  }

  /** チェストの中央の画面上の位置（CSS ピクセル。canvas の左上から） */
  function chestScreen(cid) {
    const { proj } = layoutCache || layout();
    const c = placed().find((p) => p.cid === cid);
    if (!c) return null;
    const [x, y] = proj(c.X, c.Y, 0.4);
    return { x, y };
  }

  // ── 描く ──
  function poly(pts, fill) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function drawFloor(proj, night) {
    // すきまの色
    poly([proj(0, 0), proj(N, 0), proj(N, N), proj(0, N)], "#3b2a18");
    const t0 = floorTile(0), t1 = floorTile(1);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const t = (x + y) % 2 ? t1 : t0;
      quad(ctx, t.c, t.w, t.h, proj(x, y), proj(x + 1, y), proj(x, y + 1));
    }
    // 壁ぎわの影
    const g = ctx.createLinearGradient(...proj(0, 0), ...proj(1.2, 1.2));
    g.addColorStop(0, "rgba(0,0,0,.28)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    quadPath(ctx, proj(0, 0), proj(N, 0), proj(0, 1.2));
    ctx.fill();
    quadPath(ctx, proj(0, 0), proj(1.2, 0), proj(0, N));
    ctx.fill();
    void night;
  }

  function drawWalls(proj, night, k, time, lights) {
    const wt = wallTile(night);
    // 奥の右の壁（y = 0）と、奥の左の壁（x = 0）
    for (let i = 0; i < N; i++) for (let j = 0; j < WALL_H; j++) {
      quad(ctx, wt.c, wt.w, wt.h, proj(i, 0, j + 1), proj(i + 1, 0, j + 1), proj(i, 0, j));
      quad(ctx, wt.c, wt.w, wt.h, proj(0, i + 1, j + 1), proj(0, i, j + 1), proj(0, i + 1, j));
    }
    fillQuad(ctx, proj(0, 0, WALL_H), proj(N, 0, WALL_H), proj(0, 0, 0), "rgba(8,6,20,.2)");
    fillQuad(ctx, proj(0, N, WALL_H), proj(0, 0, WALL_H), proj(0, N, 0), "rgba(8,6,20,.4)");
    // 幅木
    fillQuad(ctx, proj(0, 0, 0.16), proj(N, 0, 0.16), proj(0, 0, 0), "#3d2c19");
    fillQuad(ctx, proj(0, N, 0.16), proj(0, 0, 0.16), proj(0, N, 0), "#2a1d10");
    // 壁の上のへり
    poly([proj(0, 0, WALL_H), proj(N, 0, WALL_H), proj(N, -0.25, WALL_H), proj(-0.25, -0.25, WALL_H), proj(-0.25, N, WALL_H), proj(0, N, WALL_H)], "#a9a9b2");
    poly([proj(-0.25, -0.25, WALL_H), proj(N, -0.25, WALL_H), proj(N, -0.25, WALL_H - 0.14), proj(-0.25, -0.25, WALL_H - 0.14)], "#6f6f79");
    poly([proj(-0.25, -0.25, WALL_H), proj(-0.25, N, WALL_H), proj(-0.25, N, WALL_H - 0.14), proj(-0.25, -0.25, WALL_H - 0.14)], "#55555f");
    // 窓
    for (const [a, b] of [[1.5, 3.0], [5.0, 6.5]]) {
      windowAt(proj, "A", a, b, night, time);
      windowAt(proj, "B", a, b, night, time);
    }
    // 松明
    if (lights) for (const s of [0.65, 3.9, 7.3]) { torch(proj, "A", s, night, k, time); torch(proj, "B", s, night, k, time + 1.7); }
  }

  function wallP(proj, plane) { return plane === "A" ? (s, z) => proj(s, 0, z) : (s, z) => proj(0, s, z); }

  function windowAt(proj, plane, s0, s1, night) {
    const P = wallP(proj, plane);
    const z0 = 0.72, z1 = 1.62, f = 0.08;
    poly([P(s0 - f, z1 + f), P(s1 + f, z1 + f), P(s1 + f, z0 - f), P(s0 - f, z0 - f)], "#3f2d1b");
    const a = P(s0, z1), d = P(s0, z0);
    const g = ctx.createLinearGradient(a[0], a[1], d[0], d[1]);
    if (night) { g.addColorStop(0, "#080c26"); g.addColorStop(1, "#1d2c63"); } else { g.addColorStop(0, "#8fcdf5"); g.addColorStop(1, "#e2f3ff"); }
    poly([a, P(s1, z1), P(s1, z0), d], g);
    if (night) {
      const r = mulberry32(Math.floor(s0 * 10) + (plane === "A" ? 1 : 2));
      ctx.fillStyle = "rgba(255,255,255,.85)";
      for (let i = 0; i < 6; i++) { const [x, y] = P(s0 + r() * (s1 - s0), z0 + 0.1 + r() * (z1 - z0 - 0.2)); ctx.fillRect(x, y, 1.5, 1.5); }
    }
    ctx.strokeStyle = "#3f2d1b";
    ctx.lineWidth = Math.max(1.5, 3 * (layoutCache ? layoutCache.k : 1));
    ctx.beginPath();
    const m1 = P((s0 + s1) / 2, z1), m2 = P((s0 + s1) / 2, z0), n1 = P(s0, (z0 + z1) / 2), n2 = P(s1, (z0 + z1) / 2);
    ctx.moveTo(m1[0], m1[1]); ctx.lineTo(m2[0], m2[1]);
    ctx.moveTo(n1[0], n1[1]); ctx.lineTo(n2[0], n2[1]);
    ctx.stroke();
    // 窓台
    poly([P(s0 - f - 0.04, z0 - f), P(s1 + f + 0.04, z0 - f), plane === "A" ? proj(s1 + f + 0.04, 0.14, z0 - f) : proj(0.14, s1 + f + 0.04, z0 - f), plane === "A" ? proj(s0 - f - 0.04, 0.14, z0 - f) : proj(0.14, s0 - f - 0.04, z0 - f)], "#7a5a37");
  }

  function torch(proj, plane, s, night, k, time) {
    const P = wallP(proj, plane);
    const w = 0.05;
    fillQuad(ctx, P(s - w, 1.3), P(s + w, 1.3), P(s - w, 0.95), "#6b4a24");
    const fl = 0.5 + 0.5 * Math.sin(time * 9 + s * 5) * Math.sin(time * 5.3 + s);
    const [fx, fy] = P(s, 1.42);
    const r = (night ? 150 : 60) * k * (0.9 + 0.12 * fl);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
    g.addColorStop(0, night ? "rgba(255,170,60,.55)" : "rgba(255,200,100,.22)");
    g.addColorStop(1, "rgba(255,140,40,0)");
    ctx.fillStyle = g;
    ctx.fillRect(fx - r, fy - r, r * 2, r * 2);
    ctx.restore();
    const u = 5 * k;
    ctx.fillStyle = "#ff9a1f";
    ctx.fillRect(fx - u * 0.9, fy - u * (1.1 + 0.3 * fl), u * 1.8, u * (1.5 + 0.3 * fl));
    ctx.fillStyle = "#ffe36a";
    ctx.fillRect(fx - u * 0.5, fy - u * (0.7 + 0.2 * fl), u, u * 1.0);
  }

  function shadow(proj, X, Y, a = 0.26) {
    poly([proj(X - 0.52, Y - 0.52), proj(X + 0.6, Y - 0.52), proj(X + 0.6, Y + 0.6), proj(X - 0.52, Y + 0.6)], `rgba(0,0,0,${a})`);
  }

  function glowBox(proj, X, Y, color, top = 0.875) {
    for (const f of boxFaces(chestBox(X, Y, top))) {
      if (!f.vis) continue;
      fillQuad(ctx, proj(...f.o), proj(...f.u), proj(...f.v), color);
    }
  }

  function cellDiamond(proj, gx, gy, stroke, fill) {
    const [x0, y0] = rotPt(gx, gy, cam.rot), [x1, y1] = rotPt(gx + 1, gy + 1, cam.rot);
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1), ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    ctx.beginPath();
    for (const [i, p] of [proj(xa, ya), proj(xb, ya), proj(xb, yb), proj(xa, yb)].entries()) i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  }

  function label(proj, X, Y, text, sub, hot, k) {
    const [x, y] = proj(X, Y, 1.12);
    const fs = Math.round(clamp(9 + k * 3.4, 11, 17));
    ctx.font = `bold ${fs}px ${FONT}`;
    const tw = Math.min(ctx.measureText(text).width, 180);
    ctx.font = `${Math.round(fs * 0.78)}px ${FONT}`;
    const sw = sub ? ctx.measureText(sub).width : 0;
    const w = Math.max(tw, sw) + 14, h = sub ? fs * 2 + 6 : fs + 8;
    const rx = x - w / 2, ry = y - h;
    ctx.fillStyle = hot ? "rgba(20,14,40,.82)" : "rgba(10,8,18,.62)";
    ctx.strokeStyle = hot ? "rgba(255,255,255,.75)" : "rgba(255,255,255,.2)";
    ctx.lineWidth = 1;
    ctx.fillRect(rx, ry, w, h);
    ctx.strokeRect(rx + 0.5, ry + 0.5, w - 1, h - 1);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = `bold ${fs}px ${FONT}`;
    ctx.fillStyle = "#fff";
    ctx.save();
    ctx.beginPath(); ctx.rect(rx + 2, ry, w - 4, h); ctx.clip();
    ctx.fillText(text, x, ry + 4, 180);
    ctx.restore();
    if (sub) {
      ctx.font = `${Math.round(fs * 0.78)}px ${FONT}`;
      ctx.fillStyle = "#b9b4c8";
      ctx.fillText(sub, x, ry + fs + 5);
    }
  }

  function frame(now) {
    const time = (now - t0) / 1000;
    const world = hooks.world();
    const night = hooks.night();
    const lights = hooks.lights();
    // 窓を避けた中央へ、なめらかに
    for (const side of ["left", "right"]) inset.cur[side] += (inset[side] - inset.cur[side]) * 0.2;
    const { k, proj } = layout();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, night ? "#0c0f1d" : "#2a2338");
    bg.addColorStop(1, night ? "#05060d" : "#15111c");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    drawFloor(proj, night);
    drawWalls(proj, night, k, time, lights);

    const list = placed();
    // ふたの開きを動かす
    for (const c of list) {
      const want = c.cid === openCid ? 1 : 0;
      const cur = open.get(c.cid) || 0;
      open.set(c.cid, cur + clamp(want - cur, -0.14, 0.14));
    }
    for (const id of [...open.keys()]) if (!world.chest(id)) open.delete(id);

    for (const c of list) if (!(drag && drag.active && drag.cid === c.cid)) shadow(proj, c.X, c.Y);

    for (const c of list) {
      if (drag && drag.active && drag.cid === c.cid) continue;
      const ch = world.chest(c.cid);
      if (!ch) continue;
      const p0 = pulses.get(c.cid);
      let dz = 0;
      if (p0 !== undefined) {
        const t = (now - p0) / 380;
        if (t >= 1) pulses.delete(c.cid); else dz = Math.sin(t * Math.PI) * 0.1;
      }
      const pj = dz ? (x, y, z) => proj(x, y, z + dz) : proj;
      drawChest(ctx, pj, c.X, c.Y, ch.kind, open.get(c.cid) || 0);
      if (c.cid === openCid) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const [gx, gy] = proj(c.X, c.Y, 0.6);
        const r = 62 * k;
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
        g.addColorStop(0, "rgba(255,214,120,.42)");
        g.addColorStop(1, "rgba(255,200,90,0)");
        ctx.fillStyle = g;
        ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
        ctx.restore();
      } else if (c.cid === hoverCid && !drag) glowBox(proj, c.X, c.Y, "rgba(255,255,255,.17)");
      const fl = flashes.get(c.cid);
      if (fl !== undefined) {
        const t = (now - fl) / 900;
        if (t >= 1) flashes.delete(c.cid);
        else glowBox(proj, c.X, c.Y, `rgba(255,236,150,${(0.5 * (1 - t) * (0.6 + 0.4 * Math.sin(t * 20))).toFixed(3)})`);
      }
    }

    // 夜は暗くする
    if (night) {
      ctx.fillStyle = "rgba(8,14,44,.34)";
      ctx.fillRect(0, 0, W, H);
    }

    // 置き場の合図
    if (dropHint && dropHint.cell && !dropHint.cid) cellDiamond(proj, dropHint.cell.x, dropHint.cell.y, "rgba(120,255,140,.95)", "rgba(120,255,140,.2)");
    if (drag && drag.active && pointer) {
      const cell = cellAtPoint(pointer.x, pointer.y);
      const over = chestAtPoint(pointer.x, pointer.y, drag.cid);
      if (over) { const c = list.find((p) => p.cid === over); if (c) glowBox(proj, c.X, c.Y, "rgba(120,255,140,.3)"); }
      else if (cell) cellDiamond(proj, cell.x, cell.y, "rgba(120,255,140,.95)", "rgba(120,255,140,.2)");
    }
    if (dropHint && dropHint.cid) { const c = list.find((p) => p.cid === dropHint.cid); if (c) glowBox(proj, c.X, c.Y, "rgba(120,255,140,.3)"); }

    // 持ち上げたチェスト
    if (drag && drag.active && pointer) {
      const a = (pointer.x - (layoutCache.cx)) / ((TW / 2) * k), b = (pointer.y - layoutCache.cy) / ((TH / 2) * k);
      const X = (a + b) / 2, Y = (b - a) / 2;
      const ch = world.chest(drag.cid);
      if (ch) {
        ctx.save();
        ctx.globalAlpha = 0.9;
        drawChest(ctx, (x, y, z) => proj(x, y, z + 0.35), X, Y, ch.kind, 0);
        ctx.restore();
      }
    }

    // 名札
    for (const c of list) {
      const ch = world.chest(c.cid);
      if (!ch || (drag && drag.active && drag.cid === c.cid)) continue;
      const st = world.stats(c.cid);
      label(proj, c.X, c.Y, ch.name, st.total ? `${st.total}個` : "", c.cid === openCid || c.cid === hoverCid, k);
    }
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (paused || now - last < 28) return;
    last = now;
    try { frame(now); } catch (e) { console.error("描画に失敗", e); }
  }

  // ── 操作 ──
  const local = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const p = local(e);
    layout();
    const cid = chestAtPoint(p.x, p.y);
    pointer = p;
    canvas.setPointerCapture(e.pointerId);
    if (cid) press = { cid, x: p.x, y: p.y, id: e.pointerId };
    else pan = { x: p.x, y: p.y, px: cam.panX, py: cam.panY, moved: false, id: e.pointerId };
  });

  canvas.addEventListener("pointermove", (e) => {
    const p = local(e);
    pointer = p;
    if (press) {
      if (!drag && Math.hypot(p.x - press.x, p.y - press.y) > 6) drag = { cid: press.cid, active: true };
      canvas.style.cursor = "grabbing";
      return;
    }
    if (pan) {
      const dx = p.x - pan.x, dy = p.y - pan.y;
      if (!pan.moved && Math.hypot(dx, dy) > 4) pan.moved = true;
      if (pan.moved) {
        cam.panX = clamp(pan.px + dx, -W * 0.4, W * 0.4);
        cam.panY = clamp(pan.py + dy, -H * 0.4, H * 0.4);
        canvas.style.cursor = "grabbing";
      }
      return;
    }
    layout();
    const cid = chestAtPoint(p.x, p.y);
    if (cid !== hoverCid) { hoverCid = cid; hooks.onHover(cid); }
    canvas.style.cursor = cid ? "pointer" : "default";
  });

  canvas.addEventListener("pointerup", (e) => {
    const p = local(e);
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* 取れていなければ何もしない */ }
    canvas.style.cursor = "default";
    layout();
    if (press) {
      const { cid } = press;
      const wasDrag = drag && drag.active;
      press = null; drag = null;
      if (!wasDrag) { hooks.onOpen(cid); return; }
      const over = chestAtPoint(p.x, p.y, cid);
      if (over) { hooks.onNest(cid, over); return; }
      const cell = cellAtPoint(p.x, p.y);
      if (cell) hooks.onMove(cid, cell.x, cell.y);
      return;
    }
    if (pan) {
      const moved = pan.moved;
      pan = null;
      if (!moved) hooks.onBackground();
      else hooks.onCamera();
    }
  });

  canvas.addEventListener("pointercancel", () => { press = null; drag = null; pan = null; canvas.style.cursor = "default"; });
  canvas.addEventListener("pointerleave", () => { if (!press && !pan && hoverCid) { hoverCid = null; hooks.onHover(null); } });

  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const p = local(e);
    layout();
    hooks.onContext(chestAtPoint(p.x, p.y), e);
  });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    cam.zoom = clamp(cam.zoom * Math.exp(-e.deltaY * 0.0014), 0.55, 2.2);
    hooks.onCamera();
  }, { passive: false });

  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => resize()) : null;
  if (ro) ro.observe(canvas);
  window.addEventListener("resize", resize);
  resize();
  raf = requestAnimationFrame(loop);

  return {
    kind: "iso",
    cam,
    resize,
    setPaused(v) { paused = !!v; if (!paused) resize(); },
    pointAt,
    chestScreen,
    cellScreen,
    cellAtPoint,
    layout: () => layout(),
    renderOnce: () => { resize(); frame(performance.now()); },
    setOpen(cid) { openCid = cid || null; },
    setDropHint(h) { dropHint = h; },
    setInset(left, right) { inset.left = left; inset.right = right; },
    snapInset() { inset.cur.left = inset.left; inset.cur.right = inset.right; },
    rotate(d) { cam.rot = (cam.rot + d + 4) & 3; hooks.onCamera(); },
    setRot(r) { cam.rot = r & 3; },
    setCamera(c) { if (c) { if (Number.isFinite(c.zoom)) cam.zoom = clamp(c.zoom, 0.55, 2.2); if (Number.isFinite(c.rot)) cam.rot = c.rot & 3; } },
    resetView() { cam.zoom = 1; cam.panX = 0; cam.panY = 0; hooks.onCamera(); },
    pulse(cid) { pulses.set(cid, performance.now()); },
    flash(cid) { flashes.set(cid, performance.now()); },
    get hover() { return hoverCid; },
    get dragging() { return !!(drag && drag.active); },
    destroy() { cancelAnimationFrame(raf); if (ro) ro.disconnect(); window.removeEventListener("resize", resize); },
  };
}
