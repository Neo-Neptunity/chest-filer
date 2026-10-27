// 仮想ディレクトリの本体。画面にも本体（explorer_plus）にも触れない。
//
// チェスト＝仮想のフォルダー。中に入るのは、本物のファイル・フォルダへの「参照」と、ほかのチェスト。
// 実際のファイルは動かさない。参照はファイルID で覚えるので、名前を変えても外れない。
//
// 木の決まり：すべてのチェストは、部屋の上か、どれか1つのチェストのスロットに、ちょうど1回だけ置かれる。
// 変えるときは、チェスト・部屋・ホットバーの配列を「作り直す」。中身は書き換えない。
// だから元に戻す用の記録は、参照を持つだけで済み、保存のときも、変わったチェストが ===  で分かる。

import { COLS, HOTBAR, ROOM_N, NAME_MAX, MAX_SLOTS, MAX_CHESTS, KIND_IDS, DEFAULT_KIND } from "./consts.js";

const collator = new Intl.Collator("ja", { numeric: true, sensitivity: "base" });

/** 項目の同一性。ファイルID があればそれ。ID の無いドライブではパス */
export function keyOf(it) {
  if (it.t === "c") return `c:${it.cid}`;
  return it.id ? `i:${it.id}` : `p:${it.path.toLowerCase()}`;
}

/** 本体の Entry から、チェストに入れる参照を作る */
export function fileItem(e) {
  return { t: "f", id: e.id || "", path: e.path, name: e.name, k: e.kind === "folder" ? "d" : "f", ext: e.kind === "folder" ? "" : e.ext || "" };
}

export const chestItem = (cid) => ({ t: "c", cid });
export const refOf = (it) => ({ id: it.id || "", path: it.path });

const clipName = (s) => String(s ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, NAME_MAX);

/** 配列の終わりの null を落とす（保存を小さくする） */
function trim(slots) {
  let n = slots.length;
  while (n > 0 && !slots[n - 1]) n--;
  if (n !== slots.length) slots.length = n;
  for (let i = 0; i < slots.length; i++) if (slots[i] === undefined) slots[i] = null;
  return slots;
}

export class World {
  constructor() {
    this.nextId = 1;
    this.chests = {};                         // cid → { id, name, kind, slots }
    this.room = [];                           // [{ cid, x, y }]
    this.hotbar = Array(HOTBAR).fill(null);   // 近道。参照のコピー
    this._undo = [];
    this._redo = [];
    this._cache = null;
  }

  /** はじめのワールド */
  static starter() {
    const w = new World();
    w.addChest({ name: "しごと", kind: "oak", x: 2, y: 3 });
    w.addChest({ name: "しゃしん", kind: "birch", x: 4, y: 3 });
    w.addChest({ name: "あとで見る", kind: "spruce", x: 6, y: 3 });
    w._undo = [];
    return w;
  }

  // ── 読む ────────────────────────────────────────────

  chest(cid) { return this.chests[cid] || null; }
  get chestCount() { return Object.keys(this.chests).length; }

  _index() {
    if (this._cache) return this._cache;
    const parent = new Map();   // cid → { cid: 親のチェスト | null（部屋）, slot }
    const where = new Map();    // 項目の key → [{ cid, slot }]
    this.room.forEach((r, i) => parent.set(r.cid, { cid: null, slot: i }));
    for (const c of Object.values(this.chests)) {
      c.slots.forEach((it, slot) => {
        if (!it) return;
        if (it.t === "c") parent.set(it.cid, { cid: c.id, slot });
        else {
          const k = keyOf(it);
          const list = where.get(k);
          if (list) list.push({ cid: c.id, slot });
          else where.set(k, [{ cid: c.id, slot }]);
        }
      });
    }
    return (this._cache = { parent, where });
  }

  /** 親。部屋の上なら { cid: null }。無ければ null */
  parentOf(cid) { return this._index().parent.get(cid) || null; }

