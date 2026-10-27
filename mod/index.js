// チェスト・ファイラー — チェストがフォルダーのファイラー。マイクラのようなワールドを歩いて、チェストを開く。
// ワールドの見かたは 2 つ。歩く（一人称の 3D。world3d.js）と、俯瞰（斜め上から見る部屋。room.js）。どちらも同じワールドのデータを見る。
// チェストは仮想のフォルダー。入れるのは本物のファイルへの参照だけで、ファイルは動かさない・消さない・書き換えない。
// 本体に頼むのは、開く・フォルダへ移る・参照を引く・名前でさがす・メニューを出す・確かめる、だけ。通信もしない。
// 例外は1つ。本体のメニューで利用者が「名前の変更」を選んだときだけ、名前を入れてもらって変える。
import { World, keyOf, fileItem, refOf } from "./model.js";
import { KINDS, SORTS } from "./consts.js";
import { createStore, loadPrefs, savePrefs } from "./persist.js";
import { createRoom } from "./room.js";
import { createWalk } from "./world3d.js";
import { createGui } from "./gui.js";
import { createAudio } from "./audio.js";
import { chestIcon, barrelIcon } from "./textures.js";
import { spriteUrl, spriteName } from "./sprites.js";
import { fmtSize, fmtDate, typeName, nameMatches, parentPath } from "./text.js";

const ep = window.explorerPlus;
document.head.append(Object.assign(document.createElement("link"), { rel: "stylesheet", href: new URL("./style.css", import.meta.url).href }));

// ---- 状態 ----------------------------------------------------------------
await ep.ready();
let settings = await ep.settings.get();
const prefs = await loadPrefs(ep.storage);
const audio = createAudio();
audio.setEnabled(settings.sound !== false);

const store = createStore(ep.storage, { onError: (err) => say(`保存できませんでした：${err.message}`, "warn") });
let world;
try { world = await store.load(); } catch (err) { console.warn("読み込めませんでした", err.message); world = null; }
if (!world) { world = World.starter(); store.schedule(world); }

let folder = null;                     // 今開いている本物のフォルダ
const meta = new Map();                // 参照の key → 本体の最新の Entry
const missing = new Set();             // 見つからなかった参照
const resolvedAt = new Map();          // チェスト → 最後に引いた時刻
let stack = [];                        // 開いているチェストの道すじ。空なら、持ち物だけ
let guiOpen = false;
let invOnlyMode = false;               // 持ち物だけを開いている
let invFilter = "";
let invDeep = false;
let invHide = prefs.hide;
let deep = null;                       // 下の階層のさがし結果
let invVer = 0;
let invCache = null;
let hot = 0;
let theme = ep.theme || "light";

// ---- 画面 ----------------------------------------------------------------
const rootEl = document.createElement("div");
rootEl.id = "app";
const canvas = document.createElement("canvas");       // 俯瞰
canvas.id = "room";
const glCanvas = document.createElement("canvas");     // 歩く
glCanvas.id = "world";
glCanvas.hidden = true;
rootEl.append(canvas, glCanvas);
document.body.append(rootEl);

const currentCid = () => stack[stack.length - 1] || null;

const app = {
  get world() { return world; },
  currentCid, stack: () => stack, settings: () => settings, view: () => prefs.view,
  folder: () => folder, invFilter: () => invFilter, invDeep: () => invDeep, invHide: () => invHide,
  hot: () => hot, setHot(i) { hot = i; gui.renderHotbar(); },
  inv, iconOf, nameOf, isMissing: (it) => it.t === "f" && missing.has(keyOf(it)),
  storedCount: (k) => world.locate(k).length,
  tipFor, act, drop, quickMove, openItem, menu, search: (t) => world.search(t, 60), reveal, roomHint,
};
const gui = createGui(rootEl, app);

// 部屋でのできごと。俯瞰と歩くの、どちらからも同じ
function openFromRoom(cid) {
  if (stack.length === 1 && stack[0] === cid && guiOpen) closeGui();
  else openStack(world.pathOf(cid), { sound: true });
}
function moveFromRoom(cid, x, y) {
  if (!change("チェストを動かす", () => world.moveChestToRoom(cid, x, y))) return;
  audio.play("move");
  room.pulse(cid);
}
function nestFromRoom(cid, into) {
  const a = world.chest(cid)?.name, b = world.chest(into)?.name;
  if (!change("チェストを入れる", () => world.nestChest(cid, into))) { say("そのチェストには入れられません", "warn"); audio.play("error"); return; }
  audio.play("drop");
  room.pulse(world.pathOf(into)[0]);
  say(`「${a}」を「${b}」に入れました`, "good");
}
function placeNew(x, y) {
  const id = change("チェストを置く", () => world.addChest({ name: "新しいチェスト", x, y }));
  if (!id) { say("部屋がいっぱいです。使わないチェストを、ほかのチェストに入れてください", "warn"); audio.play("error"); return null; }
  audio.play("make");
  openStack([id]);
  room.pulse(id);
  setTimeout(() => gui.focusName(), 30);
  return id;
}

