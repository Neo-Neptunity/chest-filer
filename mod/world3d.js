// 歩いて入れるワールド。一人称の 3D（WebGL2）。マイクラのように、WASD で歩き、マウスで見回す。
// 広間にチェストが並ぶ。右クリックで開く。左クリックで持ち上げて、台座に置く・別のチェストに重ねる。
// 描くのと操作を受け取るだけで、ワールドのデータ（チェストの木）は hooks を通して頼む。

import { KIND_IDS } from "./consts.js";
import { CHEST, AIR } from "./blocks.js";
import { generate, SX, SY, SZ, FLOOR, index, cellBlock, cellOfBlock } from "./terrain.js";
import { computeLight } from "./light.js";
import { buildChunk, chestGeometry, CHUNK, CHUNKS_X, CHUNKS_Z, STRIDE } from "./mesher.js";
import { createPlayer, step, raycast, forward, eyeHeight, REACH } from "./physics.js";
import { paintAll } from "./blocktex.js";
import { chestIcon } from "./textures.js";
import * as G from "./gl.js";

const FONT = '"BIZ UDGothic","MS Gothic","Yu Gothic UI","Meiryo UI",sans-serif';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

const SKIES = {
  day: { zenith: [0.36, 0.58, 0.96], horizon: [0.74, 0.86, 1.0], sun: [0.35, 0.85, 0.4], moon: [-0.35, -0.85, -0.4], night: 0, sky: 1.0, cloud: 1 },
  sunset: { zenith: [0.2, 0.26, 0.52], horizon: [1.0, 0.56, 0.33], sun: [0.85, 0.15, 0.3], moon: [-0.8, -0.2, -0.3], night: 0.12, sky: 0.7, cloud: 1 },
  night: { zenith: [0.01, 0.02, 0.07], horizon: [0.045, 0.075, 0.17], sun: [0.3, -0.8, 0.3], moon: [-0.4, 0.75, -0.35], night: 1, sky: 0.16, cloud: 0.45 },
};
const FOG = [34, 86];

const CHEST_TOP = 0.875;
const chestBox = (x, y, z) => [x + 1 / 16, y, z + 1 / 16, x + 15 / 16, y + CHEST_TOP, z + 15 / 16];

/**
 * hooks = {
 *   world(), sky() → "day" | "sunset" | "night"、fov() → 度、lights()、quality() → "high" | "light"、
 *   onOpen(cid)、onMenu(cid)、onMove(cid, cx, cy)、onNest(cid, intoCid)、onPlace(cx, cy)、onBackground()、
 *   onHold(cid | null)、onLock(locked)、onStep()、say(text, kind)
 * }
 */