  /** 部屋から cid までのチェストの並び（cid を含む） */
  pathOf(cid) {
    const out = [];
    let cur = cid;
    const seen = new Set();
    while (cur && this.chests[cur] && !seen.has(cur)) {
      seen.add(cur);
      out.push(cur);
      const p = this.parentOf(cur);
      cur = p ? p.cid : null;
    }
    return out.reverse();
  }

  /** a は b の中（または b そのもの）にあるか */
  isInside(a, b) {
    return this.pathOf(a).includes(b);
  }

  /** この項目が入っている場所。複数あることもある */
  locate(key) { return [...(this._index().where.get(key) || [])]; }

  roomAt(x, y) {
    const r = this.room.find((c) => c.x === x && c.y === y);
    return r ? r.cid : null;
  }

  /** (px, py) にいちばん近い、空いている升。無ければ null */
  freeCell(px = ROOM_N / 2, py = ROOM_N / 2) {
    let best = null, bd = Infinity;
    for (let y = 0; y < ROOM_N; y++) for (let x = 0; x < ROOM_N; x++) {
      if (this.roomAt(x, y)) continue;
      const d = (x - px) ** 2 + (y - py) ** 2 + (x + y * 0.01) * 1e-6;
      if (d < bd) { bd = d; best = { x, y }; }
    }
    return best;
  }

  /** 空いているスロットを、from から n 個。足りなければ少なく返す */
  emptiesFrom(cid, from, n) { return emptiesIn(this.chests[cid].slots, from, n); }

  /** 中身の数 */
  stats(cid) {
    let chests = 0, files = 0, folders = 0;
    for (const it of this.chests[cid].slots) {
      if (!it) continue;
      if (it.t === "c") chests++;
      else if (it.k === "d") folders++;
      else files++;
    }
    return { chests, files, folders, total: chests + files + folders };
  }

  /** 表に出すスロットの行数。いつも1行は空きがある */
  rowsOf(cid, min = 3) {
    const n = this.chests[cid].slots.length;
    return Math.min(MAX_SLOTS / COLS, Math.max(min, Math.ceil((n + 1) / COLS)));
  }

  // ── 元に戻す ────────────────────────────────────────

  _snap() { return { nextId: this.nextId, chests: this.chests, room: this.room, hotbar: this.hotbar }; }
  _restore(s) {
    this.nextId = s.nextId; this.chests = s.chests; this.room = s.room; this.hotbar = s.hotbar;
    this._cache = null;
  }
  _same(s) { return s.chests === this.chests && s.room === this.room && s.hotbar === this.hotbar && s.nextId === this.nextId; }

  /** 変えるときは、これで包む。何も変わらなければ記録しない */
  run(label, fn) {
    const before = this._snap();
    const res = fn();
    if (!this._same(before)) {
      this._undo.push({ label, snap: before });
      if (this._undo.length > 100) this._undo.shift();
      this._redo = [];
    }
    return res;
  }

  get canUndo() { return this._undo.length > 0; }
  get canRedo() { return this._redo.length > 0; }
  get undoLabel() { return this._undo.length ? this._undo[this._undo.length - 1].label : ""; }

  undo() {
    const u = this._undo.pop();
    if (!u) return null;
    this._redo.push({ label: u.label, snap: this._snap() });
    this._restore(u.snap);
    return u.label;
  }
  redo() {
    const u = this._redo.pop();
    if (!u) return null;
    this._undo.push({ label: u.label, snap: this._snap() });
    this._restore(u.snap);
    return u.label;
  }

  // ── 低い層の変更 ────────────────────────────────────

  _putChest(c) { this.chests = { ...this.chests, [c.id]: c }; this._cache = null; }
  _withSlots(cid, fn) {
    const c = this.chests[cid];
    const s = c.slots.slice();
    fn(s);
    for (let i = 0; i < s.length; i++) if (s[i] === undefined) s[i] = null;
    this._putChest({ ...c, slots: trim(s) });
  }
  _setRoom(room) { this.room = room; this._cache = null; }
  _setHotbar(h) { this.hotbar = h; }