const iso = createRoom(canvas, {
  world: () => world,
  night: () => theme === "dark",
  lights: () => settings.lights !== false,
  onOpen: openFromRoom,
  onContext(cid, e) { roomMenu(cid, e); },
  onMove: moveFromRoom,
  onNest: nestFromRoom,
  onBackground() { if (guiOpen) closeGui(); },
  onHover() {},
  onCamera() { prefs.rot = iso.cam.rot; prefs.zoom = iso.cam.zoom; persistPrefs(); },
});
iso.setCamera({ rot: prefs.rot, zoom: prefs.zoom });

const skyName = () => (["day", "sunset", "night"].includes(settings.sky) ? settings.sky : theme === "dark" ? "night" : "day");
let walk = null;
function makeWalk() {
  walk = createWalk(glCanvas, {
    world: () => world,
    sky: skyName,
    fov: () => Number(settings.fov) || 75,
    quality: () => settings.quality,
    onOpen: openFromRoom,
    onMenu(cid) { roomMenu(cid, { clientX: innerWidth / 2, clientY: innerHeight / 2 }); },
    onMove: moveFromRoom,
    onNest: nestFromRoom,
    onPlace: placeNew,
    onBackground() { if (guiOpen) closeGui(); },
    onHold(cid) { audio.play(cid ? "pick" : "drop"); },
    onLock(l) { rootEl.classList.toggle("locked", l); },
    onStep() { audio.play("step"); },
    say: (t, k) => say(t, k),
  });
  walk.setTyping(() => gui.typing);
}
let room = iso;                                        // いま見ているほう

// ---- 持ち物（今開いている本物のフォルダ） ------------------------------------------
function inv() {
  if (invCache && invCache.ver === invVer) return invCache.v;
  const q = invFilter.trim();
  let entries = folder ? folder.entries : [];
  let note = "";
  if (invDeep && q) {
    if (deep && deep.q === q && folder && deep.path === folder.path) {
      entries = deep.entries;
      note = deep.busy ? "さがしています" : deep.truncated ? `${entries.length}個。多いので、途中までです` : `${entries.length}個見つかりました`;
    } else { entries = []; note = "さがしています"; }
  } else if (q) entries = entries.filter((e) => nameMatches(e.name, q));
  let items = entries.filter((e) => !e.hidden).map(fileItem);
  const shown0 = items.length;
  if (invHide) items = items.filter((it) => !world.locate(keyOf(it)).length);
  if (!note) {
    note = items.length ? `${items.length}個` : q ? "見つかりません" : "空のフォルダです";
    if (invHide && shown0 !== items.length) note += `。入れたもの ${shown0 - items.length}個を隠しています`;
  }
  const v = { items, note };
  invCache = { ver: invVer, v };
  return v;
}
const touchInv = () => { invVer++; };

function nameOf(it) {
  if (it.t === "c") return world.chest(it.cid)?.name ?? "?";
  return meta.get(keyOf(it))?.name ?? it.name;
}

function thumb(u) {
  try { const x = new URL(u); if (x.searchParams.has("size")) x.searchParams.set("size", "96"); return x.href; } catch { return u; }
}

function iconOf(it) {
  if (it.t === "c") return chestIcon(world.chest(it.cid)?.kind || "oak", false);
  const k = keyOf(it);
  if (missing.has(k)) return spriteUrl("missing");
  if (it.k === "d") return barrelIcon();
  const m = meta.get(k);
  if (settings.iconStyle !== "block" && m) {
    if (m.thumbnailUrl) return thumb(m.thumbnailUrl);
    if (m.iconUrl) return m.iconUrl;
  }
  return spriteUrl(spriteName(it.ext));
}

function trailName(cid) { return world.pathOf(cid).map((id) => world.chest(id)?.name ?? "?").join(" › "); }

function tipFor(zone, i, it) {
  const L = [];
  if (it.t === "c") {
    const ch = world.chest(it.cid);
    const st = world.stats(it.cid);
    L.push({ k: "name", t: ch?.name ?? "?" });
    L.push({ k: "dim", t: st.total ? `チェスト 中に${st.total}個` : "チェスト 空" });
    if (zone === "hotbar") L.push({ k: "where", t: trailName(it.cid) });
    L.push({ k: "hint", t: "ダブルクリックで中へ" });
    return L;
  }
  const k = keyOf(it);
  const m = meta.get(k) || null;
  const gone = missing.has(k);
  L.push({ k: "name", t: nameOf(it) });
  if (gone) {
    L.push({ k: "dim", t: it.path });
    L.push({ k: "warn", t: "見つかりません。移したか、消したのかもしれません" });
    L.push({ k: "hint", t: "右クリックで、チェストから出せます" });
    return L;
  }
  const bits = [it.k === "d" ? "本物のフォルダ" : typeName(it.ext)];
  if (m && it.k !== "d" && typeof m.size === "number") bits.push(fmtSize(m.size));
  if (m && m.modified) bits.push(fmtDate(m.modified));
  L.push({ k: "dim", t: bits.join("　") });
  L.push({ k: "dim", t: m?.path || it.path });
  const where = world.locate(k);
  if (zone !== "chest" && where.length) L.push({ k: "where", t: `入っているチェスト　${where.slice(0, 3).map((w) => trailName(w.cid)).join("、")}` });
  L.push({ k: "hint", t: it.k === "d" ? "ダブルクリックで、このフォルダへ" : "ダブルクリックで開く" });
  return L;
}

