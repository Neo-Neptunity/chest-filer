// チェストの画面。DOM で作る。スロット・ホットバー・ふきだし・ドラッグ・検索の結果。
// データを変えるのは app（index.js）。ここは、見せることと、つかんで運ぶ操作を受け止めることだけ。

import { COLS, HOTBAR } from "./consts.js";
import { VirtualGrid } from "./grid.js";
import { keyOf } from "./model.js";

const SKELETON = `
<div class="topbar">
  <div class="group">
    <button class="mc" data-act="new" title="部屋に新しいチェストを置く">チェストを置く</button>
    <button class="mc" data-act="undo" title="Ctrl+Z">元に戻す</button>
    <button class="mc" data-act="redo" title="Ctrl+Y">やり直す</button>
  </div>
  <div class="search"><input type="text" placeholder="チェストの中をさがす" spellcheck="false" autocomplete="off"><div class="results" hidden></div></div>
  <div class="sp"></div>
  <div class="group">
    <button class="mc" data-act="rotL" title="部屋を左へ回す">◀</button>
    <button class="mc" data-act="rotR" title="部屋を右へ回す">▶</button>
    <button class="mc" data-act="mode" title="見かたを切りかえる。V">俯瞰</button>
    <button class="mc" data-act="inv" title="持ち物だけを開く。E">持ち物</button>
    <button class="mc" data-act="help" title="使いかた。F1">使いかた</button>
  </div>
</div>
<div class="backdrop" hidden></div>
<div class="gui" hidden>
  <div class="panel">
    <div class="p-head">
      <button class="mc sm" data-act="up" data-drop="up" title="ひとつ上へ。Esc">↑</button>
      <div class="crumbs"></div>
      <button class="mc sm" data-act="close" title="閉じる">×</button>
    </div>
    <section class="chest-sec">
      <div class="c-title"><input class="c-name" maxlength="40" spellcheck="false" title="名前を変える"><span class="c-count"></span></div>
      <div class="gridbox chest-grid" data-zone="chest"></div>
      <div class="c-tools">
        <button class="mc sm" data-act="sort" title="スロットを並べなおす">整頓</button>
        <button class="mc sm" data-act="newSub" title="このチェストの中に、新しいチェストを入れる">チェストを足す</button>
        <button class="mc sm" data-act="kind" title="チェストの種類を変える">種類</button>
        <button class="mc sm" data-act="destroy" title="このチェストをこわす。中のファイルは消えません">こわす</button>
        <span class="sp"></span>
        <button class="mc sm" data-act="view" title="スロットに名前を出す・しまう">名前</button>
      </div>
    </section>
    <section class="inv-sec" data-drop="inv">
      <div class="i-head"><span class="i-title">持ち物</span><div class="i-path"></div><button class="mc sm" data-act="invUp" title="ひとつ上のフォルダへ">↑</button></div>
      <div class="i-tools">
        <input class="i-filter" type="text" placeholder="名前でしぼる" spellcheck="false" autocomplete="off">
        <label class="chk"><input type="checkbox" data-opt="deep">下の階層も</label>
        <label class="chk"><input type="checkbox" data-opt="hide">入れたものを隠す</label>
      </div>
      <div class="gridbox inv-grid" data-zone="inv"></div>
      <div class="i-foot"></div>
    </section>
  </div>
</div>
<div class="hotbar" data-zone="hotbar"></div>
<div class="chat"></div>
<div class="tip" hidden></div>
<div class="ghost" hidden><img alt=""><span class="n"></span></div>
<div class="help" hidden>
  <div class="box">
    <h2>チェスト・ファイラーの使いかた</h2>
    <ul>
      <li>チェストは仮想のフォルダーです。入れるのはファイルへの参照で、本物のファイルは動きません。</li>
      <li>部屋のチェストをクリックで開きます。ドラッグで動かし、ほかのチェストに重ねると中へ入ります。</li>
      <li>下の持ち物は、今開いている本物のフォルダです。ファイルをチェストへドラッグして入れます。</li>
      <li>チェストの絵の上に落とすと、そのチェストの中へ入ります。</li>
      <li>ダブルクリックで開きます。チェストなら中へ、ファイルなら本物のアプリで開きます。</li>
      <li><kbd>Ctrl</kbd>+クリックで複数選びます。<kbd>Shift</kbd>+クリックで、すぐ入れる・出す。</li>
      <li><kbd>Ctrl</kbd>を押しながら落とすと、コピーです。</li>
      <li>数字キー <kbd>1</kbd> から <kbd>9</kbd> で、ホットバーを開きます。スロットの上で押すと、ホットバーに登録します。</li>
      <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> で元に戻し、<kbd>Esc</kbd> でひとつ上へ戻ります。</li>
      <li>右クリックで、メニューが出ます。</li>
    </ul>
    <div class="row"><button class="mc" data-act="helpClose">閉じる</button></div>
  </div>
</div>`;