  /** スロットから取り除く。中身が expect と同じときだけ */
  _clearSlot(cid, slot, expect) {
    const c = this.chests[cid];
    const cur = c && c.slots[slot];
    if (!cur || (expect && keyOf(cur) !== keyOf(expect))) return false;
    this._withSlots(cid, (s) => { s[slot] = null; });
    return true;
  }

  /** 部屋の上かスロットから、チェストの置き場を外す */
  _detachChest(cid) {
    const p = this.parentOf(cid);
    if (!p) return;
    if (p.cid === null) this._setRoom(this.room.filter((r) => r.cid !== cid));
    else this._withSlots(p.cid, (s) => { s[p.slot] = null; });
  }

  // ── チェスト ────────────────────────────────────────

  /** parent が null なら部屋に置く。作れなければ null */
  addChest({ name = "新しいチェスト", kind = DEFAULT_KIND, parent = null, slot, x, y } = {}) {
    if (this.chestCount >= MAX_CHESTS) return null;
    let cell = null, at = -1;
    if (parent === null) {
      cell = this.freeCell(x, y);
      if (!cell) return null;
    } else {
      if (!this.chests[parent]) return null;
      at = slot !== undefined && !this.chests[parent].slots[slot] ? slot : this.emptiesFrom(parent, slot ?? 0, 1)[0] ?? -1;
      if (at < 0) return null;
    }
    const cid = `c${(this.nextId++).toString(36)}`;
    this._putChest({ id: cid, name: clipName(name) || "新しいチェスト", kind: KIND_IDS.includes(kind) ? kind : DEFAULT_KIND, slots: [] });
    if (parent === null) this._setRoom([...this.room, { cid, x: cell.x, y: cell.y }]);
    else this._withSlots(parent, (s) => { s[at] = chestItem(cid); });
    return cid;
  }

  rename(cid, name) {
    const c = this.chests[cid];
    const n = clipName(name);
    if (!c || !n || n === c.name) return false;
    this._putChest({ ...c, name: n });
    return true;
  }

  setKind(cid, kind) {
    const c = this.chests[cid];
    if (!c || !KIND_IDS.includes(kind) || c.kind === kind) return false;
    this._putChest({ ...c, kind });
    return true;
  }

  /** こわす。中のチェストも一緒に無くなる。入っていた参照が消えるだけで、ファイルには何も起きない */
  removeChest(cid) {
    if (!this.chests[cid]) return 0;
    const gone = new Set();
    const walk = (id) => {
      if (gone.has(id) || !this.chests[id]) return;
      gone.add(id);
      for (const it of this.chests[id].slots) if (it && it.t === "c") walk(it.cid);
    };
    walk(cid);
    this._detachChest(cid);
    const next = { ...this.chests };
    for (const id of gone) delete next[id];
    this.chests = next;
    this._cache = null;
    if (this.hotbar.some((h) => h && h.t === "c" && gone.has(h.cid))) {
      this._setHotbar(this.hotbar.map((h) => (h && h.t === "c" && gone.has(h.cid) ? null : h)));
    }
    return gone.size;
  }

  /** 部屋の升へ。ほかのチェストがある升なら、近くの空いた升へ */
  moveChestToRoom(cid, x, y) {
    if (!this.chests[cid]) return false;
    const p = this.parentOf(cid);
    const others = this.room.filter((r) => r.cid !== cid);
    const taken = (cx, cy) => others.some((r) => r.x === cx && r.y === cy);
    let cell = { x, y };
    if (x === undefined || x < 0 || y < 0 || x >= ROOM_N || y >= ROOM_N || taken(x, y)) {
      let best = null, bd = Infinity;
      for (let cy = 0; cy < ROOM_N; cy++) for (let cx = 0; cx < ROOM_N; cx++) {
        if (taken(cx, cy)) continue;
        const d = (cx - (x ?? ROOM_N / 2)) ** 2 + (cy - (y ?? ROOM_N / 2)) ** 2;
        if (d < bd) { bd = d; best = { x: cx, y: cy }; }
      }
      if (!best) return false;
      cell = best;
    }
    if (p && p.cid === null) {
      this._setRoom(this.room.map((r) => (r.cid === cid ? { cid, x: cell.x, y: cell.y } : r)));
    } else {
      this._detachChest(cid);
      this._setRoom([...this.room, { cid, x: cell.x, y: cell.y }]);
    }
    return true;
  }