// ---- 変える ----------------------------------------------------------------
function say(text, kind = "") { gui.say(text, kind); }
const persistPrefs = debounce(() => savePrefs(ep.storage, prefs).catch(() => {}), 500);

/** ワールドを変える。変わったら保存して描きなおす。変わらなければ false */
function change(label, fn) {
  const before = world._snap();
  const r = world.run(label, fn);
  if (world._same(before)) return false;
  afterChange();
  return r === undefined ? true : r;
}

function afterChange({ save = true } = {}) {
  if (stack.length) {
    const k = stack.findIndex((id) => !world.chest(id));
    if (k >= 0) stack = stack.slice(0, k);
    if (stack.length) stack = world.pathOf(stack[stack.length - 1]);
    if (!stack.length && guiOpen && !invOnlyMode) closeGui();
  }
  if (save) store.schedule(world);
  if (invHide) touchInv();
  gui.renderSlots();
  syncRoom();
}

// チェストの画面は、マイクラと同じく、ワールドの上に、画面の中央で重ねる。ワールドの見え方（カメラ）は動かさない
function syncRoom() {
  if (room.setControl) room.setControl(!guiOpen);
  room.setOpen(stack[0] || null);
  gui.show(guiOpen, true, guiOpen);
  gui.layoutRows();
  room.setInset(0, 0);
}

function openStack(path, { sound = false } = {}) {
  const wasOpen = guiOpen;
  const was = stack[0];
  stack = path.filter((id) => world.chest(id));
  invOnlyMode = !stack.length;
  guiOpen = true;
  gui.clearSel();
  gui.renderAll();
  syncRoom();
  if (sound && (!wasOpen || was !== stack[0])) audio.play("open");
  resolveStack();
}

function closeGui() {
  if (!guiOpen) return;
  guiOpen = false;
  stack = [];
  invOnlyMode = false;
  gui.cancelDrag();
  gui.clearSel();
  gui.show(false, false);
  room.setOpen(null);
  room.setInset(0, 0);
  if (room.setControl) room.setControl(true);
  audio.play("close");
}

// ---- 参照を引く（名前が変わっても、ファイルID で見つける） ----------------------------
async function resolveItems(items) {
  const list = items.filter((it) => it && it.t === "f");
  if (!list.length || typeof ep.resolve !== "function") return;
  let changed = false;
  for (let i = 0; i < list.length; i += 200) {
    const part = list.slice(i, i + 200);
    let res;
    try { res = await ep.resolve(part.map(refOf)); } catch (err) { console.warn("参照を引けませんでした", err.message); return; }
    part.forEach((it, j) => {
      const k = keyOf(it);
      const r = res[j];
      if (!r) { if (!missing.has(k)) { missing.add(k); changed = true; } return; }
      if (missing.delete(k)) changed = true;
      meta.set(k, r);
      const patch = { path: r.path, name: r.name, ext: r.ext, k: r.kind === "folder" ? "d" : "f" };
      if (r.id && r.id !== it.id) patch.id = r.id;
      if (world.refreshRef(k, patch)) { changed = true; store.schedule(world); }
    });
  }
  if (changed) { gui.renderSlots(); }
}

function resolveStack() {
  const cid = currentCid();
  const items = cid ? world.chest(cid).slots.filter(Boolean) : [];
  const now = Date.now();
  if (cid && now - (resolvedAt.get(cid) || 0) > 4000) { resolvedAt.set(cid, now); resolveItems(items); }
  resolveItems(world.hotbar.filter(Boolean));
}

// ---- 操作 ----------------------------------------------------------------
async function act(name, arg) {
  const cid = currentCid();
  switch (name) {
    case "new": {
      const c = room.nearestFree ? room.nearestFree() : null;
      placeNew(c ? c.x : undefined, c ? c.y : undefined);
      return;
    }
    case "mode": setMode(prefs.mode === "walk" ? "iso" : "walk"); return;
    case "undo": case "redo": {
      const label = name === "undo" ? world.undo() : world.redo();
      if (!label) return;
      audio.play("undo");
      afterChange();
      resolveStack();
      say(`${name === "undo" ? "元に戻しました" : "やり直しました"}　${label}`);
      return;
    }
    case "rotL": room.rotate(-1); return;
    case "rotR": room.rotate(1); return;
    case "inv": if (guiOpen && invOnlyMode) closeGui(); else openStack([], { sound: true }); return;
    case "help": gui.showHelp(true); return;
    case "helpClose": gui.showHelp(false); return;
    case "up": if (stack.length > 1) openStack(stack.slice(0, -1)); else closeGui(); return;
    case "close": closeGui(); return;
    case "goto": if (!arg) closeGui(); else openStack(world.pathOf(arg)); return;
    case "sort": {
      if (!cid) return;
      const id = await ep.ui.choose(SORTS.map((s) => ({ id: s.id, label: s.name, hint: s.hint })), { title: "整頓" }).catch(() => null);
      if (!id) return;
      change("整頓", () => world.sortChest(cid, id, (it) => (it.t === "f" ? meta.get(keyOf(it)) || {} : {})));
      audio.play("move");
      return;
    }
    case "newSub": {
      if (!cid) return;
      const id = change("チェストを足す", () => world.addChest({ name: "新しいチェスト", parent: cid }));
      if (!id) { say("このチェストはいっぱいです", "warn"); audio.play("error"); return; }
      audio.play("make");
      openStack([...world.pathOf(cid), id]);
      setTimeout(() => gui.focusName(), 30);
      return;
    }
    case "kind": {
      if (!cid) return;
      const id = await ep.ui.choose(KINDS.map((k) => ({ id: k.id, label: k.name })), { title: "チェストの種類" }).catch(() => null);
      if (id && change("種類を変える", () => world.setKind(cid, id))) audio.play("drop");
      return;
    }
    case "destroy": if (cid) await destroy(cid); return;
    case "view": prefs.view = prefs.view === "caption" ? "icon" : "caption"; persistPrefs(); gui.renderAll(); return;
    case "rename": if (cid && change("名前を変える", () => world.rename(cid, arg))) audio.play("drop"); return;
    case "invUp": ep.navigateUp().catch((e) => say(`開けませんでした：${e.message}`, "warn")); return;
    case "invGo": ep.navigate(arg).catch((e) => say(`開けませんでした：${e.message}`, "warn")); return;
    case "invFilter": invFilter = arg; touchInv(); gui.clearSel(); gui.renderInv(); runDeep(); return;
    case "invDeep": invDeep = !!arg; touchInv(); gui.renderInv(); runDeep(); return;
    case "invHide": invHide = !!arg; prefs.hide = invHide; persistPrefs(); touchInv(); gui.renderInv(); return;
    default: console.warn("知らない操作", name);
  }
}