const MARK = { dim: "dim", sel: "sel" };

export function createGui(root, app) {
  root.insertAdjacentHTML("beforeend", SKELETON);
  const q = (s) => root.querySelector(s);
  const $ = {
    gui: q(".gui"), panel: q(".panel"), crumbs: q(".crumbs"), name: q(".c-name"), count: q(".c-count"),
    chestSec: q(".chest-sec"), invSec: q(".inv-sec"), chestBox: q(".chest-grid"), invBox: q(".inv-grid"),
    path: q(".i-path"), filter: q(".i-filter"), deep: q('[data-opt="deep"]'), hide: q('[data-opt="hide"]'), foot: q(".i-foot"),
    backdrop: q(".backdrop"), hotbar: q(".hotbar"), tip: q(".tip"), ghost: q(".ghost"), chat: q(".chat"), help: q(".help"),
    search: q(".search input"), results: q(".results"), view: q('[data-act="view"]'),
    undo: q('[data-act="undo"]'), redo: q('[data-act="redo"]'), invUp: q('[data-act="invUp"]'), up: q('[data-act="up"]'),
  };

  const world = () => app.world;
  const cid = () => app.currentCid();
  const chestOf = () => (cid() ? world().chest(cid()) : null);
  const metrics = () => {
    const S = app.settings().slotSize || 44;
    const cap = app.view() === "caption";
    let sw = cap ? S + 16 : S;
    const sh = cap ? S + 30 : S;
    // 画面が狭いときは、横のスロットを細くして、はみ出さないようにする
    const fit = Math.floor((root.clientWidth - 72) / COLS);
    if (fit > 24 && sw > fit) sw = fit;
    return { sw, sh, ico: Math.min(Math.round(S * 0.72), sw - 8) };
  };

  const sel = { zone: null, ids: new Set() };
  let hover = null;          // { zone, i }。キーでスロットを指すときに使う
  let pend = null;           // 押したが、まだ動かしていない
  let hand = null;           // つかんでいるもの
  let overEl = null;
  let scrollTimer = 0;
  let lastPtr = { x: 0, y: 0 };
  let flashKey = null;

  const itemAt = (zone, i) => {
    if (zone === "chest") { const c = chestOf(); return c ? c.slots[i] || null : null; }
    if (zone === "inv") return app.inv().items[i] || null;
    if (zone === "hotbar") return world().hotbar[i] || null;
    return null;
  };
  const idOf = (zone, i) => { const it = itemAt(zone, i); return zone === "inv" ? (it ? keyOf(it) : null) : i; };
  const isSel = (zone, i) => sel.zone === zone && sel.ids.has(idOf(zone, i));

  // ── 絵・スロット ──
  function icon(item) {
    const img = new Image();
    img.className = "ico";
    img.alt = "";
    img.draggable = false;
    const src = app.iconOf(item);
    if (src.startsWith("data:")) img.classList.add("px");
    img.src = src;
    return img;
  }

  function fill(cell, item, zone, i) {
    cell.className = "slot";
    cell.replaceChildren();
    if (!item) return;
    cell.classList.add("has");
    if (isSel(zone, i)) cell.classList.add("sel");
    if (hand && hand.zone === zone && hand.idxs.includes(i) && !hand.copy) cell.classList.add("dim");
    if (app.isMissing(item)) cell.classList.add("missing");
    if (flashKey && flashKey === `${zone}:${i}`) cell.classList.add("flash");
    cell.append(icon(item));
    const cap = document.createElement("span");
    cap.className = "cap";
    cap.textContent = app.nameOf(item);
    cell.append(cap);
    if (item.t === "c" && zone !== "hotbar") {
      const n = app.world.stats(item.cid).total;
      if (n) { const c = document.createElement("span"); c.className = "cnt"; c.textContent = String(n); cell.append(c); }
    }
    if (zone === "inv") {
      const n = app.storedCount(keyOf(item));
      if (n) { const m = document.createElement("span"); m.className = "mark"; m.textContent = n > 1 ? `✓${n}` : "✓"; cell.append(m); }
    }
  }

  const chestGrid = new VirtualGrid($.chestBox, { cols: COLS, render: (c, i) => fill(c, itemAt("chest", i), "chest", i) });
  const invGrid = new VirtualGrid($.invBox, { cols: COLS, render: (c, i) => fill(c, itemAt("inv", i), "inv", i) });

  // 持ち物の列を画面の高さに合わせる
  function layoutRows() {
    const { sw, sh, ico } = metrics();
    root.style.setProperty("--sw", `${sw}px`);
    root.style.setProperty("--sh", `${sh}px`);
    root.style.setProperty("--ico", `${ico}px`);
    $.panel.classList.toggle("cap-mode", app.view() === "caption");
    chestGrid.setSize(sw, sh);
    invGrid.setSize(sw, sh);
    const c = chestOf();
    const chrome = c ? 322 : 170;
    const avail = root.clientHeight - 54 - 84 - chrome;
    const total = Math.max(c ? 6 : 4, Math.floor(avail / sh));
    let chestRows = 0;
    if (c) chestRows = Math.max(3, Math.min(world().rowsOf(c.id, 3), 6, total - 3));
    const invRows = Math.max(3, Math.min(10, total - chestRows));
    $.chestBox.style.height = `${chestRows * sh}px`;
    $.invBox.style.height = `${invRows * sh}px`;
  }

  // ── 描きなおし ──
  function renderHead() {
    const c = chestOf();
    $.chestSec.hidden = !c;
    $.crumbs.replaceChildren();
    const add = (text, id, cur) => {
      if ($.crumbs.childNodes.length) { const s = document.createElement("span"); s.className = "sep"; s.textContent = "›"; $.crumbs.append(s); }
      const e = document.createElement("span");
      e.className = `crumb${cur ? " cur" : ""}`;
      e.textContent = text;
      e.dataset.cid = id;
      if (!cur) e.dataset.drop = "crumb";
      $.crumbs.append(e);
    };
    add(c ? "ワールド" : "持ち物だけ", "", !c);
    app.stack().forEach((id, k) => add(world().chest(id)?.name ?? "?", id, k === app.stack().length - 1));
    if (c) {
      if (document.activeElement !== $.name) $.name.value = c.name;
      const st = world().stats(c.id);
      $.count.textContent = st.total ? `${st.total}個` : "空";
    }
    $.view.textContent = app.view() === "caption" ? "名前を隠す" : "名前を出す";
    $.view.classList.toggle("on", app.view() === "caption");
    $.undo.disabled = !world().canUndo;
    $.redo.disabled = !world().canRedo;
    $.undo.title = world().canUndo ? `${world().undoLabel}を元に戻す。Ctrl+Z` : "Ctrl+Z";
    $.up.title = app.stack().length > 1 ? "ひとつ上のチェストへ。Esc" : "閉じる。Esc";
  }

  function renderInvHead() {
    const f = app.folder();
    const path = f ? f.path : "";
    $.path.replaceChildren();
    $.path.title = path;
    if (path) {
      const parts = path.replace(/\\$/, "").split("\\");
      let acc = "";
      parts.forEach((p, k) => {
        acc = k === 0 ? `${p}\\` : `${acc.replace(/\\$/, "")}\\${p}`;
        if (k) { const s = document.createElement("span"); s.textContent = "›"; $.path.append(s); }
        const seg = document.createElement("span");
        seg.className = "seg";
        seg.textContent = p;
        seg.dataset.path = acc;
        $.path.append(seg);
      });
    }
    $.invUp.disabled = !(f && f.parentPath);
    if (document.activeElement !== $.filter) $.filter.value = app.invFilter();
    $.deep.checked = app.invDeep();
    $.hide.checked = app.invHide();
  }

  function renderInv() {
    const inv = app.inv();
    invGrid.setCount(Math.max(inv.items.length, COLS * 3));
    $.foot.textContent = inv.note;
    renderInvHead();
  }

  function renderChest() {
    const c = chestOf();
    if (!c) { chestGrid.setCount(0); return; }
    chestGrid.setCount(world().rowsOf(c.id, 3) * COLS);
  }

  function renderHotbar() {
    if ($.hotbar.childElementCount !== HOTBAR) {
      $.hotbar.replaceChildren();
      for (let i = 0; i < HOTBAR; i++) {
        const s = document.createElement("div");
        s.className = "slot";
        s.dataset.i = String(i);
        $.hotbar.append(s);
      }
    }
    [...$.hotbar.children].forEach((cell, i) => {
      const it = world().hotbar[i];
      fill(cell, it, "hotbar", i);
      cell.classList.toggle("on", i === app.hot());
      const n = document.createElement("i");
      n.textContent = String(i + 1);
      cell.prepend(n);
    });
  }

  function renderAll() {
    $.tip.hidden = true;
    layoutRows();
    renderHead();
    renderChest();
    renderInv();
    renderHotbar();
    chestGrid.refresh(true);
    invGrid.refresh(true);
  }

  /** 中身だけ描きなおす（スクロールの位置は保つ） */
  function renderSlots() {
    $.tip.hidden = true;
    hover = null;
    renderHead();
    layoutRows();
    renderChest();
    chestGrid.refresh(true);
    renderInv();
    invGrid.refresh(true);
    renderHotbar();
  }

  /** center：画面の中央に出す。dim：うしろのワールドを、少し暗くする（マイクラと同じ） */
  function show(on, center, dim) {
    $.gui.hidden = !on;
    $.gui.classList.toggle("center", !!center);
    $.backdrop.hidden = !(on && dim);
  }

  function panelWidth() { return $.gui.hidden ? 0 : $.panel.getBoundingClientRect().width; }

  // ── ふきだし ──
  function showTip(zone, i, x, y) {
    const item = itemAt(zone, i);
    if (!item) { $.tip.hidden = true; return; }
    const lines = app.tipFor(zone, i, item);
    $.tip.replaceChildren(...lines.map((l) => { const d = document.createElement("div"); d.className = `t-${l.k}`; d.textContent = l.t; return d; }));
    $.tip.hidden = false;
    const w = $.tip.offsetWidth, h = $.tip.offsetHeight;
    const vx = root.clientWidth, vy = root.clientHeight;
    $.tip.style.left = `${Math.max(4, Math.min(vx - w - 4, x + 16))}px`;
    $.tip.style.top = `${Math.max(4, Math.min(vy - h - 4, y - 8 - (y + 16 + h > vy ? h : 0)))}px`;
  }

  // ── つかんで運ぶ ──
  function slotInfo(target) {
    const cell = target && target.closest ? target.closest(".slot") : null;
    if (!cell || cell.dataset.i === undefined) return null;
    const zoneEl = cell.closest("[data-zone]");
    if (!zoneEl) return null;
    return { cell, zone: zoneEl.dataset.zone, i: Number(cell.dataset.i) };
  }

  function makeHand(zone, i, copy) {
    let idxs;
    if (zone !== "hotbar" && sel.zone === zone && sel.ids.has(idOf(zone, i))) {
      if (zone === "chest") idxs = [...sel.ids].filter((n) => itemAt("chest", n)).sort((a, b) => a - b);
      else idxs = app.inv().items.map((it, k) => (sel.ids.has(keyOf(it)) ? k : -1)).filter((k) => k >= 0);
    } else idxs = [i];
    const items = idxs.map((k) => itemAt(zone, k));
    const from = idxs.map((k) => (zone === "chest" ? { zone: "chest", cid: cid(), slot: k } : zone === "hotbar" ? { zone: "hotbar", slot: k } : { zone: "inv" }));
    return { items, from, copy, zone, idxs };
  }

  function targetAt(x, y) {
    const e = document.elementFromPoint(x, y);
    if (!e) return null;
    const si = slotInfo(e);
    if (si) {
      if (si.zone === "chest") return { kind: "slot", zone: "chest", cid: cid(), slot: si.i, el: si.cell };
      if (si.zone === "hotbar") return { kind: "slot", zone: "hotbar", slot: si.i, el: si.cell };
      if (si.zone === "inv") return { kind: "inv", el: $.invSec };
    }
    const d = e.closest("[data-drop]");
    if (d) {
      if (d.dataset.drop === "inv") return { kind: "inv", el: $.invSec };
      if (d.dataset.drop === "crumb") return { kind: "crumb", cid: d.dataset.cid, el: d };
      if (d.dataset.drop === "up") return { kind: "up", el: d };
    }
    if (e.closest(".panel") || e.closest(".hotbar") || e.closest(".topbar")) return null;
    if (e.tagName === "CANVAS") return { kind: "room", x, y };
    return null;
  }

  function mark(target) {
    if (overEl) { overEl.classList.remove("drop-ok", "drop-into"); overEl = null; }
    app.roomHint(null);
    if (!target || !hand) return;
    if (target.kind === "room") { app.roomHint(hand, target.x, target.y); return; }
    const el = target.el;
    if (!el) return;
    let cls = "drop-ok";
    if (target.kind === "slot" && target.zone === "chest") {
      const occ = itemAt("chest", target.slot);
      if (occ && occ.t === "c" && !hand.items.some((it) => it.t === "c" && it.cid === occ.cid)) cls = "drop-into";
    }
    el.classList.add(cls);
    overEl = el;
  }

  function startDrag(e) {
    const { zone, i, copy } = pend;
    hand = makeHand(zone, i, copy);
    pend = null;
    root.classList.add("dragging");
    $.tip.hidden = true;
    const img = $.ghost.querySelector("img");
    const src = app.iconOf(hand.items[0]);
    img.src = src;
    img.className = src.startsWith("data:") ? "px" : "";
    $.ghost.querySelector(".n").textContent = hand.items.length > 1 ? String(hand.items.length) : "";
    $.ghost.hidden = false;
    moveGhost(e.clientX, e.clientY);
    for (const [g, name] of [[chestGrid, "chest"], [invGrid, "inv"]]) {
      for (const [k, c] of g.cells) if (hand.zone === name && hand.idxs.includes(k) && !hand.copy) c.classList.add(MARK.dim);
    }
    if (hand.zone === "hotbar") for (const k of hand.idxs) $.hotbar.children[k]?.classList.add(MARK.dim);
    clearInterval(scrollTimer);
    scrollTimer = setInterval(autoScroll, 40);
  }

  function moveGhost(x, y) {
    $.ghost.style.left = `${x}px`;
    $.ghost.style.top = `${y}px`;
  }

  function autoScroll() {
    if (!hand) return;
    const e = document.elementFromPoint(lastPtr.x, lastPtr.y);
    const box = e && e.closest(".gridbox");
    if (!box) return;
    const r = box.getBoundingClientRect();
    if (lastPtr.y < r.top + 26) box.scrollTop -= 14;
    else if (lastPtr.y > r.bottom - 26) box.scrollTop += 14;
    else return;
    mark(targetAt(lastPtr.x, lastPtr.y));
  }

  function endDrag() {
    clearInterval(scrollTimer);
    const h = hand;
    hand = null;
    root.classList.remove("dragging");
    $.ghost.hidden = true;
    mark(null);
    root.querySelectorAll(".slot.dim").forEach((c) => c.classList.remove(MARK.dim));
    return h;
  }

  function cancelDrag() {
    if (!hand && !pend) return false;
    const was = !!hand;
    pend = null;
    endDrag();
    return was;
  }

  function onDown(e) {
    if (e.button !== 0) return;
    const si = slotInfo(e.target);
    if (!si) return;
    lastPtr = { x: e.clientX, y: e.clientY };
    const item = itemAt(si.zone, si.i);
    if (!item) {
      if (!e.ctrlKey && si.zone !== "hotbar") { clearSel(); }
      return;
    }
    if (si.zone === "hotbar") app.setHot(si.i);
    pend = { zone: si.zone, i: si.i, x: e.clientX, y: e.clientY, ctrl: e.ctrlKey, shift: e.shiftKey, copy: e.ctrlKey, wasSel: isSel(si.zone, si.i) };
    if (!e.ctrlKey && !e.shiftKey && si.zone !== "hotbar" && !pend.wasSel) select(si.zone, si.i);
  }

  function onMove(e) {
    lastPtr = { x: e.clientX, y: e.clientY };
    // ウィンドウの外でボタンを離したときは、ドラッグをやめる
    if ((hand || pend) && e.buttons === 0) { cancelDrag(); return; }
    if (hand) {
      moveGhost(e.clientX, e.clientY);
      mark(targetAt(e.clientX, e.clientY));
      return;
    }
    if (pend) {
      if (Math.hypot(e.clientX - pend.x, e.clientY - pend.y) > 5) { pend.copy = e.ctrlKey; startDrag(e); mark(targetAt(e.clientX, e.clientY)); }
      return;
    }
    // ふきだし
    const si = slotInfo(document.elementFromPoint(e.clientX, e.clientY));
    if (si && itemAt(si.zone, si.i)) {
      hover = { zone: si.zone, i: si.i };
      showTip(si.zone, si.i, e.clientX, e.clientY);
    } else {
      hover = si ? { zone: si.zone, i: si.i } : null;
      $.tip.hidden = true;
    }
  }

  function onUp(e) {
    if (hand) {
      const t = targetAt(e.clientX, e.clientY);
      const h = endDrag();
      if (t) app.drop(h, t, { copy: e.ctrlKey, x: e.clientX, y: e.clientY });
      return;
    }
    if (!pend) return;
    const p = pend;
    pend = null;
    const si = slotInfo(document.elementFromPoint(e.clientX, e.clientY));
    if (!si || si.zone !== p.zone || si.i !== p.i) return;
    if (p.shift && p.zone !== "hotbar") { app.quickMove(p.zone, p.i); return; }
    if (p.ctrl && p.zone !== "hotbar") { toggle(p.zone, p.i); return; }
    if (p.zone !== "hotbar" && p.wasSel && sel.ids.size > 1) select(p.zone, p.i);
  }

  function select(zone, i) {
    sel.zone = zone;
    sel.ids = new Set([idOf(zone, i)]);
    refreshSel();
  }
  function toggle(zone, i) {
    if (sel.zone !== zone) { sel.zone = zone; sel.ids = new Set(); }
    const id = idOf(zone, i);
    if (sel.ids.has(id)) sel.ids.delete(id); else sel.ids.add(id);
    refreshSel();
  }
  function clearSel() {
    if (!sel.ids.size) return;
    sel.zone = null; sel.ids = new Set();
    refreshSel();
  }
  function refreshSel() {
    for (const [g, zone] of [[chestGrid, "chest"], [invGrid, "inv"]]) {
      for (const [i, c] of g.cells) c.classList.toggle("sel", isSel(zone, i) && !!itemAt(zone, i));
    }
  }
  function selectAll(zone) {
    sel.zone = zone;
    if (zone === "chest") sel.ids = new Set(chestOf()?.slots.map((s, i) => (s ? i : -1)).filter((i) => i >= 0) ?? []);
    else sel.ids = new Set(app.inv().items.map((it) => keyOf(it)));
    refreshSel();
  }
  /** 選んでいるものの番号。なければ、指している1つ */
  function selected() {
    if (!sel.zone) return null;
    if (sel.zone === "chest") return { zone: "chest", idxs: [...sel.ids].filter((i) => itemAt("chest", i)).sort((a, b) => a - b) };
    return { zone: "inv", idxs: app.inv().items.map((it, k) => (sel.ids.has(keyOf(it)) ? k : -1)).filter((k) => k >= 0) };
  }

  // ── イベント ──
  root.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", () => cancelDrag());
  window.addEventListener("blur", () => cancelDrag());
  root.addEventListener("pointerleave", () => { $.tip.hidden = true; hover = null; });

  root.addEventListener("dblclick", (e) => {
    const si = slotInfo(e.target);
    if (!si || !itemAt(si.zone, si.i)) return;
    app.openItem(si.zone, si.i, si.cell.getBoundingClientRect());
  });

  root.addEventListener("contextmenu", (e) => {
    const si = slotInfo(e.target);
    if (!si) {
      if (e.target.closest(".panel") || e.target.closest(".hotbar")) e.preventDefault();
      return;
    }
    e.preventDefault();
    if (hand) return;
    if (itemAt(si.zone, si.i) && si.zone !== "hotbar" && !isSel(si.zone, si.i)) select(si.zone, si.i);
    app.menu({ zone: si.zone, i: si.i, x: e.clientX, y: e.clientY });
  });

  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (b && !b.disabled) { b.blur(); app.act(b.dataset.act, b); return; }
    const crumb = e.target.closest(".crumb[data-cid]");
    if (crumb && !crumb.classList.contains("cur")) { app.act("goto", crumb.dataset.cid); return; }
    const seg = e.target.closest(".i-path .seg");
    if (seg) app.act("invGo", seg.dataset.path);
  });

  $.name.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") $.name.blur();
    else if (e.key === "Escape") { $.name.value = chestOf()?.name ?? ""; $.name.blur(); }
  });
  $.name.addEventListener("change", () => app.act("rename", $.name.value));
  $.name.addEventListener("blur", () => { if (chestOf() && !$.name.value.trim()) $.name.value = chestOf().name; });

  $.filter.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") { $.filter.value = ""; app.act("invFilter", ""); $.filter.blur(); } });
  $.filter.addEventListener("input", () => app.act("invFilter", $.filter.value));
  $.deep.addEventListener("change", () => { app.act("invDeep", $.deep.checked); $.deep.blur(); });
  $.hide.addEventListener("change", () => { app.act("invHide", $.hide.checked); $.hide.blur(); });

  // 検索
  let resItems = [];
  let resOn = -1;
  const showResults = () => {
    const text = $.search.value.trim();
    $.results.replaceChildren();
    if (!text) { $.results.hidden = true; resItems = []; return; }
    resItems = app.search(text);
    $.results.hidden = false;
    if (!resItems.length) { const d = document.createElement("div"); d.className = "res-empty"; d.textContent = "見つかりません"; $.results.append(d); return; }
    resItems.slice(0, 40).forEach((r, k) => {
      const b = document.createElement("button");
      b.className = "res";
      b.dataset.k = String(k);
      const img = new Image();
      img.src = r.type === "chest" ? app.iconOf({ t: "c", cid: r.cid }) : app.iconOf(r.item);
      if (img.src.startsWith("data:")) img.className = "px";
      const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = r.name;
      const tr = document.createElement("span"); tr.className = "tr"; tr.textContent = r.trail.length ? r.trail.join(" › ") : "ワールド";
      b.append(img, nm, tr);
      $.results.append(b);
    });
    resOn = -1;
  };
  $.search.addEventListener("input", showResults);
  $.search.addEventListener("focus", showResults);
  $.search.addEventListener("keydown", (e) => {
    e.stopPropagation();
    const btns = [...$.results.querySelectorAll(".res")];
    if (e.key === "Escape") { $.search.value = ""; showResults(); $.search.blur(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      resOn = Math.max(0, Math.min(btns.length - 1, resOn + (e.key === "ArrowDown" ? 1 : -1)));
      btns.forEach((b, k) => b.classList.toggle("on", k === resOn));
      btns[resOn]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      const r = resItems[resOn >= 0 ? resOn : 0];
      if (r) { app.reveal(r); $.results.hidden = true; $.search.blur(); }
    }
  });
  $.results.addEventListener("click", (e) => {
    const b = e.target.closest(".res");
    if (!b) return;
    const r = resItems[Number(b.dataset.k)];
    if (r) { app.reveal(r); $.results.hidden = true; }
  });
  document.addEventListener("pointerdown", (e) => { if (!e.target.closest(".search")) $.results.hidden = true; });

  const chatLines = [];
  function say(text, kind = "") {
    const d = document.createElement("div");
    d.className = `line ${kind}`;
    d.textContent = text;
    $.chat.append(d);
    chatLines.push(d);
    while (chatLines.length > 5) chatLines.shift().remove();
    setTimeout(() => { d.remove(); const k = chatLines.indexOf(d); if (k >= 0) chatLines.splice(k, 1); }, 7200);
  }

  const gui = {
    el: $,
    chestGrid, invGrid,
    renderAll, renderSlots, renderHead, renderInv, renderHotbar, layoutRows, show, panelWidth, say,
    clearSel, select, selectAll, selected, refreshSel, cancelDrag,
    get hover() { return hover; },
    get dragging() { return !!hand; },
    get typing() { const a = document.activeElement; return !!a && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && a.type === "text")); },
    focusName() { $.name.focus(); $.name.select(); },
    focusFilter() { $.filter.focus(); $.filter.select(); },
    focusSearch() { $.search.focus(); $.search.select(); },
    showHelp(on) { $.help.hidden = !on; },
    get helpOpen() { return !$.help.hidden; },
    flash(zone, i) {
      const g = zone === "chest" ? chestGrid : invGrid;
      g.reveal(i);
      flashKey = `${zone}:${i}`;
      g.refresh(true);
      setTimeout(() => { if (flashKey === `${zone}:${i}`) { flashKey = null; g.refresh(true); } }, 1300);
    },
    hideTip() { $.tip.hidden = true; },
  };
  return gui;
}