  /** チェストを、ほかのチェストの中へ。自分の中・自分の下には入れられない */
  nestChest(cid, intoCid, slot = 0) {
    if (!this.chests[cid] || !this.chests[intoCid] || cid === intoCid || this.isInside(intoCid, cid)) return false;
    const p = this.parentOf(cid);
    if (p && p.cid === intoCid) return false;
    const at = this.emptiesFrom(intoCid, slot, 1)[0];
    if (at === undefined) return false;
    this._detachChest(cid);
    this._withSlots(intoCid, (s) => { s[at] = chestItem(cid); });
    return true;
  }

  // ── スロット ────────────────────────────────────────

  removeAt(cid, slot) { return this._clearSlot(cid, slot); }

  /** 参照の名前・場所が変わったとき。記録には残さない。変えた数を返す */
  refreshRef(key, patch) {
    let n = 0;
    const loc = this.locate(key);
    for (const { cid, slot } of loc) {
      const cur = this.chests[cid].slots[slot];
      const next = { ...cur };
      let diff = false;
      for (const f of ["path", "name", "ext", "id", "k"]) if (patch[f] !== undefined && patch[f] !== cur[f]) { next[f] = patch[f]; diff = true; }
      if (!diff) continue;
      this._withSlots(cid, (s) => { s[slot] = next; });
      n++;
    }
    if (n) {
      this.hotbar = this.hotbar.map((h) => {
        if (!h || h.t !== "f" || keyOf(h) !== key) return h;
        const next = { ...h };
        for (const f of ["path", "name", "ext", "id", "k"]) if (patch[f] !== undefined) next[f] = patch[f];
        return next;
      });
    }
    return n;
  }

  // ── ドラッグ＆ドロップ ──────────────────────────────

  /**
   * 手に持った項目を、置く。
   *   hand   = { items: Item[], from: Origin[], copy?: boolean }
   *   Origin = { zone: "chest", cid, slot } | { zone: "inv" } | { zone: "hotbar", slot }
   *   target = { zone: "chest", cid, slot } | { zone: "into", cid } | { zone: "hotbar", slot } | { zone: "inv" }
   * 戻り値：{ ok, placed, skipped, moved: [別のチェストから移した項目の名前], reason }
   *   reason：none・hotbar・loop・dup・full
   */
  dropHand(hand, target) {
    const res = { ok: false, placed: 0, skipped: 0, moved: [], reason: "none", into: null };
    if (!hand.items.length) return res;
    const label = target.zone === "inv" ? "チェストから出す" : target.zone === "hotbar" ? "ホットバーの変更" : target.zone === "into" || hand.from.some((o) => o.zone === "inv") ? "チェストに入れる" : "ファイルを動かす";
    return this.run(label, () => {
      if (target.zone === "inv") return this._dropToInv(hand, res);
      if (target.zone === "hotbar") return this._dropToHotbar(hand, target, res);
      return this._dropToChest(hand, target, res);
    });
  }

  _dropToInv(hand, res) {
    hand.items.forEach((it, i) => {
      const o = hand.from[i];
      // チェストは参照ではないので、持ち物にはならない。取り出すと、部屋へ出る
      if (it.t === "c" && o.zone === "chest") {
        const cur = this.chests[o.cid] && this.chests[o.cid].slots[o.slot];
        if (cur && cur.t === "c" && cur.cid === it.cid && this.moveChestToRoom(it.cid)) res.placed++;
      } else if (o.zone === "chest" && !hand.copy) { if (this._clearSlot(o.cid, o.slot, it)) res.placed++; }
      else if (o.zone === "hotbar") {
        this._setHotbar(this.hotbar.map((h, s) => (s === o.slot ? null : h)));
        res.placed++;
      }
    });
    res.ok = res.placed > 0;
    res.reason = res.ok ? "" : "none";
    return res;
  }