async function destroy(cid) {
  const ch = world.chest(cid);
  if (!ch) return;
  const st = world.stats(cid);
  if (st.total) {
    const ok = await ep.ui.confirm(`「${ch.name}」をこわしますか？\n中に${st.total}個あります。中のチェストも一緒に無くなります。\nファイルそのものは消えません。Ctrl+Z で元に戻せます。`, { okLabel: "こわす" }).catch(() => false);
    if (!ok) return;
  }
  const path = world.pathOf(cid);
  const keep = path.slice(0, path.length - 1);
  if (change("チェストをこわす", () => world.removeChest(cid))) {
    audio.play("break");
    if (keep.length) openStack(keep);
    else closeGui();
    say(`「${ch.name}」をこわしました`);
  }
}

// ---- ドラッグ＆ドロップ -------------------------------------------------------
const nm = (it) => (it.t === "c" ? world.chest(it.cid)?.name ?? "?" : nameOf(it));

function drop(hand, t, { copy = false, x, y } = {}) {
  hand.copy = copy;
  if (t.kind === "room") return dropRoom(hand, x, y);
  let target;
  if (t.kind === "slot") target = t.zone === "chest" ? { zone: "chest", cid: t.cid, slot: t.slot } : { zone: "hotbar", slot: t.slot };
  else if (t.kind === "inv") target = { zone: "inv" };
  else if (t.kind === "crumb" || t.kind === "up") {
    const cid = t.kind === "crumb" ? t.cid : stack.length > 1 ? stack[stack.length - 2] : "";
    if (!cid) return toRoom(hand);
    target = { zone: "into", cid };
  } else return;
  const before = world._snap();
  const res = world.dropHand(hand, target);
  report(hand, target, res, before);
}

function report(hand, target, res, before) {
  if (!res.ok) {
    const why = { dup: "そのチェストには、もう入っています", loop: "チェストは、自分の中には入れられません", hotbar: "ショートカットは、ホットバーの中だけで動かせます", full: "いっぱいで入りません" }[res.reason];
    if (why) { say(why, "warn"); audio.play("error"); }
    return;
  }
  const n = res.placed;
  const first = nm(hand.items[0]);
  const what = n === 1 ? `「${first}」` : `${n}個`;
  let dst = null;
  if (target.zone === "chest") dst = res.into || target.cid;
  else if (target.zone === "into") dst = target.cid;
  if (target.zone === "inv") {
    const inChest = hand.from.some((o) => o.zone === "chest");
    const hasChest = hand.items.some((it) => it.t === "c");
    if (hand.from.every((o) => o.zone === "hotbar")) say(`${what}をホットバーから外しました`);
    else if (inChest) say(hasChest ? `${what}を部屋に出しました` : `${what}をチェストから出しました`);
    audio.play("pick");
  } else if (target.zone === "hotbar") {
    if (hand.from.every((o) => o.zone === "hotbar")) audio.play("move");
    else { say(`${what}をホットバーに入れました`); audio.play("drop"); }
  } else if (dst) {
    const moved = res.moved.length ? `　「${[...new Set(res.moved)].join("」「")}」から移しました` : "";
    const same = hand.from.every((o) => o.zone === "chest" && o.cid === dst);
    if (!same) say(`${what}を「${world.chest(dst)?.name}」に入れました${moved}`, "good");
    audio.play(same ? "move" : "drop");
    room.pulse(world.pathOf(dst)[0]);
    if (res.skipped && res.reason === "dup") say("もう入っているものは、飛ばしました");
    if (res.skipped && res.reason === "full") say("いっぱいで、入らないものがありました", "warn");
  }
  if (world._same(before)) return;
  afterChange();
}

