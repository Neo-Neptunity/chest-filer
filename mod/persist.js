// 保存。ワールドは ep.storage に、meta とチェスト1つずつに分けて置く（1つの値は 1MB まで）。
// 変わったチェストだけ書く。チェストは作り直す決まりなので、=== で変わったかが分かる。
// 順序：チェスト → meta。途中で止まっても、meta が消えたチェストを指すことは無い。

import { World, chestParts } from "./model.js";

export const KEY_META = "w";
export const KEY_PREFS = "prefs";
export const chestKey = (id) => `c.${id}`;

/**
 * storage は ep.storage と同じ形。onError(err) は書けなかったとき
 */
export function createStore(storage, { delay = 350, onError = () => {} } = {}) {
  let saved = { chests: {}, meta: "" };
  let timer = 0;
  let pending = null;
  let chain = Promise.resolve();

  /** 読み込む。保存が無ければ null */
  async function load() {
    const meta = await storage.get(KEY_META);
    if (meta === undefined || meta === null) return null;
    const ids = Array.isArray(meta.ids) ? meta.ids.filter((x) => typeof x === "string") : [];
    const got = await Promise.all(ids.map(async (id) => {
      try { return [id, await storage.get(chestKey(id))]; } catch { return [id, undefined]; }
    }));
    const world = World.fromParts(meta, Object.fromEntries(got));
    saved = { chests: { ...world.chests }, meta: JSON.stringify(world.metaParts()) };
    return world;
  }

  async function write(world) {
    const metaParts = world.metaParts();
    const metaJson = JSON.stringify(metaParts);
    const next = { ...world.chests };
    for (const id of Object.keys(next)) {
      if (saved.chests[id] === next[id]) continue;
      await storage.set(chestKey(id), chestParts(next[id]));
      saved.chests[id] = next[id];
    }
    if (metaJson !== saved.meta) {
      await storage.set(KEY_META, metaParts);
      saved.meta = metaJson;
    }
    for (const id of Object.keys(saved.chests)) {
      if (next[id]) continue;
      await storage.delete(chestKey(id));
      delete saved.chests[id];
    }
  }

  function enqueue(world) {
    chain = chain.then(() => write(world)).catch((err) => onError(err));
    return chain;
  }

  return {
    load,
    /** しばらくして書く。続けて呼ぶと、最後の1回だけ */
    schedule(world) {
      pending = world;
      clearTimeout(timer);
      timer = setTimeout(() => { const w = pending; pending = null; if (w) enqueue(w); }, delay);
    },
    /** すぐ書く */
    flush() {
      clearTimeout(timer);
      const w = pending;
      pending = null;
      return w ? enqueue(w) : chain;
    },
    get dirty() { return !!pending; },
  };
}

/** 画面の設定のようなもの。小さいので1つの値 */
export async function loadPrefs(storage) {
  let p = null;
  try { p = await storage.get(KEY_PREFS); } catch { /* 無ければ初期値 */ }
  p = p && typeof p === "object" ? p : {};
  return {
    view: p.view === "icon" ? "icon" : "caption",
    mode: p.mode === "iso" ? "iso" : "walk",
    rot: Number.isInteger(p.rot) ? p.rot & 3 : 0,
    zoom: Number.isFinite(p.zoom) ? Math.max(0.55, Math.min(2.2, p.zoom)) : 1,
    hide: !!p.hide,
    seen: !!p.seen,
  };
}
export const savePrefs = (storage, p) => storage.set(KEY_PREFS, p);