  _dropToHotbar(hand, target, res) {
    const only = hand.items.length === 1;
    const o0 = hand.from[0];
    if (only && o0.zone === "hotbar") {
      if (o0.slot === target.slot) { res.ok = true; return res; }
      const h = this.hotbar.slice();
      [h[o0.slot], h[target.slot]] = [h[target.slot], h[o0.slot]];
      this._setHotbar(h);
      res.ok = true; res.placed = 1;
      return res;
    }
    let h = this.hotbar.slice();
    const slots = [];
    for (let i = 0; i < HOTBAR && slots.length < hand.items.length; i++) {
      const s = (target.slot + i) % HOTBAR;
      if (i === 0 || !h[s]) slots.push(s);
    }
    hand.items.forEach((it, i) => {
      if (slots[i] === undefined) { res.skipped++; return; }
      if (h.some((x, s) => x && keyOf(x) === keyOf(it) && s !== slots[i])) { res.skipped++; res.reason = "dup"; return; }
      h[slots[i]] = it;
      res.placed++;
    });
    // ホットバーの中で動かしたときは、元の場所を空ける
    hand.from.forEach((o, i) => { if (o.zone === "hotbar" && h[o.slot] && keyOf(h[o.slot]) === keyOf(hand.items[i]) && slots[i] !== o.slot) h[o.slot] = null; });
    this._setHotbar(h);
    res.ok = res.placed > 0;
    if (res.ok) res.reason = "";
    return res;
  }