function toRoom(hand) {
  const chests = hand.items.map((it, i) => ({ it, o: hand.from[i] })).filter((x) => x.it.t === "c" && x.o.zone === "chest");
  if (!chests.length) { say("ファイルは、チェストの上に落としてください", "warn"); return; }
  const n = chests.filter(({ it }) => world.parentOf(it.cid) && world.parentOf(it.cid).cid !== null).length;
  if (!n) return;
  change("部屋に出す", () => chests.forEach(({ it }) => world.moveChestToRoom(it.cid)));
  audio.play("move");
  say(`${chests.length === 1 ? `「${nm(chests[0].it)}」` : `${chests.length}個`}を部屋に出しました`);
}

function dropRoom(hand, x, y) {
  const p = room.pointAt(x, y);
  if (!p.inside) return;
  if (p.cid) {
    const before = world._snap();
    const res = world.dropHand(hand, { zone: "into", cid: p.cid });
    report(hand, { zone: "into", cid: p.cid }, res, before);
    return;
  }
  const chests = hand.items.map((it, i) => ({ it, o: hand.from[i] })).filter((z) => z.it.t === "c" && z.o.zone === "chest");
  if (!chests.length || chests.length !== hand.items.length) { say("ファイルは、チェストの上に落としてください", "warn"); audio.play("error"); return; }
  if (change("部屋に出す", () => chests.forEach(({ it }, k) => world.moveChestToRoom(it.cid, p.cell ? p.cell.x + k : undefined, p.cell ? p.cell.y : undefined)))) {
    audio.play("move");
    say(`${chests.length === 1 ? `「${nm(chests[0].it)}」` : `${chests.length}個`}を部屋に出しました`);
  }
}

function roomHint(hand, x, y) {
  if (!hand) { room.setDropHint(null); return; }
  const p = room.pointAt(x, y);
  if (!p.inside) { room.setDropHint(null); return; }
  if (p.cid) { room.setDropHint({ cid: p.cid }); return; }
  const allChests = hand.items.every((it, i) => it.t === "c" && hand.from[i].zone === "chest");
  room.setDropHint(allChests && p.cell ? { cell: p.cell } : null);
}

/** Shift+クリック：持ち物なら、開いているチェストへ。チェストの中なら、出す */
function quickMove(zone, i) {
  const sel = gui.selected();
  const idxs = sel && sel.zone === zone && sel.idxs.includes(i) ? sel.idxs : [i];
  const cid = currentCid();
  if (zone === "inv") {
    if (!cid) { say("先にチェストを開いてください", "warn"); return; }
    const items = idxs.map((k) => inv().items[k]).filter(Boolean);
    const hand = { items, from: items.map(() => ({ zone: "inv" })) };
    const before = world._snap();
    const res = world.dropHand(hand, { zone: "into", cid });
    report(hand, { zone: "into", cid }, res, before);
  } else if (zone === "chest") {
    const c = world.chest(cid);
    const items = idxs.map((k) => c.slots[k]).filter(Boolean);
    const hand = { items, from: idxs.filter((k) => c.slots[k]).map((k) => ({ zone: "chest", cid, slot: k })) };
    const before = world._snap();
    const res = world.dropHand(hand, { zone: "inv" });
    report(hand, { zone: "inv" }, res, before);
  }
}

// ---- 開く ----------------------------------------------------------------
function itemOf(zone, i) {
  if (zone === "chest") return world.chest(currentCid())?.slots[i] || null;
  if (zone === "inv") return inv().items[i] || null;
  if (zone === "hotbar") return world.hotbar[i] || null;
  return null;
}

function openItem(zone, i, rect) {
  const it = itemOf(zone, i);
  if (!it) return;
  if (it.t === "c") { if (world.chest(it.cid)) openStack(world.pathOf(it.cid), { sound: true }); return; }
  const k = keyOf(it);
  if (missing.has(k)) { say(`「${nameOf(it)}」は見つかりません。右クリックで、チェストから出せます`, "warn"); audio.play("error"); return; }
  const m = meta.get(k);
  const ref = refOf(m ? { id: m.id, path: m.path } : it);
  const dir = (m ? m.kind === "folder" : it.k === "d");
  if (dir) { ep.navigate(ref.path).catch((e) => say(`開けませんでした：${e.message}`, "warn")); return; }
  ep.open(ref, { from: rect }).catch((e) => {
    say(e.code === "not-found" ? `「${nameOf(it)}」は見つかりません` : `開けませんでした：${e.message}`, "warn");
    if (e.code === "not-found") { missing.add(k); gui.renderSlots(); }
  });
}

