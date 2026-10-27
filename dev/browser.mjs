// 本物の index.js を、ヘッドレスの Edge で動かして、画面を撮る・操作する（偽の explorerPlus と、メモリの中のフォルダを渡す）。
//   使い方：node chest-filer/dev/browser.mjs [出力フォルダ] [--scenario=look|flow|nest|host|edge] [--w=1280 --h=760] [--dpr=1]
//   出力フォルダに PNG を書く。ok / NG を出し、ひとつでも NG なら終了コードが 1 になる
import os from "node:os";
import path from "node:path";
import { launch } from "./cdp.mjs";
import { walkScenarios } from "./walk-scenarios.mjs";

const args = process.argv.slice(2);
const outDir = path.resolve(args.find((a) => !a.startsWith("--")) || path.join(os.tmpdir(), "cf-shots"));
const opt = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.slice(2).split("="); return [k, v ?? true]; }));
const scenario = opt.scenario || "look";
const W = Number(opt.w || 1280), H = Number(opt.h || 760);

// ページ：偽のフォルダに種をまいて、保存済みのワールドを用意してから、本物の index.js を読む。設定は # の後ろの JSON
const HARNESS = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
<script type="module">
import { createFakeFs, createFakeEp } from "/dev/fake-host.mjs";
import { seedFs, seedWorld, DOCS, HOME } from "/dev/seed.mjs";
import { World } from "/mod/model.js";
const cfg = JSON.parse(decodeURIComponent(location.hash.slice(1) || "{}"));
// 偽のポインターロック：固定したふりをして pointerlockchange を送る
(() => {
  let locked = null;
  Object.defineProperty(document, "pointerLockElement", { get: () => locked, configurable: true });
  document.exitPointerLock = () => { if (locked) { locked = null; document.dispatchEvent(new Event("pointerlockchange")); } };
  Element.prototype.requestPointerLock = function (o) {
    (window.__log = window.__log || []).push("lock");
    if (cfg.nolock) { document.dispatchEvent(new Event("pointerlockerror")); return Promise.reject(new Error("denied")); }
    if (locked !== this) { locked = this; document.dispatchEvent(new Event("pointerlockchange")); }
    return Promise.resolve();
  };
})();
const fsys = createFakeFs();
seedFs(fsys);
window.__fs = fsys;
window.__log = window.__log || [];
const storage = [];
if (cfg.world !== false) {
  const parts = seedWorld(World, fsys).toParts();
  storage.push(["w", parts.meta]);
  for (const [id, c] of Object.entries(parts.chests)) storage.push(["c." + id, c]);
}
{
  const p0 = { mode: cfg.walk ? "walk" : "iso", ...(cfg.prefs || {}) };
  if (cfg.walk) p0.mode = "walk";
  storage.push(["prefs", p0]);
}
if (cfg.corrupt) { storage.length = 0; storage.push(["w", cfg.corrupt === "garbage" ? "ぬ" : { v: 1, ids: ["c1", "c2"], room: [{ c: "c1", x: 1, y: 1 }, { c: "c9", x: 2, y: 2 }], hotbar: "x" }]); storage.push(["c.c1", { id: "c1", name: "生き残り", kind: "oak", slots: [null, 5, { t: "f", path: "C:\\\\x.txt" }] }]); }
if (cfg.big) { fsys.mkdirp("C:\\\\Big"); for (let i = 0; i < cfg.big; i++) fsys.add("C:\\\\Big\\\\file" + String(i).padStart(5, "0") + ".txt"); }
const menuChoice = cfg.menu ? (extra, items) => { window.__menuSeen = { extra: extra.map((x) => x.id), items: items.length }; return extra.some((x) => x.id === cfg.menu) ? cfg.menu : null; } : (extra, items) => { window.__menuSeen = { extra: extra.map((x) => x.id), items: items.length }; return null; };
window.explorerPlus = createFakeEp(fsys, cfg.cwd || DOCS, {
  log: window.__log, storage, theme: cfg.theme || "light", settings: cfg.settings || {}, menuChoice,
  choose: cfg.choose ? () => cfg.choose : null, confirm: cfg.confirm !== false, menuDeny: !!cfg.menuDeny, storageLimit: cfg.storageLimit,
  failWrite: cfg.failWrite ? (k) => k.startsWith("c.") : null, ask: cfg.ask,
});
await import("/mod/index.js?debug");
window.__ready = !!window.__cf;
</script></body></html>`;

const cdp = await launch({ html: HARNESS, w: W, h: H, dpr: Number(opt.dpr || 1), outDir });
const { ev, sleep, shot, check, count, center } = cdp;

const READY = "!!window.__ready && !!window.__cf.folder";
const boot = (cfg = {}) => cdp.boot(cfg, READY);
const cf = (expr) => ev(`(() => { const cf = window.__cf; return ${expr}; })()`);
const chestByName = (name) => cf(`cf.world.room.map((r) => cf.world.chest(r.cid)).find((c) => c.name === ${JSON.stringify(name)})?.id`);
const names = (cid) => cf(`cf.world.chest(${JSON.stringify(cid)}).slots.map((s) => s ? (s.t === "c" ? "[" + cf.world.chest(s.cid).name + "]" : s.name) : null)`);
/** 部屋のチェストの画面上の位置 */
const chestPos = async (cid) => { const p = await cf(`cf.room.chestScreen(${JSON.stringify(cid)})`); const r = await ev(`(() => { const r = document.getElementById("room").getBoundingClientRect(); return { x: r.left, y: r.top }; })()`); return { x: p.x + r.x, y: p.y + r.y }; };
const openChest = async (name) => {
  const id = await chestByName(name);
  const p = await chestPos(id);
  await cdp.click(p.x, p.y);
  await sleep(450);
  return id;
};
const slotPos = async (zone, i) => {
  const sel = zone === "chest" ? ".chest-grid" : zone === "inv" ? ".inv-grid" : ".hotbar";
  return ev(`(() => { const box = document.querySelector(${JSON.stringify(sel)}); const el = box.querySelector('.slot[data-i="${i}"]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
};
/** 持ち物の中の、名前で探した番号 */
const invIndex = (name) => cf(`cf.inv().items.findIndex((it) => it.name === ${JSON.stringify(name)})`);
const invSlot = async (name) => {
  const i = await invIndex(name);
  if (i < 0) throw new Error(`持ち物に無い ${name}`);
  await cf(`(cf.gui.invGrid.reveal(${i}), 0)`);
  await sleep(60);
  return slotPos("inv", i);
};
const chestSlot = async (i) => {
  await cf(`(cf.gui.chestGrid.reveal(${i}), 0)`);
  await sleep(60);
  return slotPos("chest", i);
};
const CTRL = 2, SHIFT = 8;
const dump = (cid) => cf(`JSON.stringify(window.explorerPlus.__store.get("c." + ${JSON.stringify(cid)}))`).then((s) => (s ? JSON.parse(s) : null));
const treeOk = () => cf(`cf.world.check()`);

const SCENARIOS = {
  /** 見た目：部屋・チェストの画面・入れ子・持ち物だけ・夜・名前を隠した版・狭い画面 */
  async look() {
    await boot({});
    check(await cf(`cf.world.chestCount`) >= 8, "保存済みのワールドを読む");
    check(await count("#room") === 1, "部屋の canvas がある");
    await sleep(500);
    await shot("look-1-room");
    await openChest("しごと");
    check(await cf(`cf.guiOpen && cf.stack.length === 1`), "チェストをクリックで開く");
    await sleep(600);
    await shot("look-2-chest");
    const sub = await ev(`[...document.querySelectorAll(".chest-grid .slot.has")].findIndex((e) => e.querySelector(".cnt"))`);
    check(sub >= 0, "中のチェストが、数つきで見える");
    const sp = await slotPos("chest", await ev(`Number([...document.querySelectorAll(".chest-grid .slot.has")].find((e) => e.querySelector(".cnt")).dataset.i)`));
    await cdp.dblclick(sp.x, sp.y);
    await sleep(500);
    check(await cf(`cf.stack.length === 2`), "ダブルクリックで、中のチェストへ");
    await shot("look-3-nested");
    await cdp.key("e");
    await sleep(400);
    check(await cf(`cf.guiOpen && cf.stack.length === 0`), "E で持ち物だけを開く");
    await shot("look-4-inventory");
    await cdp.key("Escape");
    await sleep(300);
    await boot({ theme: "dark" });
    await openChest("しゃしん");
    await sleep(700);
    await shot("look-5-night");
    await boot({ prefs: { view: "icon", rot: 1, zoom: 1, hide: false, seen: true } });
    await openChest("しごと");
    await sleep(500);
    await shot("look-6-icon-mode");
    await boot({ w: 560, h: 800, prefs: { view: "caption", rot: 0, zoom: 1, hide: false, seen: true } });
    await openChest("しごと");
    await sleep(500);
    await shot("look-7-narrow");
    check(await ev(`document.querySelector(".panel").getBoundingClientRect().right <= innerWidth`), "狭い画面でも、チェストの画面がはみ出さない");
  },

  /** 操作：ドラッグ・入れかえ・チェストの上に落とす・複数・Shift・元に戻す・見出しに落とす・部屋・名前・保存 */
  async flow() {
    await boot({ prefs: { view: "caption", rot: 0, zoom: 1, hide: false, seen: true } });
    const photo = await openChest("しゃしん");
    check((await names(photo)).join() === "旅行 01.jpg,旅行 02.jpg,旅行 03.jpg,旅行 04.jpg,[旅行]", "しゃしんの中身が読める");

    // 1. 持ち物から、空いたスロットへ
    let a = await invSlot("ロゴ案.png");
    let b = await chestSlot(7);
    await cdp.drag(a.x, a.y, b.x, b.y);
    await sleep(250);
    check((await names(photo))[7] === "ロゴ案.png", "持ち物のファイルを、チェストの空いたスロットへドラッグして入れられる");
    check(await ev(`!!document.querySelector('.inv-grid .slot[data-i="${await invIndex("ロゴ案.png")}"] .mark')`), "入れたファイルには、持ち物の側に印が付く");
    check((await cf(`window.__fs.get("C:\\\\Users\\\\me\\\\Documents\\\\ロゴ案.png") !== undefined`)), "本物のファイルはそのまま");

    // 2. チェストの中で動かす
    a = await chestSlot(7); b = await chestSlot(8);
    await cdp.drag(a.x, a.y, b.x, b.y);
    await sleep(250);
    let n = await names(photo);
    check(n[7] === null && n[8] === "ロゴ案.png", "チェストの中で、別のスロットへ動かせる");

    // 3. 中身のあるスロットへ：入れかえ
    a = await chestSlot(0); b = await chestSlot(1);
    await cdp.drag(a.x, a.y, b.x, b.y);
    await sleep(250);
    n = await names(photo);
    check(n[0] === "旅行 02.jpg" && n[1] === "旅行 01.jpg", "中身のあるスロットとは、入れかえる");

    // 4. チェストの絵の上に落とす：中へ入る。ほかのチェストにあったファイルは移る
    a = await invSlot("メモ.txt"); b = await chestSlot(4);
    await cdp.drag(a.x, a.y, b.x, b.y);
    await sleep(250);
    const trip = await cf(`cf.world.chest(cf.world.chest(${JSON.stringify(photo)}).slots[4].cid).slots.map((s) => s && s.name)`);
    check(trip[0] === "メモ.txt", "チェストの絵の上に落とすと、そのチェストの中へ入る");
    const later = await chestByName("あとで見る");
    check(!(await names(later)).includes("メモ.txt"), "別のチェストにあったファイルは、移る");
    check(await ev(`[...document.querySelectorAll(".chat .line")].some((l) => l.textContent.includes("あとで見る") && l.textContent.includes("移しました"))`), "どこから移したかを知らせる");

    // 5. Ctrl+クリックで2つ選んで、いっしょにドラッグ
    a = await invSlot("議事録 0412.txt");
    await cdp.click(a.x, a.y);
    const a2 = await invSlot("議事録 0510.txt");
    await cdp.click(a2.x, a2.y, { modifiers: CTRL });
    check(await ev(`document.querySelectorAll(".inv-grid .slot.sel").length`) === 2, "Ctrl+クリックで、複数を選べる");
    b = await chestSlot(12);
    await cdp.drag(a2.x, a2.y, b.x, b.y);
    await sleep(250);
    n = await names(photo);
    check(n[12] === "議事録 0412.txt" && n[13] === "議事録 0510.txt", "選んだものを、まとめて入れられる");

    // 6. Shift+クリック：持ち物から、すぐ入れる
    a = await invSlot("顧客リスト.csv");
    await cdp.click(a.x, a.y, { modifiers: SHIFT });
    await sleep(250);
    check((await names(photo)).includes("顧客リスト.csv"), "Shift+クリックで、開いているチェストにすぐ入る");
    // チェストの中を Shift+クリック：出す
    const at = (await names(photo)).indexOf("顧客リスト.csv");
    a = await chestSlot(at);
    await cdp.click(a.x, a.y, { modifiers: SHIFT });
    await sleep(250);
    check(!(await names(photo)).includes("顧客リスト.csv"), "チェストの中を Shift+クリックすると、出る");

    // 7. 元に戻す
    const before = await names(photo);
    await cdp.key("z", { mods: CTRL });
    await sleep(200);
    check((await names(photo)).includes("顧客リスト.csv"), "Ctrl+Z で、出したものが戻る");
    await cdp.key("y", { mods: CTRL });
    await sleep(200);
    check((await names(photo)).join() === before.join(), "Ctrl+Y で、やり直せる");
    check((await treeOk()).length === 0, "ここまでで、木の決まりが保たれている");

    // 8. 見出しに落とす：「ワールド」に落とすと部屋へ出る
    await cdp.key("Escape");   // チェストの画面は中央に重なるので、先に閉じてから、次のチェストを開く
    await sleep(300);
    await openChest("しごと");
    const sub = await cf(`cf.world.chest(cf.world.room.map((r) => r.cid).find((id) => cf.world.chest(id).name === "しごと")).slots.findIndex((s) => s && s.t === "c")`);
    a = await chestSlot(sub);
    const crumb = await center(".crumb[data-cid='']");
    const roomBefore = await cf(`cf.world.room.length`);
    await cdp.drag(a.x, a.y, crumb.x, crumb.y);
    await sleep(300);
    check(await cf(`cf.world.room.length`) === roomBefore + 1, "チェストを「ワールド」の見出しに落とすと、部屋に出る");
    check((await treeOk()).length === 0, "木の決まりが保たれている");

    // 9. 名前を変える
    const work = await chestByName("しごと");
    await cdp.click(...Object.values(await center(".c-name")).slice(0, 2));
    await ev(`(() => { const i = document.querySelector(".c-name"); i.select(); })()`);
    await cdp.type("お仕事");
    await cdp.key("Enter");
    await sleep(300);
    check(await cf(`cf.world.chest(${JSON.stringify(work)}).name`) === "お仕事", "チェストの名前を、画面の入力で変えられる");
    await cf(`cf.store.flush()`);
    await sleep(200);
    check((await dump(work))?.name === "お仕事", "名前が保存される");
    check((await dump(photo)).slots.some((s) => s && s.name === "ロゴ案.png"), "チェストの中身が保存される");
    await cdp.key("z", { mods: CTRL });
    await sleep(150);
    check(await cf(`cf.world.chest(${JSON.stringify(work)}).name`) === "しごと", "名前の変更も、元に戻せる");

    await shot("flow-1-after");
  },

  /** 歩く：最初の画面を見る */
  async walkLook() {
    await boot({ walk: true, prefs: { mode: "walk", seen: true } });
    await cf(`cf.room.buildAll()`);
    await sleep(800);
    await shot("walk-1-pause");
    await cdp.click(640, 380);
    await sleep(500);
    await cf(`(cf.room.look(0, 0), 0)`);
    await sleep(600);
    await shot("walk-2-hall");
  },

  /** 部屋：動かす・重ねて入れる・向き・拡大・ずらす・ファイルを部屋のチェストへ・右クリック・ホットバー・検索 */
  async room() {
    await boot({ prefs: { view: "caption", rot: 0, zoom: 1, hide: false, seen: true } });
    const roomPos = (x, y) => cf(`(() => { const p = cf.room.cellScreen(${x}, ${y}); const r = document.getElementById("room").getBoundingClientRect(); return { x: p.x + r.left, y: p.y + r.top }; })()`);
    const docs = await chestByName("資料"), secret = await chestByName("秘密"), later = await chestByName("あとで見る");

    // 動かす
    let a = await chestPos(docs);
    let b = await roomPos(0, 7);
    await cdp.drag(a.x, a.y, b.x, b.y);
    await sleep(300);
    check(await cf(`JSON.stringify(cf.world.room.find((r) => r.cid === ${JSON.stringify(docs)}))`) === JSON.stringify({ cid: docs, x: 0, y: 7 }), "チェストをドラッグして、空いた升へ動かせる");
    check(!(await cf(`cf.guiOpen`)), "ドラッグしただけでは、開かない");

    // 重ねて入れる
    a = await chestPos(docs); b = await chestPos(secret);
    await cdp.drag(a.x, a.y, b.x, b.y);
    await sleep(300);
    check(await cf(`cf.world.parentOf(${JSON.stringify(docs)}).cid`) === secret, "チェストを別のチェストに重ねると、中へ入る");
    check(await cf(`cf.world.room.every((r) => r.cid !== ${JSON.stringify(docs)})`), "部屋からは消える");
    await cdp.key("z", { mods: CTRL });
    await sleep(200);
    check(await cf(`cf.world.room.some((r) => r.cid === ${JSON.stringify(docs)})`), "元に戻すと、部屋に戻る");

    // 向きを変えても、同じチェストが開く
    await cdp.click(...Object.values(await center('[data-act="rotR"]')).slice(0, 2));
    await sleep(300);
    check(await cf(`cf.room.cam.rot`) === 1, "右に回すと、向きが変わる");
    await shot("room-1-rotated");
    const lp = await chestPos(later);
    await cdp.click(lp.x, lp.y);
    await sleep(400);
    check(await cf(`cf.stack[0]`) === later, "向きを変えたあとも、見えているチェストが開く");
    await cdp.click(...Object.values(await center('[data-act="rotL"]')).slice(0, 2));
    await sleep(200);

    // 拡大・ずらす・空の床をクリックで閉じる
    const z0 = await cf(`cf.room.cam.zoom`);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 300, y: 300, deltaX: 0, deltaY: -300 });
    await sleep(200);
    check(await cf(`cf.room.cam.zoom`) > z0, "ホイールで、部屋を拡大できる");
    await cdp.drag(150, 520, 120, 560);
    await sleep(200);
    check(await cf(`cf.room.cam.panX !== 0 || cf.room.cam.panY !== 0`), "空いた所をドラッグして、部屋をずらせる");
    check(await cf(`cf.guiOpen`), "ずらしただけでは、画面は閉じない");
    await cdp.click(60, 600);
    await sleep(300);
    check(!(await cf(`cf.guiOpen`)), "空いた床をクリックすると、チェストの画面が閉じる");
    await cdp.click(...Object.values(await center('[data-act="inv"]')).slice(0, 2));
    await sleep(200);
    await cf(`(cf.room.resetView(), cf.room.setRot(0), 0)`);
    await sleep(200);

    // ファイルを、部屋のチェストに直接落とす
    await openChest("あとで見る");
    // チェストの画面は中央に重なる。部屋のチェストが隠れないように、部屋を左へずらす
    await cf(`(cf.room.cam.panX = -440, 0)`);
    await sleep(400);
    const target = await chestByName("秘密");
    const f = await invSlot("名刺データ.csv");
    const tp = await chestPos(target);
    check(await ev(`document.elementFromPoint(${tp.x}, ${tp.y}).id`) === "room", "落とす先の部屋のチェストが、画面の枠に隠れていない");
    await cdp.drag(f.x, f.y, tp.x, tp.y);
    await sleep(300);
    check((await names(target)).includes("名刺データ.csv"), "ファイルを、部屋のチェストに直接落とせる");

    // 右クリック：チェストのメニューから、こわす
    await boot({ menu: "destroy", prefs: { view: "caption", rot: 0, zoom: 1, hide: false, seen: true } });
    const w2 = await chestByName("資料");
    const wp = await chestPos(w2);
    const n0 = await cf(`cf.world.chestCount`);
    await cdp.rightClick(wp.x, wp.y);
    await sleep(500);
    check(await cf(`cf.world.chestCount`) === n0 - 1, "部屋のチェストを右クリックして、こわせる");
    check(await ev(`window.__log.some((l) => l.startsWith("confirm "))`) === false, "空のチェストは、確かめずにこわす");
    // 中身のあるチェストは、確かめてから
    await boot({ menu: "destroy", confirm: false, prefs: { view: "caption", rot: 0, zoom: 1, hide: false, seen: true } });
    const w3 = await chestByName("しごと");
    const n3 = await cf(`cf.world.chestCount`);
    await cdp.rightClick(...Object.values(await chestPos(w3)));
    await sleep(500);
    check(await ev(`window.__log.some((l) => l.startsWith("confirm "))`) && await cf(`cf.world.chestCount`) === n3, "中身のあるチェストは、確かめてから。やめれば残る");
    await boot({ menu: "kind", choose: "ender", prefs: { view: "caption", rot: 0, zoom: 1, hide: false, seen: true } });
    const w4 = await chestByName("しごと");
    await cdp.rightClick(...Object.values(await chestPos(w4)));
    await sleep(500);
    check(await cf(`cf.world.chest(${JSON.stringify(w4)}).kind`) === "ender", "メニューから、チェストの種類を変えられる");

    // 部屋の空いた所の右クリックで、チェストを置く
    await boot({ menu: "new", prefs: { view: "caption", rot: 0, zoom: 1, hide: false, seen: true } });
    const rp = await roomPos(1, 1);
    const n5 = await cf(`cf.world.chestCount`);
    await cdp.rightClick(rp.x, rp.y);
    await sleep(500);
    check(await cf(`cf.world.chestCount`) === n5 + 1, "空いた所を右クリックして、チェストを置ける");
    check(await cf(`cf.world.room.some((r) => r.x === 1 && r.y === 1)`), "押した升に置かれる");
    check(await cf(`cf.guiOpen && cf.stack.length === 1`) && await ev(`document.activeElement === document.querySelector(".c-name")`), "置いたら開いて、名前を入れる欄にカーソルが入る");
    await cdp.type("おろしたて");
    await cdp.key("Enter");
    await sleep(200);
    check(await cf(`cf.world.chest(cf.stack[0]).name`) === "おろしたて", "続けて名前を入れられる");
    await shot("room-2-new-chest");
  },

  /** ホットバーと検索 */
  async hotbar() {
    await boot({ prefs: { view: "caption", rot: 0, zoom: 1, hide: false, seen: true } });
    // 数字キーで開く
    await cdp.key("2");
    await sleep(400);
    check(await cf(`cf.guiOpen && cf.world.chest(cf.stack[0]).name === "しごと"`), "数字キーで、ホットバーのチェストが開く");
    await cdp.key("Escape");
    await sleep(300);
    check(!(await cf(`cf.guiOpen`)), "Esc で閉じる");
    await cdp.key("1");
    await sleep(300);
    check(await ev(`window.__log.some((l) => l === "open 企画書 新製品.pptx")`), "数字キーで、ホットバーのファイルを本物のアプリで開く");
    await cdp.key("3");
    await sleep(500);
    check(await ev(`window.explorerPlus.__cwd().endsWith("\\\\仕事")`), "ホットバーのフォルダで、このタブがそのフォルダへ移る");
    check(await cf(`cf.inv().items.some((it) => it.name === "旧 見積書.xlsx")`), "持ち物が、移った先の中身になる");

    // スロットの上で数字キー：ホットバーに登録
    await openChest("しゃしん");
    const p = await chestSlot(0);
    await cdp.move(p.x, p.y);
    await sleep(150);
    await cdp.key("5");
    await sleep(250);
    check(await cf(`cf.world.hotbar[4]?.name === "旅行 01.jpg"`), "スロットの上で数字キーを押すと、ホットバーに登録される");
    check(await cf(`cf.world.chest(cf.stack[0]).slots[0]?.name === "旅行 01.jpg"`), "元のチェストには残る");

    // ホットバーの中で動かす・外す
    let a = await slotPos("hotbar", 4), b = await slotPos("hotbar", 7);
    await cdp.drag(a.x, a.y, b.x, b.y);
    await sleep(250);
    check(await cf(`!cf.world.hotbar[4] && cf.world.hotbar[7]?.name === "旅行 01.jpg"`), "ホットバーの中で、並べかえられる");
    a = await slotPos("hotbar", 7); b = await invSlot("引き継ぎ資料.pdf");
    await cdp.drag(a.x, a.y, b.x, b.y);
    await sleep(250);
    check(await cf(`!cf.world.hotbar[7]`), "持ち物の所へ落とすと、ホットバーから外れる");

    // ホットバーのものは、チェストの中へは落とせない
    a = await slotPos("hotbar", 0); b = await chestSlot(10);
    const before = await names(await cf(`cf.stack[0]`));
    await cdp.drag(a.x, a.y, b.x, b.y);
    await sleep(250);
    check((await names(await cf(`cf.stack[0]`))).join() === before.join(), "ホットバーのショートカットは、チェストへは落とせない");
    check(await ev(`[...document.querySelectorAll(".chat .line")].some((l) => l.textContent.includes("ホットバーの中だけ"))`), "理由を知らせる");

    // 検索
    await cdp.key("Escape");
    await sleep(200);
    await cdp.key("/");
    await sleep(200);
    check(await ev(`document.activeElement === document.querySelector(".search input")`), "/ で検索の欄に入る");
    await cdp.type("見積");
    await sleep(300);
    check(await count(".results .res") === 3, "名前の一部で、チェストの中のファイルが見つかる。どのチェストの中かも出る");
    await shot("hotbar-1-search");
    await cdp.key("ArrowDown");
    await cdp.key("ArrowDown");
    await cdp.key("Enter");
    await sleep(500);
    check(await cf(`cf.guiOpen && cf.stack.length >= 1`), "見つけたものを選ぶと、そのチェストが開く");
    check(await count(".chest-grid .slot.flash") === 1, "見つけたスロットが光る");
  },

  /** 本体とのやりとり：見つからない参照・名前の変更・フォルダを移る・下の階層・メニュー・開く・設定 */
  async host() {
    const PREFS = { view: "caption", rot: 0, zoom: 1, hide: false, seen: true };
    await boot({ prefs: PREFS });
    // 見つからない参照
    await ev(`window.__fs.remove("C:\\\\Users\\\\me\\\\Documents\\\\見積書 最終版.xlsx")`);
    await openChest("しごと");
    await sleep(500);
    check(await cf(`cf.missing.size`) === 1, "消えたファイルは、見つからない参照になる");
    check(await count(".chest-grid .slot.missing") === 1, "そのスロットに、見つからない印が付く");
    const gone = await cf(`cf.world.chest(cf.stack[0]).slots.findIndex((s) => s && s.name === "見積書 最終版.xlsx")`);
    let p = await chestSlot(gone);
    await cdp.dblclick(p.x, p.y);
    await sleep(250);
    check(await ev(`[...document.querySelectorAll(".chat .line.warn")].some((l) => l.textContent.includes("見つかりません"))`), "見つからないものを開こうとすると、知らせる");
    check(await ev(`!window.__log.some((l) => l.startsWith("open "))`), "本体には、開くよう頼まない");
    await cdp.move(p.x, p.y);
    await sleep(250);
    check(await ev(`document.querySelector(".tip").textContent.includes("見つかりません")`), "ふきだしにも出る");
    await shot("host-1-missing");

    // 名前の変更：ファイルID で追いかける
    await boot({ prefs: PREFS });
    const ws = await chestByName("しごと");
    await ev(`window.__fs.rename("C:\\\\Users\\\\me\\\\Documents\\\\売上集計.xlsx", "売上まとめ.xlsx")`);
    await sleep(400);
    check(await cf(`cf.world.chest(${JSON.stringify(ws)}).slots.some((s) => s && s.name === "売上まとめ.xlsx" && s.path.endsWith("売上まとめ.xlsx"))`), "本物の名前が変わると、チェストの中の参照も追いかける");
    await cf(`cf.store.flush()`);
    await sleep(200);
    check((await dump(ws)).slots.some((s) => s && s.name === "売上まとめ.xlsx"), "直した参照が保存される");
    await cdp.key("2");
    await sleep(400);
    const idx = await cf(`cf.world.chest(cf.stack[0]).slots.findIndex((s) => s && s.name === "売上まとめ.xlsx")`);
    p = await chestSlot(idx);
    await cdp.dblclick(p.x, p.y);
    await sleep(250);
    check(await ev(`window.__log.includes("open 売上まとめ.xlsx")`), "新しい名前のまま、本物のアプリで開ける");

    // 別の場所のファイルを、IDで引く
    await ev(`window.__fs.rename("C:\\\\Users\\\\me\\\\Documents\\\\仕事\\\\旧 見積書.xlsx", "旧見積.xlsx")`);
    await cf(`(cf.act("goto", cf.world.room.map((r) => r.cid).find((id) => cf.world.chest(id).name === "しごと")), 0)`);
    await sleep(300);
    const y19 = await cf(`cf.world.chest(cf.stack[0]).slots.findIndex((s) => s && s.t === "c" && cf.world.chest(s.cid).name === "2019年")`);
    p = await chestSlot(y19);
    await cdp.dblclick(p.x, p.y);
    await sleep(600);
    check(await cf(`cf.world.chest(cf.stack[1]).slots.some((s) => s && s.name === "旧見積.xlsx")`), "今のフォルダの外のファイルも、開いたときに名前を引き直す");
    check(await ev(`window.__log.some((l) => l.startsWith("resolve "))`), "本体に、参照を引くよう頼む");

    // 本体のメニューの「名前の変更」：合図を受けて、名前を聞いて、変える。チェストの中の参照も追いかける
    await boot({ ask: "売上まとめ 改.xlsx", prefs: PREFS });
    const wsr = await chestByName("しごと");
    await ev(`(() => { const n = window.__fs.get("C:\\\\Users\\\\me\\\\Documents\\\\売上集計.xlsx"); window.explorerPlus.__action({ action: "rename", entry: { id: n.id, name: n.name, path: n.path, kind: "file", ext: "xlsx", hidden: false } }); })()`);
    await sleep(600);
    check(await ev(`window.__log.includes("rename 売上集計.xlsx 売上まとめ 改.xlsx")`), "本体のメニューで「名前の変更」を選ぶと、名前を聞いて変える");
    check(await cf(`cf.world.chest(${JSON.stringify(wsr)}).slots.some((s) => s && s.name === "売上まとめ 改.xlsx")`), "チェストの中の参照も、新しい名前になる");
    check(await ev(`window.__log.some((l) => l.startsWith("ask "))`), "名前を聞くときは、本体の入力の画面を使う");
    await boot({ ask: "見積書 2019.xlsx", prefs: PREFS });
    await ev(`(() => { const n = window.__fs.get("C:\\\\Users\\\\me\\\\Documents\\\\議事録 0412.txt"); window.explorerPlus.__action({ action: "rename", entry: { id: n.id, name: n.name, path: n.path, kind: "file", ext: "txt", hidden: false } }); })()`);
    await sleep(500);
    check(await ev(`[...document.querySelectorAll(".chat .line.warn")].some((l) => l.textContent.includes("同じ名前"))`), "同じ名前があれば、知らせる");
    check(await ev(`window.__fs.get("C:\\\\Users\\\\me\\\\Documents\\\\議事録 0412.txt") !== undefined`), "断られたときは、何も変わらない");

    // ごみ箱へ送った・移したものが、開いているチェストの中で見つからなくなる
    await boot({ prefs: PREFS });
    await openChest("しごと");
    await sleep(400);
    check(await count(".chest-grid .slot.missing") === 0, "はじめは、見つからないものは無い");
    await ev(`window.__fs.remove("C:\\\\Users\\\\me\\\\Documents\\\\企画書 新製品.pptx")`);
    await sleep(900);
    check(await count(".chest-grid .slot.missing") === 1, "本体でごみ箱へ送ると、開いているチェストの中の表示にも反映される");

    // フォルダを移る
    await boot({ prefs: PREFS });
    await cdp.key("e");
    await sleep(300);
    const barrel = await invSlot("アーカイブ");
    await cdp.dblclick(barrel.x, barrel.y);
    await sleep(500);
    check(await ev(`window.__log.some((l) => l.startsWith("navigate ") && l.endsWith("アーカイブ"))`), "持ち物のフォルダをダブルクリックで、このタブがそのフォルダへ移る");
    check(await cf(`cf.inv().items.length === 0 && cf.inv().note === "空のフォルダです"`), "持ち物が、移った先の中身になる");
    await cdp.click(...Object.values(await center('[data-act="invUp"]')).slice(0, 2));
    await sleep(500);
    check(await cf(`cf.inv().items.length > 20`), "上のフォルダへ戻れる");
    const seg = await center(".i-path .seg", 2);
    check(!!seg, "場所の見出しの、それぞれの階層が押せる");

    // 下の階層まで
    await cdp.click(...Object.values(await center(".i-filter")).slice(0, 2));
    await cdp.type("決算");
    await sleep(300);
    check(await cf(`cf.inv().items.length === 0`), "しぼりこみは、今のフォルダの中だけ");
    await cdp.click(...Object.values(await center('[data-opt="deep"]')).slice(0, 2));
    await sleep(900);
    check(await cf(`cf.inv().items.some((it) => it.name === "決算メモ.txt")`), "下の階層も、にすると、深いところのファイルも見つかる");
    check(await ev(`window.__log.some((l) => l.startsWith("search.find "))`), "本体に、さがすよう頼む");
    await shot("host-2-deep");

    // メニュー：持ち物のファイルを、開いているチェストへ
    await boot({ menu: "put", prefs: PREFS });
    await openChest("あとで見る");
    p = await invSlot("提案資料 A案.pptx");
    await cdp.rightClick(p.x, p.y);
    await sleep(500);
    check((await names(await cf(`cf.stack[0]`))).includes("提案資料 A案.pptx"), "右クリックのメニューから、開いているチェストへ入れられる");
    check(await ev(`window.__menuSeen.items === 1 && window.__menuSeen.extra.includes("put") && window.__menuSeen.extra.includes("hot")`), "本体のいつもの項目と、このビューの項目が並ぶ");
    // 断られたら、このビューの項目だけで出す
    await boot({ menu: "put", menuDeny: true, prefs: PREFS });
    await openChest("あとで見る");
    p = await invSlot("提案資料 B案.pptx");
    await cdp.rightClick(p.x, p.y);
    await sleep(500);
    check((await names(await cf(`cf.stack[0]`))).includes("提案資料 B案.pptx") && await ev(`window.__menuSeen.items === 0`), "本体がメニューを断っても、このビューの項目だけで出る");
    // 本物の場所を開く
    await boot({ menu: "where", prefs: PREFS });
    await openChest("しごと");
    const sub = await cf(`cf.world.chest(cf.stack[0]).slots.findIndex((s) => s && s.t === "f")`);
    p = await chestSlot(sub);
    await cdp.rightClick(p.x, p.y);
    await sleep(500);
    check(await ev(`window.__log.some((l) => l.startsWith("navigate ") && l.endsWith("\\\\Documents"))`), "メニューから、本物の場所へ移れる");

    // 設定
    await boot({ prefs: PREFS });
    await openChest("しごと");
    const w0 = await ev(`document.querySelector(".panel").getBoundingClientRect().width`);
    await ev(`window.explorerPlus.__settings({ slotSize: 56, iconStyle: "block" })`);
    await sleep(500);
    check(await ev(`document.querySelector(".panel").getBoundingClientRect().width`) > w0, "スロットの大きさの設定が、すぐ効く");
    check(await ev(`[...document.querySelectorAll(".inv-grid .slot .ico")].every((i) => i.src.startsWith("data:image/png"))`), "ブロック風の絵にすると、本体のアイコンを使わない");
    await shot("host-3-block");
    await ev(`window.explorerPlus.__theme("dark")`);
    await sleep(500);
    await shot("host-4-dark");
    check(await cf(`cf.room ? true : false`), "明るい・暗いの切りかえで壊れない");
  },

  /** 端の場合：壊れた保存・はじめて・大きなフォルダ・保存できない・いっぱい・元に戻す */
  async edge() {
    const PREFS = { view: "caption", rot: 0, zoom: 1, hide: false, seen: true };
    // はじめて
    await boot({ world: false, prefs: { ...PREFS, seen: false } });
    check(await cf(`cf.world.chestCount === 3`), "保存が無ければ、はじめの3つのチェストから");
    check(await count(".chat .line") === 3, "はじめてのときは、使いかたを短く知らせる");
    await shot("edge-1-first");
    await cf(`cf.store.flush()`);
    await sleep(300);
    check(await ev(`window.explorerPlus.__store.has("w") && window.explorerPlus.__store.has("prefs")`), "はじめのワールドが保存される");
    // 壊れた保存
    await boot({ corrupt: "garbage", prefs: PREFS });
    check(await cf(`cf.world.check().length === 0`), "壊れた保存でも、立ち上がる");
    await boot({ corrupt: "partial", prefs: PREFS });
    check(await cf(`cf.world.chestCount === 1 && cf.world.chest("c1").name === "生き残り" && cf.world.chest("c1").slots.filter(Boolean).length === 1`), "読めるところだけで、ワールドを作る");
    check(await cf(`cf.world.check().length === 0`), "直したあとの木は、決まりを守る");
    // 大きなフォルダ
    const t0 = Date.now();
    await boot({ big: 3000, cwd: "C:\\Big", prefs: PREFS });
    const took = Date.now() - t0;
    await cdp.key("e");
    await sleep(500);
    check(await cf(`cf.inv().items.length === 3000`), "3000個のフォルダが読める");
    check(await count(".inv-grid .slot") < 150, `見えている行だけを DOM にする 実際 ${await count(".inv-grid .slot")} 個`);
    await ev(`document.querySelector(".inv-grid").scrollTop = 1e9`);
    await sleep(400);
    check(await ev(`!!document.querySelector('.inv-grid .slot[data-i="2999"]')`), "いちばん下までスクロールできる");
    await shot("edge-2-big");
    console.log("  起動までの時間", took, "ミリ秒");
    // 全選択して、チェストへ
    await cdp.key("Escape");
    await sleep(200);
    const cid = await cf(`cf.world.room[0].cid`);
    await cf(`(cf.openStack([${JSON.stringify(cid)}]), 0)`);
    await sleep(400);
    await cf(`(cf.gui.invGrid.el.scrollTop = 0, 0)`);
    await sleep(300);
    await cdp.move(...Object.values(await slotPos("inv", 0)));
    await cdp.key("a", { mods: CTRL });
    await sleep(200);
    check(await cf(`cf.gui.selected().idxs.length === 3000`), "Ctrl+A で、持ち物を全部選べる");
    const had = await cf(`cf.world.chest(${JSON.stringify(cid)}).slots.filter(Boolean).length`);
    const s0 = await chestSlot(0);
    const t1 = Date.now();
    const i0 = await slotPos("inv", 0);
    await cdp.drag(i0.x, i0.y, s0.x, s0.y);
    await sleep(600);
    const MAXS = await cf(`1350`);
    check(await cf(`cf.world.chest(${JSON.stringify(cid)}).slots.filter(Boolean).length === ${MAXS}`), `1つのチェストは ${MAXS} 個まで。入りきらない分は元の場所に残る`);
    check(await ev(`[...document.querySelectorAll(".chat .line.warn")].some((l) => l.textContent.includes("いっぱい"))`), "入りきらなかったことを知らせる");
    console.log("  1350個を入れる時間", Date.now() - t1, "ミリ秒");
    check(await cf(`cf.world.check().length === 0`), "木の決まりが保たれる");
    await cf(`cf.store.flush()`);
    await sleep(500);
    check((await dump(cid)).slots.filter(Boolean).length === MAXS, "保存される");
    await cdp.key("z", { mods: CTRL });
    await sleep(300);
    check(await cf(`cf.world.chest(${JSON.stringify(cid)}).slots.filter(Boolean).length === ${had}`), "元に戻すと、入れる前の中身に戻る");
    // 保存できない
    await boot({ failWrite: true, prefs: PREFS });
    const c2 = await openChest("しごと");
    void c2;
    await cdp.key("Delete");
    await cf(`cf.world.rename(cf.stack[0], "名前変更")`);
    await cf(`cf.afterChange()`);
    await cf(`cf.store.flush()`);
    await sleep(500);
    check(await ev(`[...document.querySelectorAll(".chat .line.warn")].some((l) => l.textContent.includes("保存できませんでした"))`), "保存できないときは、知らせる");
  },
};

// 歩く見かた（一人称の 3D）の試験は、別のファイルにある
Object.assign(SCENARIOS, walkScenarios({ cdp, boot, cf, ev, sleep, shot, check, count, center, chestByName, names, invSlot, CTRL }));

try {
  await SCENARIOS[scenario]();
} catch (e) {
  console.log("失敗:", e.stack || e.message);
  process.exitCode = 1;
} finally {
  console.log(cdp.logs.length ? "コンソール:\n  " + cdp.logs.join("\n  ") : "コンソール: 出力なし");
  cdp.cleanup();
  process.exit(process.exitCode || 0);
}

void center; void names; void invIndex;