  _dropToChest(hand, target, res) {
    let dst = target.cid;
    let start = target.zone === "chest" ? target.slot : 0;
    let into = target.zone === "into";
    if (!this.chests[dst]) { res.reason = "none"; return res; }
    if (target.zone === "chest") {
      const occ = this.chests[dst].slots[target.slot];
      if (occ && occ.t === "c" && !hand.items.some((it) => it.t === "c" && it.cid === occ.cid)) {
        dst = occ.cid; start = 0; into = true;
      }
    }
    res.into = into ? dst : null;

    // 置けるものを選ぶ
    const picked = [];
    const inHand = new Set();
    hand.items.forEach((it, i) => {
      const o = hand.from[i];
      if (o.zone === "hotbar") { res.skipped++; res.reason = "hotbar"; return; }
      if (o.zone === "chest") {
        const cur = this.chests[o.cid] && this.chests[o.cid].slots[o.slot];
        if (!cur || keyOf(cur) !== keyOf(it)) { res.skipped++; return; }
      }
      if (it.t === "c") {
        if (it.cid === dst || this.isInside(dst, it.cid)) { res.skipped++; res.reason = "loop"; return; }
        if (o.zone !== "chest") { res.skipped++; return; }
      } else if (!(o.zone === "chest" && o.cid === dst) || hand.copy) {
        // 同じチェストに、同じファイルは2つ入れない。同じチェストの中でのコピーも同じこと
        const k = keyOf(it);
        if (this.locate(k).some((l) => l.cid === dst)) { res.skipped++; res.reason = "dup"; return; }
      }
      if (inHand.has(keyOf(it))) { res.skipped++; return; }
      inHand.add(keyOf(it));
      picked.push({ it, o });
    });
    if (!picked.length) return res;

    // 1つだけ、中身のあるスロットへ：場所を入れかえる
    if (picked.length === 1 && !into && target.zone === "chest") {
      const { it, o } = picked[0];
      const occ = this.chests[dst].slots[target.slot];
      if (o.zone === "chest" && occ && occ.t !== "c" && !(o.cid === dst && o.slot === target.slot) && !hand.copy) {
        const src = this.chests[o.cid] && this.chests[o.cid].slots[o.slot];
        if (src && keyOf(src) === keyOf(it)) {
          // 中のチェストは別の入れ物へ移る。入れかえは、動かすものが木の決まりを破らないときだけ
          if (it.t === "c" && (this.isInside(dst, it.cid))) { res.skipped++; res.reason = "loop"; return res; }
          this._withSlots(o.cid, (s) => { s[o.slot] = null; });
          this._withSlots(dst, (s) => { s[target.slot] = it; });
          this._withSlots(o.cid, (s) => { s[o.slot] = occ; });
          res.placed = 1; res.ok = true; res.reason = "";
          return res;
        }
      }
    }
    if (picked.length === 1 && !into && target.zone === "chest" && picked[0].o.zone === "chest" && picked[0].o.cid === dst && picked[0].o.slot === target.slot) {
      res.ok = true; res.reason = "";   // 自分の場所に戻しただけ
      return res;
    }

    // 置く場所が足りるかを、先に数える。足りなければ、置けない分は元の場所に残す
    const after = this.chests[dst].slots.slice();
    for (const { it, o } of picked) if (o.zone === "chest" && o.cid === dst && (!hand.copy || it.t === "c")) after[o.slot] = null;
    const spots = emptiesIn(after, start, picked.length);
    if (spots.length < picked.length) {
      res.skipped += picked.length - spots.length;
      res.reason = "full";
      picked.length = spots.length;
      if (!picked.length) return res;
    }

    // 元のスロットから外す（コピーのときは外さない。中のチェストは必ず移る）
    for (const { it, o } of picked) {
      if (o.zone === "chest" && (!hand.copy || it.t === "c")) this._clearSlot(o.cid, o.slot, it);
    }
    // ファイルが別のチェストにあれば、そこから移す。コピーのときは残す
    if (!hand.copy) {
      for (const { it, o } of picked) {
        if (it.t === "c" || o.zone !== "inv") continue;
        for (const l of this.locate(keyOf(it))) {
          if (l.cid === dst) continue;
          this._clearSlot(l.cid, l.slot, it);
          res.moved.push(this.chests[l.cid].name);
        }
      }
    }
    picked.forEach(({ it }, i) => {
      this._withSlots(dst, (s) => { s[spots[i]] = it; });
      res.placed++;
    });
    res.ok = res.placed > 0;
    if (res.ok && res.reason !== "dup" && res.reason !== "full") res.reason = "";
    return res;
  }

  // ── ホットバー ──────────────────────────────────────

  setHotbar(slot, item) {
    if (slot < 0 || slot >= HOTBAR) return false;
    const h = this.hotbar.slice();
    h[slot] = item;
    this._setHotbar(h);
    return true;
  }

  // ── 整頓・さがす ────────────────────────────────────

  /** 並べなおす。いつも詰める。metaOf(item) → { size, modified } */
  sortChest(cid, by, metaOf = () => ({})) {
    const c = this.chests[cid];
    if (!c) return false;
    const items = c.slots.filter(Boolean);
    const group = (it) => (it.t === "c" ? 0 : it.k === "d" ? 1 : 2);
    const nameOf = (it) => (it.t === "c" ? this.chests[it.cid]?.name ?? "" : it.name);
    const num = (v) => (typeof v === "number" ? v : -1);
    const cmp = (a, b) => {
      const g = group(a) - group(b);
      if (g) return g;
      if (by === "type") {
        const t = collator.compare(a.ext || "", b.ext || "");
        if (t) return t;
      } else if (by === "size") {
        const d = num(metaOf(b).size) - num(metaOf(a).size);
        if (d) return d;
      } else if (by === "modified") {
        const d = num(metaOf(b).modified) - num(metaOf(a).modified);
        if (d) return d;
      }
      return collator.compare(nameOf(a), nameOf(b));
    };
    const next = by === "compact" ? items : items.slice().sort(cmp);
    this._withSlots(cid, (s) => { s.length = 0; s.push(...next); });
    return true;
  }