// ---- メニュー --------------------------------------------------------------
async function menu({ zone, i, x, y }) {
  const it = itemOf(zone, i);
  if (!it) return;
  const sel = gui.selected();
  const idxs = zone !== "hotbar" && sel && sel.zone === zone && sel.idxs.includes(i) ? sel.idxs : [i];
  const items = idxs.map((k) => itemOf(zone, k)).filter(Boolean);
  const files = items.filter((a) => a.t === "f" && !missing.has(keyOf(a)));
  const refs = files.map((a) => { const m = meta.get(keyOf(a)); return refOf(m ? { id: m.id, path: m.path } : a); });
  const extra = [];
  const one = items.length === 1;
  if (one && it.t === "c") extra.push({ id: "open", label: "開く" }, { id: "rename", label: "名前を変える" }, { id: "kind", label: "種類を変える" });
  if (one && it.t === "f" && zone !== "inv" && !missing.has(keyOf(it))) extra.push({ id: "where", label: "本物の場所を開く" });
  if (zone === "inv" && currentCid()) extra.push({ id: "put", label: "開いているチェストに入れる" });
  if (zone !== "hotbar" && one) extra.push({ id: "hot", label: "ホットバーに入れる" });
  if (zone === "hotbar") extra.push({ id: "unhot", label: "ホットバーから外す" });
  if (zone === "chest") {
    if (items.some((a) => a.t === "c")) extra.push({ id: "toRoom", label: "部屋に出す" });
    if (items.some((a) => a.t === "f")) extra.push({ id: "out", label: "チェストから出す" });
    if (one && it.t === "c") extra.push({ id: "destroy", label: "こわす" });
  }
  let chosen = null;
  try { ({ chosen } = await ep.showMenu({ x, y, items: refs, extra })); }
  catch { try { ({ chosen } = await ep.showMenu({ x, y, items: [], extra })); } catch { return; } }
  if (!chosen) return;
  const cid = currentCid();
  if (chosen === "open") openItem(zone, i);
  else if (chosen === "rename") { openStack(world.pathOf(it.cid)); setTimeout(() => gui.focusName(), 30); }
  else if (chosen === "kind") { const id = await ep.ui.choose(KINDS.map((k) => ({ id: k.id, label: k.name })), { title: "チェストの種類" }).catch(() => null); if (id) change("種類を変える", () => world.setKind(it.cid, id)); }
  else if (chosen === "where") { const m = meta.get(keyOf(it)); const p = parentPath(m ? m.path : it.path); if (p) ep.navigate(p).catch((e) => say(`開けませんでした：${e.message}`, "warn")); }
  else if (chosen === "put") quickMove("inv", i);
  else if (chosen === "hot") hotSet(it, hot);
  else if (chosen === "unhot") { change("ホットバーから外す", () => world.setHotbar(i, null)); }
  else if (chosen === "toRoom") toRoom({ items, from: idxs.map((k) => ({ zone: "chest", cid, slot: k })) });
  else if (chosen === "out") quickMove("chest", i);
  else if (chosen === "destroy") await destroy(it.cid);
}

async function roomMenu(cid, e) {
  if (cid) {
    const extra = [{ id: "open", label: "開く" }, { id: "rename", label: "名前を変える" }, { id: "kind", label: "種類を変える" }, { id: "destroy", label: "こわす" }];
    const { chosen } = await ep.showMenu({ x: e.clientX, y: e.clientY, items: [], extra }).catch(() => ({ chosen: null }));
    if (chosen === "open") openStack(world.pathOf(cid), { sound: true });
    else if (chosen === "rename") { openStack([cid], { sound: true }); setTimeout(() => gui.focusName(), 30); }
    else if (chosen === "kind") { const id = await ep.ui.choose(KINDS.map((k) => ({ id: k.id, label: k.name })), { title: "チェストの種類" }).catch(() => null); if (id) change("種類を変える", () => world.setKind(cid, id)); }
    else if (chosen === "destroy") await destroy(cid);
    return;
  }
  const p = room.pointAt(e.clientX, e.clientY);
  const { chosen } = await ep.showMenu({ x: e.clientX, y: e.clientY, items: [], extra: [{ id: "new", label: "ここにチェストを置く" }, { id: "reset", label: "部屋の見かたを戻す" }] }).catch(() => ({ chosen: null }));
  if (chosen === "new") {
    const id = change("チェストを置く", () => world.addChest({ name: "新しいチェスト", x: p.cell ? p.cell.x : undefined, y: p.cell ? p.cell.y : undefined }));
    if (id) { audio.play("make"); openStack([id]); setTimeout(() => gui.focusName(), 30); }
  } else if (chosen === "reset") { room.resetView(); room.setRot(0); prefs.rot = 0; persistPrefs(); }
}

function hotSet(it, slot) {
  const res = world.dropHand({ items: [it], from: [{ zone: "inv" }] }, { zone: "hotbar", slot });
  if (res.ok) { afterChange(); say(`「${nm(it)}」をホットバーの${slot + 1}番に入れました`); audio.play("drop"); }
  else if (res.reason === "dup") say("もうホットバーにあります", "warn");
}

// ---- さがす -----------------------------------------------------------------
function reveal(r) {
  const path = world.pathOf(r.cid);
  openStack(path, { sound: true });
  room.flash(path[0]);
  if (r.type === "item") setTimeout(() => gui.flash("chest", r.slot), 60);
}

// 下の階層まで（押したときだけ。数百件まで）
let deepTimer = 0, deepSeq = 0;
function runDeep() {
  clearTimeout(deepTimer);
  const q = invFilter.trim();
  if (!invDeep || !q || !folder) { deep = null; touchInv(); gui.renderInv(); return; }
  deepTimer = setTimeout(async () => {
    const seq = ++deepSeq;
    const f = folder;
    deep = { q, path: f.path, entries: [], busy: true, truncated: false };
    touchInv(); gui.renderInv();
    try {
      const r = await ep.search.find({ id: f.id, path: f.path }, { name: q, hidden: false }, { limit: 600 });
      if (seq !== deepSeq) return;
      deep.entries = r.entries;
      deep.truncated = r.truncated;
      for (const e of r.entries) { const k = keyOf(fileItem(e)); meta.set(k, e); missing.delete(k); }
    } catch (err) {
      if (seq !== deepSeq) return;
      say(err.code === "denied" ? "この場所では、下の階層はさがせません" : `さがせませんでした：${err.message}`, "warn");
    }
    deep.busy = false;
    touchInv(); gui.renderInv();
  }, 350);
}

