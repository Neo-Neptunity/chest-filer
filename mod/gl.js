// WebGL2 の道具：シェーダー・行列・見える範囲の判定。

export const MAIN_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
layout(location=2) in float aLayer;
layout(location=3) in vec4 aLight;
uniform mat4 uVP;
uniform mat4 uModel;
out vec3 vUv;
out vec4 vLight;
out vec3 vWorld;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz;
  vUv = vec3(aUv, aLayer);
  vLight = aLight;
  gl_Position = uVP * w;
}`;

// 光の強さ：空の光 × 空の明るさ と、たいまつの光の、強いほう。マイクラと同じく、弱いところはぐっと暗い
export const MAIN_FS = `#version 300 es
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray uTex;
uniform float uSky;
uniform vec3 uFogColor;
uniform vec2 uFog;
uniform vec3 uCam;
uniform vec2 uSet;
uniform float uUseSet;
uniform float uAlpha;
uniform float uCut;
uniform vec4 uTint;
in vec3 vUv;
in vec4 vLight;
in vec3 vWorld;
out vec4 o;
void main() {
  vec4 c = texture(uTex, vUv);
  if (uCut > 0.5 && c.a < 0.5) discard;
  float sky = mix(vLight.x, uSet.x, uUseSet);
  float blk = mix(vLight.y, uSet.y, uUseSet);
  float sl = sky * uSky;
  float l = max(sl, blk);
  float lum = 0.045 + 0.955 * pow(l, 1.5);
  vec3 col = c.rgb * lum * vLight.z * vLight.w;
  float warm = clamp((blk - sl) * 1.5, 0.0, 1.0);
  col *= mix(vec3(1.0), vec3(1.2, 1.0, 0.76), warm);
  col = mix(col, uTint.rgb, uTint.a);
  float d = length(vWorld - uCam);
  float f = clamp((d - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  col = mix(col, uFogColor, f);
  o = vec4(col, c.a * uAlpha);
}`;

export const SKY_VS = `#version 300 es
out vec2 vNdc;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`;

// 空：グラデーション・四角い太陽と月（マイクラと同じ）・星・ブロックのような雲
export const SKY_FS = `#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight, uUp, uFwd;
uniform float uTan, uAspect, uShift;
uniform vec3 uZenith, uHorizon, uSun, uMoon, uCam;
uniform float uNight, uTime, uCloud;
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float square(vec3 rd, vec3 dir, float size) {
  float d = dot(rd, dir);
  if (d < 0.0) return 0.0;
  vec3 up = abs(dir.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 a = normalize(cross(dir, up));
  vec3 b = cross(dir, a);
  vec3 q = rd / d - dir;
  float u = dot(q, a), v = dot(q, b);
  return step(max(abs(u), abs(v)), size);
}
void main() {
  vec3 rd = normalize(uFwd + (vNdc.x + uShift) * uTan * uAspect * uRight + vNdc.y * uTan * uUp);
  float h = rd.y;
  vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.5));
  if (h < 0.0) col = mix(uHorizon, uHorizon * 0.55, clamp(-h * 4.0, 0.0, 1.0));
  // 星
  if (h > 0.0 && uNight > 0.01) {
    vec2 sph = vec2(atan(rd.x, rd.z), asin(clamp(h, -1.0, 1.0)));
    vec2 g = floor(sph * vec2(90.0, 90.0));
    float s = step(0.9935, hash(g));
    col += vec3(s) * uNight * (0.55 + 0.45 * hash(g + 3.0));
  }
  // 太陽と月
  float sun = square(rd, normalize(uSun), 0.075);
  col = mix(col, vec3(1.0, 0.96, 0.74), sun * (1.0 - uNight));
  float moon = square(rd, normalize(uMoon), 0.06);
  col = mix(col, vec3(0.86, 0.9, 0.97), moon * uNight);
  col += uHorizon * 0.22 * smoothstep(0.35, 0.0, abs(h)) * (1.0 - uNight * 0.7);
  // 雲
  if (h > 0.025 && uCloud > 0.0) {
    float t = (96.0 - uCam.y) / h;
    vec2 p = uCam.xz + rd.xz * t + vec2(uTime * 1.6, uTime * 0.4);
    vec2 cell = floor(p / 12.0);
    float n = hash(cell) * 0.6 + hash(floor(cell / 3.0) + 17.0) * 0.4;
    float cl = step(0.71, n);
    vec3 cc = mix(vec3(1.0), uHorizon * 1.1, 0.25) * mix(1.0, 0.24, uNight);
    col = mix(col, cc, cl * smoothstep(0.025, 0.12, h) * 0.92 * uCloud);
  }
  o = vec4(col, 1.0);
}`;

export const LINE_VS = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uVP;
uniform mat4 uModel;
void main() { gl_Position = uVP * uModel * vec4(aPos, 1.0); }`;

export const LINE_FS = `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 o;
void main() { o = uColor; }`;

export function compile(gl, vs, fs) {
  const mk = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

// ── 行列（列が先。WebGL の並び） ──
export const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** shift：画面の中心を、横に ずらす量（−1〜1。画面の幅の半分が 1）。右にずらすなら正 */
export function perspective(out, fovy, aspect, n, f, shift = 0) {
  const t = 1 / Math.tan(fovy / 2), nf = 1 / (n - f);
  out.fill(0);
  out[0] = t / aspect; out[5] = t; out[8] = shift; out[10] = (f + n) * nf; out[11] = -1; out[14] = 2 * f * n * nf;
  return out;
}

export function viewMatrix(out, ex, ey, ez, fx, fy, fz) {
  // 右 = 前 × 上(0,1,0)
  let rx = -fz, rz = fx;
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl; rz /= rl;
  // 上 = 右 × 前
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
  out[0] = rx; out[1] = ux; out[2] = -fx; out[3] = 0;
  out[4] = 0; out[5] = uy; out[6] = -fy; out[7] = 0;
  out[8] = rz; out[9] = uz; out[10] = -fz; out[11] = 0;
  out[12] = -(rx * ex + rz * ez); out[13] = -(ux * ex + uy * ey + uz * ez); out[14] = fx * ex + fy * ey + fz * ez; out[15] = 1;
  return { right: [rx, 0, rz], up: [ux, uy, uz] };
}

export function mul(out, a, b) {
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return out;
}

export function translation(out, x, y, z) {
  out.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
  return out;
}

/**
 * 点 (py, pz) を通る x 軸のまわりに a ラジアン回してから、(tx, ty, tz) へ動かす行列。
 * y' = y·cos − z·sin、z' = y·sin + z·cos。動かす先は  R·v + (P − R·P + t)
 */
export function pivotRotX(out, py, pz, a, tx, ty, tz) {
  const c = Math.cos(a), s = Math.sin(a);
  out.set([
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
    tx, ty + py - (c * py - s * pz), tz + pz - (s * py + c * pz), 1,
  ]);
  return out;
}

/** VP 行列から、見える範囲の 6 つの面を取りだす */
export function frustum(vp) {
  const p = [];
  const row = (i) => [vp[i], vp[4 + i], vp[8 + i], vp[12 + i]];
  const r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3);
  for (const [a, s] of [[r0, 1], [r0, -1], [r1, 1], [r1, -1], [r2, 1], [r2, -1]]) {
    const pl = [r3[0] + s * a[0], r3[1] + s * a[1], r3[2] + s * a[2], r3[3] + s * a[3]];
    const l = Math.hypot(pl[0], pl[1], pl[2]) || 1;
    p.push([pl[0] / l, pl[1] / l, pl[2] / l, pl[3] / l]);
  }
  return p;
}

export function boxVisible(planes, x0, y0, z0, x1, y1, z1) {
  for (const [a, b, c, d] of planes) {
    const x = a > 0 ? x1 : x0, y = b > 0 ? y1 : y0, z = c > 0 ? z1 : z0;
    if (a * x + b * y + c * z + d < 0) return false;
  }
  return true;
}

/** ワールドの点を、画面の点に。{ x, y, w }。w が 0 以下なら、後ろ */
export function projectPoint(vp, x, y, z, width, height) {
  const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
  const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
  const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
  if (cw <= 0.01) return { x: 0, y: 0, w: cw };
  return { x: (cx / cw * 0.5 + 0.5) * width, y: (1 - (cy / cw * 0.5 + 0.5)) * height, w: cw };
}