export function createWalk(canvas, hooks) {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "high-performance" });
  if (!gl) throw new Error("webgl2 unavailable");
  const host = canvas.parentElement;

  // ── プログラムと絵 ──
  const progMain = G.compile(gl, G.MAIN_VS, G.MAIN_FS);
  const progSky = G.compile(gl, G.SKY_VS, G.SKY_FS);
  const progLine = G.compile(gl, G.LINE_VS, G.LINE_FS);
  const loc = (p, names) => Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)]));
  const U = loc(progMain, ["uVP", "uModel", "uTex", "uSky", "uFogColor", "uFog", "uCam", "uSet", "uUseSet", "uAlpha", "uCut", "uTint"]);
  const S = loc(progSky, ["uRight", "uUp", "uFwd", "uTan", "uAspect", "uShift", "uZenith", "uHorizon", "uSun", "uMoon", "uCam", "uNight", "uTime", "uCloud"]);
  const LN = loc(progLine, ["uVP", "uModel", "uColor"]);

  const atlas = (() => {
    const layers = paintAll();
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 5, gl.RGBA8, 16, 16, layers.length);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    layers.forEach((c, i) => gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, 16, 16, 1, gl.RGBA, gl.UNSIGNED_BYTE, c));
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  })();

  const makeVao = (geo) => {
    const vao = gl.createVertexArray(), vbo = gl.createBuffer(), ibo = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, geo.verts, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.index, gl.STATIC_DRAW);
    const st = STRIDE * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, st, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, st, 20);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, st, 24);
    gl.bindVertexArray(null);
    return { vao, vbo, ibo, count: geo.count };
  };
  const freeVao = (m) => { if (!m) return; gl.deleteVertexArray(m.vao); gl.deleteBuffer(m.vbo); gl.deleteBuffer(m.ibo); };

  // 線と、うすい面（狙っているものの枠）
  const unit = (() => {
    const CN = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
    const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].flatMap(([p, q]) => [...CN[p], ...CN[q]]);
    const tri = [];
    const face = (a, b, c, d) => tri.push(...a, ...b, ...c, ...a, ...c, ...d);
    face([0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]); face([0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1]);
    face([0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]); face([1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]);
    face([0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]); face([0, 0, 0], [0, 0, 1], [1, 0, 1], [1, 0, 0]);
    const mk = (data) => {
      const vao = gl.createVertexArray(), vbo = gl.createBuffer();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      return { vao, n: data.length / 3 };
    };
    return { edges: mk(edges), faces: mk(tri) };
  })();

  // ── ワールド ──
  const terrain = generate(7);
  const blocks = terrain.blocks;
  const light = computeLight(blocks);
  const wdata = { blocks, sky: light.sky, blk: light.blk, torches: terrain.torches };
  const chunks = [];
  const queue = [];
  for (let cz = 0; cz < CHUNKS_Z; cz++) for (let cx = 0; cx < CHUNKS_X; cx++) {
    chunks.push({ cx, cz, main: null, blend: null, built: false, minY: 0, maxY: SY });
    queue.push(chunks[chunks.length - 1]);
  }
  const sp = terrain.spawn;
  queue.sort((a, b) => Math.hypot(a.cx * 16 + 8 - sp.x, a.cz * 16 + 8 - sp.z) - Math.hypot(b.cx * 16 + 8 - sp.x, b.cz * 16 + 8 - sp.z));

  const chestVaos = new Map();
  const chestModel = (kind) => {
    if (!chestVaos.has(kind)) { const g = chestGeometry(KIND_IDS.includes(kind) ? kind : "oak"); chestVaos.set(kind, { body: makeVao(g.body), lid: makeVao(g.lid) }); }
    return chestVaos.get(kind);
  };

  // ── 状態 ──
  const player = createPlayer(sp);
  const keys = new Set();
  let active = true, control = true, locked = false, lockFailed = false, typingNow = () => false;
  let W = 1, H = 1, dpr = 1;
  const inset = { left: 0, right: 0, cur: 0 };
  let openCid = null, hoverCid = null, dropHint = null, held = null;
  const open = new Map(), pulses = new Map(), flashes = new Map();
  let roomRef = null, chestAt = new Map(), chestPos = new Map();
  let aim = null, hintKey = "";
  let last = performance.now(), raf = 0, t0 = performance.now();
  let lookDx = 0, lookDy = 0;
  let lastW = 0, wSprint = false, lastSpace = 0;
  let stepAcc = 0;
  const skyCur = JSON.parse(JSON.stringify(SKIES.day));
  const mats = { proj: new Float32Array(16), view: new Float32Array(16), vp: new Float32Array(16), model: new Float32Array(16), model2: new Float32Array(16), ident: G.identity() };
  let planes = [];
  let basis = { right: [1, 0, 0], up: [0, 1, 0], fwd: [0, 0, -1] };
  const eyePos = [sp.x, sp.y + 1.62, sp.z];

  // ── 画面の部品（十字・ヒント・持ち上げ・ポーズ・名札） ──
  const hud = document.createElement("div");
  hud.className = "w3d-hud";
  hud.innerHTML = `
    <div class="w3d-cross"></div>
    <div class="w3d-hint"><div class="l1"></div><div class="l2"></div></div>
    <div class="w3d-held" hidden><img alt=""><div><b></b><span>右クリックで置く　左クリックか Q で戻す</span></div></div>
    <div class="w3d-pause" hidden><div class="box">
      <h2>チェスト・ファイラー</h2>
      <p class="go">クリックして、ワールドに入る</p>
      <ul>
        <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 歩く　<kbd>Space</kbd> ジャンプ　<kbd>Shift</kbd> しゃがむ　<kbd>Ctrl</kbd> 走る</li>
        <li>右クリック 開く・置く　左クリック 持ち上げる　<kbd>F</kbd> メニュー</li>
        <li><kbd>E</kbd> 持ち物　<kbd>1</kbd>から<kbd>9</kbd> ホットバー　<kbd>/</kbd> さがす　<kbd>V</kbd> 俯瞰</li>
        <li>Space を2回で、飛べます。<kbd>Esc</kbd> でポインターを戻します</li>
      </ul>
    </div></div>`;
  const labelCanvas = document.createElement("canvas");
  labelCanvas.className = "w3d-labels";
  host.append(labelCanvas, hud);
  const lctx = labelCanvas.getContext("2d");
  const el = { l1: hud.querySelector(".l1"), l2: hud.querySelector(".l2"), held: hud.querySelector(".w3d-held"), pause: hud.querySelector(".w3d-pause"), cross: hud.querySelector(".w3d-cross") };

  function resize() {
    const r = canvas.getBoundingClientRect();
    const cap = hooks.quality && hooks.quality() === "light" ? 1 : 1.75;
    dpr = Math.min(cap, window.devicePixelRatio || 1);
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    labelCanvas.width = Math.round(W * dpr); labelCanvas.height = Math.round(H * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  // ── チェストを、ブロックの印として置く（ぶつかる・狙える） ──
  function syncChests(force = false) {
    const w = hooks.world();
    if (!force && w.room === roomRef) return;
    roomRef = w.room;
    for (const i of chestAt.keys()) blocks[i] = AIR;
    chestAt = new Map(); chestPos = new Map();
    for (const r of w.room) {
      if (held && held.cid === r.cid) continue;
      const b = cellBlock(r.x, r.y);
      const i = index(b.x, b.y + 1, b.z);
      blocks[i] = CHEST;
      chestAt.set(i, r.cid);
      chestPos.set(r.cid, { x: b.x, y: b.y + 1, z: b.z, cx: r.x, cy: r.y });
    }
  }
  const cellFree = (cx, cy) => { const b = cellBlock(cx, cy); return !chestAt.has(index(b.x, b.y + 1, b.z)) && !hooks.world().room.some((r) => r.x === cx && r.y === cy && !(held && held.cid === r.cid)); };

  // ── 見ている先 ──
  function eye() {
    eyePos[0] = player.x; eyePos[1] = player.y + eyeHeight(player); eyePos[2] = player.z;
    return eyePos;
  }

  function classify(hit) {
    if (!hit) return null;
    if (hit.kind === "chest") {
      const cid = chestAt.get(index(hit.x, hit.y, hit.z));
      return cid ? { type: "chest", cid, hit } : null;
    }
    if (hit.ny === 1 && hit.y === FLOOR) {
      const c = cellOfBlock(hit.x, hit.z);
      if (c && c.exact) return { type: "pad", cx: c.cx, cy: c.cy, free: cellFree(c.cx, c.cy), hit };
    }
    return { type: "block", hit };
  }

  function rayFromScreen(px, py) {
    const ndcx = (px / W) * 2 - 1 + inset.cur, ndcy = 1 - (py / H) * 2;
    const t = Math.tan(fovRad() / 2), asp = W / H;
    const f = basis.fwd, r = basis.right, u = basis.up;
    return [f[0] + ndcx * t * asp * r[0] + ndcy * t * u[0], f[1] + ndcx * t * asp * r[1] + ndcy * t * u[1], f[2] + ndcx * t * asp * r[2] + ndcy * t * u[2]];
  }

  function pickAt(px, py) {
    setMatrices();
    const e = eye();
    const d = rayFromScreen(px, py);
    return classify(raycast(blocks, e[0], e[1], e[2], d[0], d[1], d[2], 40, chestBox));
  }

  const fovRad = () => ((hooks.fov ? hooks.fov() : 75) * Math.PI) / 180;

  // ── 動き・更新 ──
  function update(dt, { mesh = true } = {}) {
    syncChests();
    if (held && !hooks.world().chest(held.cid)) cancelHold(false);
    if (mesh) buildSome(6);
    // 見る向き
    if (control) {
      player.yaw -= lookDx * 0.0023;
      player.pitch = clamp(player.pitch - lookDy * 0.0023, -1.55, 1.55);
      const turn = (keys.has("ArrowLeft") ? 1 : 0) - (keys.has("ArrowRight") ? 1 : 0);
      const tilt = (keys.has("ArrowUp") ? 1 : 0) - (keys.has("ArrowDown") ? 1 : 0);
      player.yaw += turn * 1.9 * dt;
      player.pitch = clamp(player.pitch + tilt * 1.5 * dt, -1.55, 1.55);
    }
    lookDx = lookDy = 0;
    const can = control && !typingNow();
    const k = (c) => can && keys.has(c);
    const inp = {
      fwd: (k("KeyW") ? 1 : 0) - (k("KeyS") ? 1 : 0), right: (k("KeyD") ? 1 : 0) - (k("KeyA") ? 1 : 0),
      jump: k("Space"), sneak: k("ShiftLeft") || k("ShiftRight"),
      sprint: (k("ControlLeft") && locked) || wSprint, up: (k("Space") ? 1 : 0) - (k("ShiftLeft") || k("ShiftRight") ? 1 : 0),
    };
    if (inp.fwd <= 0) wSprint = false;
    step(blocks, player, inp, dt);
    stepAcc += player.walked; player.walked = 0;
    if (stepAcc > 2.1) { stepAcc = 0; if (hooks.onStep) hooks.onStep(); }
    // ふたと、はねる動き
    for (const [cid] of chestPos) {
      const want = cid === openCid ? 1 : 0;
      const cur = open.get(cid) || 0;
      open.set(cid, cur + clamp(want - cur, -dt * 4.5, dt * 4.5));
    }
    for (const id of [...open.keys()]) if (!chestPos.has(id) && id !== (held && held.cid)) open.delete(id);
    // 光の強さ・空の移りかわり
    const target = SKIES[hooks.sky ? hooks.sky() : "day"] || SKIES.day;
    const a = Math.min(1, dt * 2.2);
    for (const key of ["zenith", "horizon", "sun", "moon"]) for (let i = 0; i < 3; i++) skyCur[key][i] = lerp(skyCur[key][i], target[key][i], a);
    for (const key of ["night", "sky", "cloud"]) skyCur[key] = lerp(skyCur[key], target[key], a);
    inset.cur = lerp(inset.cur, (inset.right - inset.left) / Math.max(1, W), Math.min(1, dt * 9));
    // 狙い
    if (control && !typingNow()) {
      const e = eye(), f = forward(player);
      aim = classify(raycast(blocks, e[0], e[1], e[2], f[0], f[1], f[2], REACH, chestBox));
    } else aim = null;
    updateHint();
  }

  // 区画を、少しずつ作る
  function buildSome(ms) {
    const t = performance.now();
    while (queue.length && performance.now() - t < ms) {
      const c = queue.shift();
      const r = buildChunk(wdata, c.cx, c.cz);
      c.minY = r.minY; c.maxY = r.maxY;
      c.main = r.main.count ? makeVao(r.main) : null;
      c.blend = r.blend.count ? makeVao(r.blend) : null;
      c.built = true;
    }
  }

  // ── 描く ──
  function setMatrices() {
    const f = forward(player);
    const e = eye();
    const b = G.viewMatrix(mats.view, e[0], e[1], e[2], f[0], f[1], f[2]);
    basis = { right: b.right, up: b.up, fwd: f };
    G.perspective(mats.proj, fovRad(), W / H, 0.05, 220, inset.cur);
    G.mul(mats.vp, mats.proj, mats.view);
    planes = G.frustum(mats.vp);
  }

  function draw(now) {
    const time = (now - t0) / 1000;
    setMatrices();
    const e = eyePos;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(skyCur.horizon[0], skyCur.horizon[1], skyCur.horizon[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.BLEND);

    // 空
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.useProgram(progSky);
    gl.uniform3fv(S.uRight, basis.right); gl.uniform3fv(S.uUp, basis.up); gl.uniform3fv(S.uFwd, basis.fwd);
    gl.uniform1f(S.uTan, Math.tan(fovRad() / 2)); gl.uniform1f(S.uAspect, W / H); gl.uniform1f(S.uShift, inset.cur);
    gl.uniform3fv(S.uZenith, skyCur.zenith); gl.uniform3fv(S.uHorizon, skyCur.horizon);
    gl.uniform3fv(S.uSun, skyCur.sun); gl.uniform3fv(S.uMoon, skyCur.moon);
    gl.uniform3f(S.uCam, e[0], e[1], e[2]); gl.uniform1f(S.uNight, skyCur.night); gl.uniform1f(S.uTime, time); gl.uniform1f(S.uCloud, skyCur.cloud);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 地形
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    gl.useProgram(progMain);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, atlas);
    gl.uniform1i(U.uTex, 0);
    gl.uniformMatrix4fv(U.uVP, false, mats.vp);
    gl.uniformMatrix4fv(U.uModel, false, mats.ident);
    gl.uniform1f(U.uSky, skyCur.sky);
    gl.uniform3fv(U.uFogColor, skyCur.horizon);
    gl.uniform2f(U.uFog, FOG[0], FOG[1]);
    gl.uniform3f(U.uCam, e[0], e[1], e[2]);
    gl.uniform1f(U.uUseSet, 0); gl.uniform1f(U.uAlpha, 1); gl.uniform1f(U.uCut, 1); gl.uniform4f(U.uTint, 0, 0, 0, 0);
    const vis = [];
    for (const c of chunks) {
      if (!c.built || (!c.main && !c.blend)) continue;
      const X = c.cx * CHUNK, Z = c.cz * CHUNK;
      if (Math.hypot(X + 8 - e[0], Z + 8 - e[2]) > FOG[1] + 14) continue;
      if (!G.boxVisible(planes, X, c.minY, Z, X + CHUNK, c.maxY + 1, Z + CHUNK)) continue;
      vis.push(c);
      if (c.main) { gl.bindVertexArray(c.main.vao); gl.drawElements(gl.TRIANGLES, c.main.count, gl.UNSIGNED_INT, 0); }
    }

    // チェスト
    drawChests(e);

    // ガラス（半透明）
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.uniform1f(U.uCut, 0);
    gl.uniformMatrix4fv(U.uModel, false, mats.ident);
    gl.uniform1f(U.uUseSet, 0); gl.uniform1f(U.uAlpha, 1); gl.uniform4f(U.uTint, 0, 0, 0, 0);
    for (const c of vis) if (c.blend) { gl.bindVertexArray(c.blend.vao); gl.drawElements(gl.TRIANGLES, c.blend.count, gl.UNSIGNED_INT, 0); }
    gl.depthMask(true);

    drawGhost(e);
    drawOutlines(now);
    gl.bindVertexArray(null);
    drawLabels(time);
  }

  function lightAt(x, y, z) {
    const i = index(clamp(x, 0, SX - 1), clamp(y, 0, SY - 1), clamp(z, 0, SZ - 1));
    return [light.sky[i] / 15, light.blk[i] / 15];
  }

  function chestMatrices(pos, o, dy) {
    // 体：その升の位置へ。ふた：後ろのふちを軸に開く（前は南）
    G.translation(mats.model, pos.x, pos.y + dy, pos.z);
    const ang = -(o * o * (3 - 2 * o)) * (78 * Math.PI) / 180;
    G.pivotRotX(mats.model2, 0.5, 1 / 16, ang, pos.x, pos.y + dy, pos.z);
  }

  function drawChests(e) {
    const w = hooks.world();
    const now = performance.now();
    gl.uniform1f(U.uUseSet, 1);
    for (const r of w.room) {
      const pos = chestPos.get(r.cid);
      if (!pos) continue;
      const d = Math.hypot(pos.x + 0.5 - e[0], pos.z + 0.5 - e[2]);
      if (d > FOG[1]) continue;
      if (!G.boxVisible(planes, pos.x, pos.y, pos.z, pos.x + 1, pos.y + 1, pos.z + 1)) continue;
      const ch = w.chest(r.cid);
      if (!ch) continue;
      let dy = 0;
      const p0 = pulses.get(r.cid);
      if (p0 !== undefined) { const t = (now - p0) / 380; if (t >= 1) pulses.delete(r.cid); else dy = Math.sin(t * Math.PI) * 0.16; }
      const m = chestModel(ch.kind);
      const [ls, lb] = lightAt(pos.x, pos.y, pos.z);
      gl.uniform2f(U.uSet, ls, lb);
      chestMatrices(pos, open.get(r.cid) || 0, dy);
      gl.uniformMatrix4fv(U.uModel, false, mats.model);
      gl.bindVertexArray(m.body.vao); gl.drawElements(gl.TRIANGLES, m.body.count, gl.UNSIGNED_INT, 0);
      gl.uniformMatrix4fv(U.uModel, false, mats.model2);
      gl.bindVertexArray(m.lid.vao); gl.drawElements(gl.TRIANGLES, m.lid.count, gl.UNSIGNED_INT, 0);
    }
    gl.uniform1f(U.uUseSet, 0);
  }

  // 持ち上げたチェストの、置く先の影
  function drawGhost() {
    if (!held || !aim || aim.type !== "pad" || !aim.free) return;
    const ch = hooks.world().chest(held.cid);
    if (!ch) return;
    const b = cellBlock(aim.cx, aim.cy);
    const pos = { x: b.x, y: b.y + 1, z: b.z };
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1f(U.uAlpha, 0.62); gl.uniform4f(U.uTint, 0.3, 1.0, 0.4, 0.28); gl.uniform1f(U.uUseSet, 1);
    const [ls, lb] = lightAt(pos.x, pos.y, pos.z);
    gl.uniform2f(U.uSet, Math.max(ls, 0.6), lb);
    const m = chestModel(ch.kind);
    chestMatrices(pos, 0, 0);
    gl.uniformMatrix4fv(U.uModel, false, mats.model);
    gl.bindVertexArray(m.body.vao); gl.drawElements(gl.TRIANGLES, m.body.count, gl.UNSIGNED_INT, 0);
    gl.uniformMatrix4fv(U.uModel, false, mats.model2);
    gl.bindVertexArray(m.lid.vao); gl.drawElements(gl.TRIANGLES, m.lid.count, gl.UNSIGNED_INT, 0);
    gl.uniform1f(U.uAlpha, 1); gl.uniform4f(U.uTint, 0, 0, 0, 0); gl.uniform1f(U.uUseSet, 0);
  }

  function box(x0, y0, z0, x1, y1, z1, rgba, lines = true) {
    mats.model.set([x1 - x0, 0, 0, 0, 0, y1 - y0, 0, 0, 0, 0, z1 - z0, 0, x0, y0, z0, 1]);
    gl.uniformMatrix4fv(LN.uModel, false, mats.model);
    if (rgba[3] > 0) { gl.uniform4fv(LN.uColor, rgba); gl.bindVertexArray(unit.faces.vao); gl.drawArrays(gl.TRIANGLES, 0, unit.faces.n); }
    if (lines) { gl.uniform4f(LN.uColor, 0, 0, 0, 0.85); gl.bindVertexArray(unit.edges.vao); gl.drawArrays(gl.LINES, 0, unit.edges.n); }
  }

  function drawOutlines(now) {
    const items = [];
    const pulse = 0.55 + 0.45 * Math.sin(now / 160);
    if (aim && control) {
      if (aim.type === "chest") {
        const p = chestPos.get(aim.cid);
        if (p) items.push([p.x - 0.005, p.y - 0.005, p.z - 0.005, p.x + 1.005, p.y + CHEST_TOP + 0.005, p.z + 1.005, held && held.cid !== aim.cid ? [0.4, 1, 0.5, 0.2] : [1, 1, 1, 0.12], true, 0.0625]);
      } else if (aim.type === "pad") {
        const b = cellBlock(aim.cx, aim.cy);
        items.push([b.x, b.y + 1.0, b.z, b.x + 1, b.y + 1.02, b.z + 1, aim.free ? [0.45, 1, 0.55, 0.28 * pulse + 0.1] : [1, 0.4, 0.4, 0.2], true, 0]);
      }
    }
    if (dropHint) {
      if (dropHint.cid && chestPos.get(dropHint.cid)) { const p = chestPos.get(dropHint.cid); items.push([p.x, p.y, p.z, p.x + 1, p.y + CHEST_TOP, p.z + 1, [0.4, 1, 0.5, 0.3], true, 0]); }
      else if (dropHint.cell) { const b = cellBlock(dropHint.cell.x, dropHint.cell.y); items.push([b.x, b.y + 1.0, b.z, b.x + 1, b.y + 1.03, b.z + 1, [0.45, 1, 0.55, 0.4], true, 0]); }
    }
    if (!items.length) return;
    gl.useProgram(progLine);
    gl.uniformMatrix4fv(LN.uVP, false, mats.vp);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    for (const [x0, y0, z0, x1, y1, z1, rgba, lines, inset0] of items) {
      const i = inset0 || 0;
      box(x0 + i, y0, z0 + i, x1 - i, y1, z1 - i, rgba, lines);
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
  }

  // 名札：チェストの上。近いものだけ。壁のむこうは出さない
  function drawLabels() {
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.clearRect(0, 0, W, H);
    const w = hooks.world();
    const e = eyePos;
    for (const r of w.room) {
      const pos = chestPos.get(r.cid);
      if (!pos) continue;
      const cx = pos.x + 0.5, cy = pos.y + CHEST_TOP + 0.45, cz = pos.z + 0.5;
      const dx = cx - e[0], dy = cy - e[1], dz = cz - e[2];
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 22) continue;
      const p = G.projectPoint(mats.vp, cx, cy, cz, W, H);
      if (p.w <= 0.1 || p.x < -80 || p.x > W + 80 || p.y < -40 || p.y > H + 40) continue;
      const hot = r.cid === openCid || (aim && aim.type === "chest" && aim.cid === r.cid) || (dropHint && dropHint.cid === r.cid);
      if (!hot) {
        const hit = raycast(blocks, e[0], e[1], e[2], dx, dy, dz, dist - 0.4, null);
        if (hit) continue;
      }
      const ch = w.chest(r.cid);
      if (!ch) continue;
      const st = w.stats(r.cid);
      const alpha = hot ? 1 : clamp((22 - dist) / 8, 0, 1);
      const fs = Math.round(clamp(17 - dist * 0.35, 11, 16));
      lctx.globalAlpha = alpha;
      lctx.font = `bold ${fs}px ${FONT}`;
      const tw = Math.min(lctx.measureText(ch.name).width, 200);
      const sub = st.total ? `${st.total}個` : "";
      const bw = tw + 16, bh = sub ? fs * 2 + 7 : fs + 9;
      const rx = p.x - bw / 2, ry = p.y - bh;
      lctx.fillStyle = hot ? "rgba(24,16,48,.86)" : "rgba(10,8,18,.62)";
      lctx.fillRect(rx, ry, bw, bh);
      lctx.strokeStyle = hot ? "rgba(255,255,255,.8)" : "rgba(255,255,255,.18)";
      lctx.strokeRect(rx + 0.5, ry + 0.5, bw - 1, bh - 1);
      lctx.textAlign = "center"; lctx.textBaseline = "top"; lctx.fillStyle = "#fff";
      lctx.fillText(ch.name, p.x, ry + 5, 200);
      if (sub) { lctx.font = `${Math.round(fs * 0.78)}px ${FONT}`; lctx.fillStyle = "#b9b4c8"; lctx.fillText(sub, p.x, ry + fs + 6); }
    }
    lctx.globalAlpha = 1;
  }

  // ── 画面の文字（ヒント・持ち上げ・ポーズ） ──
  function updateHint() {
    let l1 = "", l2 = "";
    if (control && aim) {
      const w = hooks.world();
      if (aim.type === "chest") {
        const ch = w.chest(aim.cid);
        const st = w.stats(aim.cid);
        if (held && held.cid !== aim.cid) { l1 = `「${ch.name}」の中へ入れる`; l2 = "右クリック"; }
        else if (held) { l1 = `「${ch.name}」`; l2 = "右クリックか左クリックで、元に戻す"; }
        else { l1 = `${ch.name}　${st.total ? `${st.total}個` : "空"}`; l2 = "右クリック 開く　左クリック 持ち上げる　F メニュー"; }
      } else if (aim.type === "pad") {
        if (!aim.free) l1 = "ここには、もうチェストがあります";
        else if (held) { l1 = "ここに置く"; l2 = "右クリック"; }
        else { l1 = "ここにチェストを置く"; l2 = "右クリック"; }
      }
    }
    const key = `${l1}|${l2}`;
    if (key === hintKey) return;
    hintKey = key;
    el.l1.textContent = l1; el.l2.textContent = l2;
  }

  function showHeld() {
    const ch = held ? hooks.world().chest(held.cid) : null;
    el.held.hidden = !ch;
    if (ch) { el.held.querySelector("img").src = chestIcon(ch.kind, false); el.held.querySelector("b").textContent = ch.name; }
  }

  function syncOverlay() {
    const showPause = active && control && !locked && !lockFailed;
    el.pause.hidden = !showPause;
    el.cross.style.display = active && control && (locked || lockFailed) ? "block" : "none";
    hud.classList.toggle("off", !active);
  }

  // ── 持ち上げて、置く ──
  function pickUp() {
    if (held || !aim || aim.type !== "chest") return;
    held = { cid: aim.cid };
    syncChests(true);
    showHeld();
    if (hooks.onHold) hooks.onHold(held.cid);
  }
  function cancelHold(notify = true) {
    if (!held) return;
    held = null;
    syncChests(true);
    showHeld();
    if (notify && hooks.onHold) hooks.onHold(null);
  }
  function use() {
    if (!aim) return;
    if (held) {
      const cid = held.cid;
      if (aim.type === "chest") {
        if (aim.cid === cid) { cancelHold(); return; }
        held = null; syncChests(true); showHeld();
        if (hooks.onHold) hooks.onHold(null);
        hooks.onNest(cid, aim.cid);
      } else if (aim.type === "pad" && aim.free) {
        held = null; syncChests(true); showHeld();
        if (hooks.onHold) hooks.onHold(null);
        hooks.onMove(cid, aim.cx, aim.cy);
      }
      return;
    }
    if (aim.type === "chest") hooks.onOpen(aim.cid);
    else if (aim.type === "pad" && aim.free) hooks.onPlace(aim.cx, aim.cy);
  }
  function menu() { if (aim && aim.type === "chest" && hooks.onMenu) hooks.onMenu(aim.cid); }

  // ── ポインターの固定 ──
  async function lockPointer() {
    if (document.pointerLockElement === document.body) return;
    const ask = (o) => { try { return Promise.resolve(document.body.requestPointerLock(o)); } catch (err) { return Promise.reject(err); } };
    try { await ask({ unadjustedMovement: true }); }
    catch {
      try { await ask(); } catch { lockFailed = true; syncOverlay(); if (hooks.say) hooks.say("ポインターを固定できません。矢印キーで見回せます", "warn"); }
    }
  }
  function releasePointer() {
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* 固定していない */ }
  }
  const onLockChange = () => {
    locked = document.pointerLockElement === document.body;
    if (locked) lockFailed = false;
    keys.clear(); wSprint = false;
    syncOverlay();
    if (hooks.onLock) hooks.onLock(locked);
  };
  document.addEventListener("pointerlockchange", onLockChange);
  document.addEventListener("pointerlockerror", () => { lockFailed = true; syncOverlay(); });

  // ── 入力 ──
  const GAME_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft", "ShiftRight", "ControlLeft", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);
  window.addEventListener("keydown", (e) => {
    if (!active || !control || typingNow() || e.altKey || e.metaKey) return;
    if (!GAME_KEYS.has(e.code)) return;
    if (e.ctrlKey && e.code !== "ControlLeft" && !locked) return;   // 固定していないときの Ctrl+W などは、本体のもの
    if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
    if (!e.repeat) {
      const now = performance.now();
      if (e.code === "KeyW") { if (now - lastW < 300) wSprint = true; lastW = now; }
      if (e.code === "Space") { if (now - lastSpace < 300) { player.flying = !player.flying; player.vy = 0; } lastSpace = now; }
    }
    keys.add(e.code);
  });
  window.addEventListener("keyup", (e) => { keys.delete(e.code); if (e.code === "KeyW") wSprint = false; });
  window.addEventListener("blur", () => { keys.clear(); wSprint = false; });

  window.addEventListener("mousemove", (e) => {
    if (!active || !control || !locked) return;
    lookDx += e.movementX || 0;
    lookDy += e.movementY || 0;
  }, { passive: true });

  window.addEventListener("mousedown", (e) => {
    if (!active) return;
    if (control) {
      // ポーズの画面か、ワールドの上でだけ。上の帯・ホットバーなどのボタンは、そのまま
      if (e.target.closest && e.target.closest(".topbar, .hotbar, .gui, .help")) return;
      if (!locked && !lockFailed) { e.preventDefault(); window.focus(); lockPointer(); return; }
      if (e.button === 0) { e.preventDefault(); if (held) cancelHold(); else pickUp(); }
      else if (e.button === 2) { e.preventDefault(); use(); }
      else if (e.button === 1) { e.preventDefault(); menu(); }
    } else if (e.target === canvas || e.target === labelCanvas || (e.target.closest && e.target.closest(".w3d-hud") && !e.target.closest(".w3d-pause"))) {
      // チェストの画面を開いているとき：見えているチェストをクリックすると、そのチェストへ。ほかなら閉じる
      if (e.button !== 0) return;
      const r = canvas.getBoundingClientRect();
      const p = pickAt(e.clientX - r.left, e.clientY - r.top);
      if (p && p.type === "chest") hooks.onOpen(p.cid);
      else hooks.onBackground();
    }
  });
  window.addEventListener("contextmenu", (e) => { if (active && (control || e.target === canvas)) e.preventDefault(); });

  // ── 公開する操作 ──
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!active) { last = now; return; }
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    try { update(dt); draw(now); } catch (err) { console.error("描画に失敗", err); }
  }

  const resizeObs = typeof ResizeObserver === "function" ? new ResizeObserver(() => resize()) : null;
  if (resizeObs) resizeObs.observe(canvas);
  window.addEventListener("resize", resize);
  resize();
  buildSome(40);
  syncChests();
  syncOverlay();
  raf = requestAnimationFrame(frame);

  /** チェストの手前に立って、そのほうを見る */
  function faceChest(cid) {
    const pos = chestPos.get(cid) || (() => { syncChests(true); return chestPos.get(cid); })();
    if (!pos) return;
    // 台座の南東の通路に立つ
    const sx = pos.x + 1.5, sz = pos.z + 1.5;
    player.x = sx; player.z = sz; player.y = FLOOR + 1; player.vx = player.vy = player.vz = 0;
    const dx = pos.x + 0.5 - sx, dz = pos.z + 0.5 - sz;
    player.yaw = Math.atan2(-dx, -dz);
    const dist = Math.hypot(dx, dz);
    player.pitch = Math.atan2(pos.y + 0.4 - (player.y + 1.62), dist);
  }

  return {
    kind: "walk",
    cam: { rot: 0, zoom: 1 },
    resize,
    /** チェストの画面を開いている間は、動かない。閉じたら、ポインターをまた固定する */
    setControl(on) {
      if (on === control) return;
      control = on;
      keys.clear(); wSprint = false; lookDx = lookDy = 0;
      if (!on) { cancelHold(); releasePointer(); }
      syncOverlay();
      if (on) lockPointer();
    },
    capture: lockPointer,
    release: releasePointer,
    get control() { return control; },
    get locked() { return locked; },
    setActive(on) {
      active = on;
      if (!on) { releasePointer(); keys.clear(); }
      canvas.hidden = !on; labelCanvas.hidden = !on; hud.hidden = !on;
      syncOverlay();
      if (on) { last = performance.now(); resize(); }
    },
    setTyping(fn) { typingNow = fn; },
    setOpen(cid) { openCid = cid || null; },
    setDropHint(h) { dropHint = h; },
    setInset(l, r) { inset.left = l; inset.right = r; },
    snapInset() { inset.cur = (inset.right - inset.left) / Math.max(1, W); },
    pulse(cid) { pulses.set(cid, performance.now()); },
    flash(cid) { flashes.set(cid, performance.now()); },
    rotate(d) { player.yaw -= d * Math.PI / 2; },
    setRot() {},
    setCamera() {},
    resetView() { player.x = sp.x; player.y = sp.y; player.z = sp.z; player.vx = player.vy = player.vz = 0; player.yaw = 0; player.pitch = 0; player.flying = false; },
    /** 足もとにいちばん近い、空いた台座の升 */
    nearestFree() {
      syncChests();
      let best = null, bd = Infinity;
      for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 8; cx++) {
        if (!cellFree(cx, cy)) continue;
        const b = cellBlock(cx, cy);
        const d = Math.hypot(b.x + 0.5 - player.x, b.z + 0.5 - player.z);
        if (d < bd) { bd = d; best = { x: cx, y: cy }; }
      }
      return best;
    },
    faceChest,
    cancelHold,
    pickUp, use, menu,
    /** 画面の点が指すもの：チェストか、台座の升か */
    pointAt(px, py) {
      const r = canvas.getBoundingClientRect();
      const x = px - r.left, y = py - r.top;
      const inside = x >= 0 && y >= 0 && x <= r.width && y <= r.height;
      const p = inside ? pickAt(x, y) : null;
      let cell = null;
      if (p && p.type === "pad") cell = { x: p.cx, y: p.cy };
      else if (p && p.type === "block" && p.hit.ny === 1 && p.hit.y === FLOOR) { const c = cellOfBlock(p.hit.x, p.hit.z); if (c) cell = { x: c.cx, y: c.cy }; }
      return { cid: p && p.type === "chest" ? p.cid : null, cell, inside };
    },
    /** 試験用：チェストの中ほどの、画面の位置（canvas の左上から） */
    chestScreen(cid) {
      setMatrices();
      const pos = chestPos.get(cid);
      if (!pos) return null;
      const p = G.projectPoint(mats.vp, pos.x + 0.5, pos.y + 0.45, pos.z + 0.5, W, H);
      return p.w > 0 ? { x: p.x, y: p.y } : null;
    },
    cellScreen(cx, cy) {
      setMatrices();
      const b = cellBlock(cx, cy);
      const p = G.projectPoint(mats.vp, b.x + 0.5, b.y + 1, b.z + 0.5, W, H);
      return p.w > 0 ? { x: p.x, y: p.y } : null;
    },
    /** 試験用：秒数ぶん、1/60 秒ずつ進める（描かない） */
    advance(sec) { for (let i = 0; i < Math.round(sec * 60); i++) update(1 / 60, { mesh: i === 0 }); },
    look(dx, dy) { player.yaw -= dx * 0.0023; player.pitch = clamp(player.pitch - dy * 0.0023, -1.55, 1.55); },
    renderOnce() { resize(); buildSome(1000); update(1 / 60, { mesh: false }); draw(performance.now()); },
    buildAll() { buildSome(100000); },
    get chunksLeft() { return queue.length; },
    get hover() { return hoverCid; },
    get dragging() { return !!held; },
    get held() { return held ? held.cid : null; },
    get aim() { return aim; },
    get player() { return player; },
    get blocks() { return blocks; },
    get terrain() { return terrain; },
    get lockFailed() { return lockFailed; },
    state() { return { shift: inset.cur, x: player.x, y: player.y, z: player.z, yaw: player.yaw, pitch: player.pitch, flying: player.flying, onGround: player.onGround, locked, control, held: held ? held.cid : null, aim: aim ? { type: aim.type, cid: aim.cid, cx: aim.cx, cy: aim.cy, free: aim.free } : null }; },
    destroy() { cancelAnimationFrame(raf); if (resizeObs) resizeObs.disconnect(); window.removeEventListener("resize", resize); document.removeEventListener("pointerlockchange", onLockChange); hud.remove(); labelCanvas.remove(); for (const c of chunks) { freeVao(c.main); freeVao(c.blend); } },
  };
}