// ---- 本体からの知らせ -----------------------------------------------------------
ep.onFolder((f) => {
  const same = folder && folder.path === f.path;
  folder = f;
  let renamed = false;
  for (const e of f.entries) {
    const it = fileItem(e);
    const k = keyOf(it);
    meta.set(k, e);
    missing.delete(k);
    // 名前の変更・移動で、チェストの中の参照が古くなっていたら直す
    if (e.id && world.locate(k).length && world.refreshRef(k, { path: e.path, name: e.name, ext: e.ext })) renamed = true;
  }
  if (renamed) { store.schedule(world); gui.renderSlots(); }
  if (!same) {
    invFilter = ""; deep = null; deepSeq++; gui.clearSel();
    // 見てきたフォルダの情報が溜まりすぎないように、チェストに入っていないものは捨てる
    if (meta.size > 8000) {
      const keep = new Set(f.entries.map((e) => keyOf(fileItem(e))));
      for (const k of [...meta.keys()]) if (!keep.has(k) && !world.locate(k).length) meta.delete(k);
    }
  }
  else if (invDeep && invFilter.trim()) runDeep();
  touchInv();
  gui.renderInv();
  // ごみ箱へ送った・移した・名前を変えたものを、チェストの中の表示に反映する
  if (same && guiOpen) { resolvedAt.clear(); resolveStack(); }
});

// 本体のメニューで「名前の変更」を選ぶと、名前の入力を始める合図が届く。本物の名前を変えるのは、ここだけ
async function renameReal(entry) {
  const name = await ep.ui.ask({ label: "新しい名前", value: entry.name, okLabel: "変える" }).catch(() => null);
  if (!name || name === entry.name) return;
  try {
    await ep.rename({ id: entry.id, path: entry.path }, name);
    say(`名前を「${name}」に変えました`, "good");
  } catch (err) {
    say(err.code === "exists" ? "同じ名前のものが、もうあります" : err.code === "invalid" ? "その名前は使えません" : `変えられませんでした：${err.message}`, "warn");
    audio.play("error");
  }
}
ep.onAction(({ action, entry }) => { if (action === "rename" && entry) renameReal(entry); });

ep.onTheme((t) => { theme = t; });
ep.onSettings((next) => {
  settings = next;
  audio.setEnabled(settings.sound !== false);
  gui.renderAll();
  syncRoom();
});

ep.commands.set([
  { id: "new", label: "チェストを置く" },
  { id: "search", label: "チェストの中をさがす" },
  { id: "inv", label: "持ち物を開く" },
  { id: "undo", label: "元に戻す" },
  { id: "redo", label: "やり直す" },
  { id: "view", label: "名前の見せかたを切りかえる" },
  { id: "mode", label: "歩く・俯瞰を切りかえる", hint: "V" },
  { id: "reset", label: "部屋の見かたを戻す", hint: "向きと大きさ" },
  { id: "wipe", label: "ワールドを初期化", hint: "デバッグ用" },
]).catch(() => {});
ep.onCommand(async (id) => {
  if (id === "search") { if (room.release) room.release(); gui.focusSearch(); }
  else if (id === "reset") { room.resetView(); room.setRot(0); prefs.rot = 0; persistPrefs(); }
  else if (id === "mode") act("mode");
  else if (id === "wipe") {
    const ok = await ep.ui.confirm("チェストも、中の参照も、ホットバーも、すべて消してやり直します。\nファイルそのものは消えません。", { okLabel: "初期化する" }).catch(() => false);
    if (!ok) return;
    world = World.starter();
    stack = []; guiOpen = false; invOnlyMode = false;
    store.schedule(world);
    gui.show(false); room.setOpen(null); room.setInset(0, 0);
    gui.renderAll(); touchInv();
    say("ワールドを初期化しました");
  } else act(id);
});