  /** 名前でさがす。空白で区切ると、すべてを含むもの */
  search(q, limit = 200) {
    const toks = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
    if (!toks.length) return [];
    const hit = (name) => { const n = name.toLowerCase(); return toks.every((t) => n.includes(t)); };
    const out = [];
    const visit = (cid, trail, seen) => {
      if (out.length >= limit || seen.has(cid) || !this.chests[cid]) return;
      seen.add(cid);
      const c = this.chests[cid];
      if (hit(c.name)) out.push({ type: "chest", cid, name: c.name, trail });
      const here = [...trail, c.name];
      c.slots.forEach((it, slot) => {
        if (!it || out.length >= limit) return;
        if (it.t === "c") visit(it.cid, here, seen);
        else if (hit(it.name)) out.push({ type: "item", cid, slot, item: it, name: it.name, trail: here });
      });
    };
    const seen = new Set();
    for (const r of this.room) visit(r.cid, [], seen);
    return out;
  }

  // ── 保存の形 ────────────────────────────────────────

  /** 保存する形。meta は小さく、チェストは1つずつ別に */
  metaParts() {
    return {
      v: 1,
      nextId: this.nextId,
      room: this.room.map((r) => ({ c: r.cid, x: r.x, y: r.y })),
      hotbar: this.hotbar.map((h) => (h ? slim(h) : null)),
      ids: Object.keys(this.chests),
    };
  }

  toParts() {
    return { meta: this.metaParts(), chests: Object.fromEntries(Object.values(this.chests).map((c) => [c.id, chestParts(c)])) };
  }

  /** 読み込む。壊れていても、読めるところだけで木を作る */
  static fromParts(meta, chestMap) {
    const w = new World();
    if (!meta || typeof meta !== "object") return World.starter();
    w.nextId = Number.isInteger(meta.nextId) && meta.nextId > 0 ? meta.nextId : 1;
    const raw = {};
    for (const id of Array.isArray(meta.ids) ? meta.ids : []) {
      const c = chestMap && chestMap[id];
      if (!c || typeof c !== "object" || typeof id !== "string") continue;
      raw[id] = {
        id,
        name: clipName(c.name) || "チェスト",
        kind: KIND_IDS.includes(c.kind) ? c.kind : DEFAULT_KIND,
        slots: Array.isArray(c.slots) ? c.slots.slice(0, MAX_SLOTS).map(cleanItem) : [],
      };
    }
    // 部屋から木をたどって、1回だけ置かれたチェストだけを残す
    const seen = new Set();
    const cells = new Set();
    const room = [];
    for (const r of Array.isArray(meta.room) ? meta.room : []) {
      if (!r || !raw[r.c] || seen.has(r.c) || !Number.isInteger(r.x) || !Number.isInteger(r.y)) continue;
      if (r.x < 0 || r.y < 0 || r.x >= ROOM_N || r.y >= ROOM_N || cells.has(`${r.x},${r.y}`)) continue;
      cells.add(`${r.x},${r.y}`);
      room.push({ cid: r.c, x: r.x, y: r.y });
      seen.add(r.c);
    }
    const chests = {};
    const visit = (cid) => {
      const c = raw[cid];
      const slots = c.slots.map((it) => {
        if (!it || it.t !== "c") return it;
        if (!raw[it.cid] || seen.has(it.cid)) return null;
        seen.add(it.cid);
        visit(it.cid);
        return it;
      });
      chests[cid] = { ...c, slots: trim(slots) };
    };
    for (const r of room) visit(r.cid);
    // 保存の並びのとおりにする
    w.chests = Object.fromEntries(Object.keys(raw).filter((id) => chests[id]).map((id) => [id, chests[id]]));
    w.room = room;
    w.hotbar = Array(HOTBAR).fill(null).map((_, i) => {
      const h = Array.isArray(meta.hotbar) ? cleanItem(meta.hotbar[i]) : null;
      return h && (h.t === "f" || chests[h.cid]) ? h : null;
    });
    // nextId は、使った番号より大きく
    for (const id of Object.keys(chests)) {
      const n = parseInt(id.slice(1), 36);
      if (Number.isFinite(n) && n >= w.nextId) w.nextId = n + 1;
    }
    return w;
  }