// ---- キー ----------------------------------------------------------------
document.addEventListener("keydown", (e) => {
  if (gui.typing) return;
  if (gui.helpOpen) { if (e.key === "Escape" || e.key === "F1") { gui.showHelp(false); e.preventDefault(); } return; }
  const ctrl = e.ctrlKey || e.metaKey;
  const k = e.key;
  if (k === "Escape") { if (gui.cancelDrag()) { e.preventDefault(); return; } if (guiOpen) { act("up"); e.preventDefault(); } return; }
  if (k === "F1") { gui.showHelp(true); e.preventDefault(); return; }
  if (ctrl && (k === "z" || k === "Z") && !e.shiftKey) { act("undo"); e.preventDefault(); return; }
  if (ctrl && (k === "y" || k === "Y" || ((k === "z" || k === "Z") && e.shiftKey))) { act("redo"); e.preventDefault(); return; }
  if (ctrl && (k === "f" || k === "F")) { if (room.release) room.release(); gui.focusSearch(); e.preventDefault(); return; }
  if (ctrl && (k === "a" || k === "A") && guiOpen) {
    const h = gui.hover;
    gui.selectAll(h && h.zone === "inv" ? "inv" : currentCid() ? "chest" : "inv");
    e.preventDefault();
    return;
  }
  if (ctrl) return;
  if (k === "/") { if (room.release) room.release(); gui.focusSearch(); e.preventDefault(); return; }
  if (k === "e" || k === "E") { act("inv"); e.preventDefault(); return; }
  if (k === "F2") {
    const sel = gui.selected();
    const one = sel && sel.zone === "inv" && sel.idxs.length === 1 ? inv().items[sel.idxs[0]] : null;
    if (one) { const m = meta.get(keyOf(one)); if (m) renameReal(m); }
    else if (currentCid()) gui.focusName();
    e.preventDefault();
    return;
  }
  if (k === "ArrowLeft" && !guiOpen && room.kind !== "walk") { room.rotate(-1); e.preventDefault(); return; }
  if (k === "ArrowRight" && !guiOpen && room.kind !== "walk") { room.rotate(1); e.preventDefault(); return; }
  if (k === "v" || k === "V") { act("mode"); e.preventDefault(); return; }
  if ((k === "r" || k === "R") && room.kind === "walk" && !guiOpen) { room.resetView(); e.preventDefault(); return; }
  if ((k === "q" || k === "Q") && room.cancelHold) { room.cancelHold(); e.preventDefault(); return; }
  if ((k === "f" || k === "F") && room.menu && !guiOpen) { room.menu(); e.preventDefault(); return; }
  if ((k === "Delete" || k === "Backspace") && guiOpen) {
    const sel = gui.selected();
    if (sel && sel.zone === "chest" && sel.idxs.length) {
      const cid = currentCid();
      const c = world.chest(cid);
      const hand = { items: sel.idxs.map((n) => c.slots[n]), from: sel.idxs.map((n) => ({ zone: "chest", cid, slot: n })) };
      const before = world._snap();
      const res = world.dropHand(hand, { zone: "inv" });
      report(hand, { zone: "inv" }, res, before);
      e.preventDefault();
    }
    return;
  }
  if (k === "Enter" && guiOpen) {
    const sel = gui.selected();
    if (sel && sel.idxs.length === 1) { openItem(sel.zone, sel.idxs[0]); e.preventDefault(); }
    return;
  }
  if (/^[1-9]$/.test(k)) {
    const n = Number(k) - 1;
    const h = gui.hover;
    const it = h && h.zone !== "hotbar" ? itemOf(h.zone, h.i) : null;
    if (guiOpen && it) hotSet(it, n);
    else if (guiOpen && h && h.zone === "hotbar") { hot = n; gui.renderHotbar(); }
    else { hot = n; gui.renderHotbar(); if (world.hotbar[n]) openItem("hotbar", n); }
    e.preventDefault();
  }
});

window.addEventListener("resize", () => { gui.renderAll(); syncRoom(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) store.flush(); });
window.addEventListener("pagehide", () => { store.flush(); });

// ---- 見かた（歩く・俯瞰） --------------------------------------------------------
const modeBtn = () => rootEl.querySelector('[data-act="mode"]');
function setMode(mode) {
  if (mode === "walk" && !walk) {
    try { makeWalk(); }
    catch (err) { console.warn("3D を始められませんでした", err); say("この環境では、3D の表示を始められません。俯瞰で見せます", "warn"); mode = "iso"; }
  }
  const was = prefs.mode;
  prefs.mode = mode;
  if (was !== mode) persistPrefs();
  const w = mode === "walk";
  rootEl.classList.toggle("walk", w);
  canvas.hidden = w;
  iso.setPaused(w);
  if (walk) walk.setActive(w);
  room = w ? walk : iso;
  if (!w) rootEl.classList.remove("locked");
  const b = modeBtn();
  if (b) { b.textContent = w ? "俯瞰" : "歩く"; b.title = w ? "斜め上からの見かたにする。V" : "ワールドの中を歩く。V"; }
  syncRoom();
  room.snapInset();
}

// ---- はじまり ----------------------------------------------------------------
gui.renderAll();
setMode(prefs.mode === "iso" ? "iso" : "walk");
resolveItems(world.hotbar.filter(Boolean));
if (!prefs.seen) {
  prefs.seen = true;
  persistPrefs();
  if (room.kind === "walk") say("クリックして、ワールドに入ります。WASD で歩きます。", "good");
  else say("部屋のチェストをクリックで開きます。", "good");
  say(room.kind === "walk" ? "チェストは、右クリックで開きます。" : "下の持ち物のファイルを、チェストへドラッグして入れます。");
  say("入れても、本物のファイルは動きません。");
}

// 試験の道具から中を見る
if (new URL(import.meta.url).searchParams.has("debug")) {
  window.__cf = {
    get world() { return world; }, set world(w) { world = w; }, get stack() { return stack; }, get guiOpen() { return guiOpen; },
    get folder() { return folder; }, meta, missing, get room() { return room; }, get iso() { return iso; }, get walk() { return walk; }, setMode, gui, store, prefs, inv, act, openStack, closeGui, drop, quickMove, openItem, change, afterChange,
    get hot() { return hot; }, settings: () => settings, audio,
  };
}

function debounce(fn, ms) {
  let t = 0;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