  /** 木の決まりを守っているか。試験用。破れていれば、理由の文字列の配列 */
  check() {
    const bad = [];
    const refs = new Map();
    const ref = (cid, from) => refs.set(cid, [...(refs.get(cid) || []), from]);
    const cells = new Set();
    for (const r of this.room) {
      ref(r.cid, "room");
      if (cells.has(`${r.x},${r.y}`)) bad.push(`升が重なる ${r.x},${r.y}`);
      cells.add(`${r.x},${r.y}`);
      if (r.x < 0 || r.y < 0 || r.x >= ROOM_N || r.y >= ROOM_N) bad.push(`升の外 ${r.x},${r.y}`);
    }
    for (const c of Object.values(this.chests)) {
      if (c.slots.length && !c.slots[c.slots.length - 1]) bad.push(`${c.id} の終わりに空きがある`);
      if (c.slots.length > MAX_SLOTS) bad.push(`${c.id} が大きすぎる`);
      c.slots.forEach((it, i) => {
        if (it === undefined) bad.push(`${c.id}[${i}] が undefined`);
        if (it && it.t === "c") ref(it.cid, c.id);
      });
      const keys = new Set();
      for (const it of c.slots) {
        if (!it || it.t === "c") continue;
        const k = keyOf(it);
        if (keys.has(k)) bad.push(`${c.id} に同じ項目が2つ ${it.name}`);
        keys.add(k);
      }
    }
    for (const id of Object.keys(this.chests)) {
      const r = refs.get(id) || [];
      if (r.length !== 1) bad.push(`${id} の置き場が ${r.length} 個`);
    }
    for (const [id, from] of refs) if (!this.chests[id]) bad.push(`${id} が無いのに ${from.join(",")} から置かれている`);
    for (const id of Object.keys(this.chests)) if (this.pathOf(id)[0] === undefined || !this.room.some((r) => r.cid === this.pathOf(id)[0])) bad.push(`${id} が部屋につながらない`);
    for (const h of this.hotbar) if (h && h.t === "c" && !this.chests[h.cid]) bad.push(`ホットバーが消えたチェストを指す ${h.cid}`);
    if (this.hotbar.length !== HOTBAR) bad.push("ホットバーの数");
    return bad;
  }
}

/** 配列の中の空きを、from から n 個（終わりまで行ったら先頭から） */
function emptiesIn(s, from, n) {
  const out = [];
  const f = Math.max(0, from);
  for (let i = f; i < MAX_SLOTS && out.length < n; i++) if (!s[i]) out.push(i);
  for (let i = 0; i < f && i < MAX_SLOTS && out.length < n; i++) if (!s[i]) out.push(i);
  return out;
}

/** チェスト1つの保存の形 */
export function chestParts(c) {
  return { id: c.id, name: c.name, kind: c.kind, slots: c.slots.map((s) => (s ? slim(s) : null)) };
}

function slim(it) {
  return it.t === "c" ? { t: "c", cid: it.cid } : { t: "f", id: it.id, path: it.path, name: it.name, k: it.k, ext: it.ext };
}

function cleanItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.t === "c") return typeof raw.cid === "string" && raw.cid ? { t: "c", cid: raw.cid } : null;
  if (raw.t === "f" && typeof raw.path === "string" && raw.path) {
    const base = raw.path.slice(raw.path.lastIndexOf("\\") + 1);
    const name = typeof raw.name === "string" && raw.name ? raw.name : base;
    const k = raw.k === "d" ? "d" : "f";
    return {
      t: "f",
      id: typeof raw.id === "string" ? raw.id.slice(0, 64) : "",
      path: raw.path.slice(0, 1000),
      name: name.slice(0, 300),
      k,
      ext: k === "d" ? "" : (typeof raw.ext === "string" ? raw.ext.toLowerCase().slice(0, 16) : ""),
    };
  }
  return null;
}

export { cleanItem };
