// 画面を持たない部品の試験。node だけで動く。
//   node chest-filer/dev/unit.mjs
import fs from "node:fs";
import path from "node:path";
import { stage, MOD_DIR } from "./stage.mjs";

const st = stage("unit");
const C = await import(st.url("consts.js"));
const M = await import(st.url("model.js"));
const { World, keyOf, fileItem, chestItem } = M;

let fail = 0, total = 0;
const ok = (cond, msg) => { total++; if (!cond) { fail++; console.log("  NG", msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}\n      得た ${JSON.stringify(a)}\n      望み ${JSON.stringify(b)}`);
const section = (s) => console.log(s);
const file = (name, id = name) => ({ t: "f", id: String(id), path: `C:\\Docs\\${name}`, name, k: "f", ext: name.includes(".") ? name.split(".").pop() : "" });
const dir = (name, id = name) => ({ t: "f", id: String(id), path: `C:\\Docs\\${name}`, name, k: "d", ext: "" });
const inv = (items) => ({ items, from: items.map(() => ({ zone: "inv" })) });
const fromChest = (w, cid, slots) => ({ items: slots.map((s) => w.chest(cid).slots[s]), from: slots.map((s) => ({ zone: "chest", cid, slot: s })) });
const names = (w, cid) => w.chest(cid).slots.map((s) => (s ? (s.t === "c" ? `[${w.chest(s.cid).name}]` : s.name) : "-"));
const sound = (w, msg) => { const bad = w.check(); ok(bad.length === 0, `${msg}：木の決まり ${bad.join(" / ")}`); };

section("ワールドの始まり");
{
  const w = World.starter();
  eq(w.chestCount, 3, "はじめは3つ");
  eq(w.room.length, 3, "部屋に3つ");
  sound(w, "はじめ");
  ok(!w.canUndo, "はじめは元に戻せない");
  ok(w.rowsOf(w.room[0].cid) === 3, "空のチェストは3行");
}

section("チェストを足す・名前・種類・こわす");
{
  const w = new World();
  const a = w.run("足す", () => w.addChest({ name: "A", x: 1, y: 1 }));
  const b = w.run("足す", () => w.addChest({ name: "B", parent: a }));
  const c = w.run("足す", () => w.addChest({ name: "C", parent: b, slot: 5 }));
  eq(w.pathOf(c).map((id) => w.chest(id).name), ["A", "B", "C"], "入れ子の道すじ");
  ok(w.chest(a).slots[0].cid === b, "親の最初の空きスロットに入る");
  eq(w.chest(b).slots[5], chestItem(c), "場所を指定できる");
  ok(w.isInside(c, a) && !w.isInside(a, c), "中か外か");
  ok(w.rename(a, "  新しい名前\n  "), "名前を変える");
  eq(w.chest(a).name, "新しい名前", "前後の空白と改行は落とす");
  ok(!w.rename(a, "   "), "空の名前にはしない");
  eq(w.chest(w.addChest({ name: "あ".repeat(100) })).name.length, C.NAME_MAX, "名前は40文字まで");
  ok(w.setKind(a, "ender") && w.chest(a).kind === "ender", "種類を変える");
  ok(!w.setKind(a, "ぬ"), "知らない種類は断る");
  sound(w, "足したあと");
  const gone = w.removeChest(a);
  eq(gone, 3, "こわすと、中のチェストも消える");
  ok(!w.chest(b) && !w.chest(c), "中のチェストが残らない");
  sound(w, "こわしたあと");
  eq(w.room.length, 1, "部屋にはあと1つ");
}

section("部屋がいっぱいのとき");
{
  const w = new World();
  for (let i = 0; i < C.ROOM_N * C.ROOM_N; i++) ok(w.addChest({ name: `c${i}` }), `置ける ${i}`);
  ok(w.addChest({ name: "あふれる" }) === null, "いっぱいなら null");
  eq(w.chestCount, C.ROOM_N * C.ROOM_N, "数は増えない");
  sound(w, "いっぱい");
}

section("ファイルを入れる（持ち物から）");
{
  const w = World.starter();
  const [a, b] = w.room.map((r) => r.cid);
  const r1 = w.dropHand(inv([file("a.txt"), file("b.txt")]), { zone: "chest", cid: a, slot: 0 });
  ok(r1.ok && r1.placed === 2, "2つ入る");
  eq(names(w, a), ["a.txt", "b.txt"], "並んで入る");
  const r2 = w.dropHand(inv([file("a.txt")]), { zone: "chest", cid: a, slot: 4 });
  ok(!r2.ok && r2.reason === "dup", "同じチェストに同じファイルは入らない");
  const r3 = w.dropHand(inv([file("a.txt")]), { zone: "chest", cid: b, slot: 2 });
  ok(r3.ok && r3.moved[0] === "しごと", "別のチェストにあるファイルは移る。移した元の名前が分かる");
  eq(names(w, a), ["-", "b.txt"], "元のチェストから消える");
  eq(names(w, b), ["-", "-", "a.txt"], "指したスロットに入る");
  const r4 = w.dropHand({ ...inv([file("b.txt")]), copy: true }, { zone: "chest", cid: b, slot: 0 });
  ok(r4.ok && r4.moved.length === 0, "コピーなら、元に残す");
  eq(w.locate(keyOf(file("b.txt"))).length, 2, "2か所にある");
  eq(w.locate(keyOf(file("zzz"))), [], "無いものは空");
  sound(w, "入れたあと");
}

section("ID が無いドライブでは、パスで同じものと見る");
{
  const w = World.starter();
  const [a] = w.room.map((r) => r.cid);
  const x = { t: "f", id: "", path: "E:\\USB\\Memo.TXT", name: "Memo.TXT", k: "f", ext: "txt" };
  const y = { ...x, path: "e:\\usb\\memo.txt" };
  ok(keyOf(x) === keyOf(y), "大文字と小文字を区別しない");
  w.dropHand(inv([x]), { zone: "chest", cid: a, slot: 0 });
  ok(!w.dropHand(inv([y]), { zone: "chest", cid: a, slot: 1 }).ok, "同じものとして断る");
}

section("スロットの間の移動・入れかえ");
{
  const w = World.starter();
  const [a, b] = w.room.map((r) => r.cid);
  w.dropHand(inv([file("1"), file("2"), file("3")]), { zone: "chest", cid: a, slot: 0 });
  // 空いたスロットへ
  let r = w.dropHand(fromChest(w, a, [0]), { zone: "chest", cid: a, slot: 8 });
  ok(r.ok, "空きへ動かせる");
  eq(names(w, a).slice(0, 9), ["-", "2", "3", "-", "-", "-", "-", "-", "1"], "動いた");
  // 入れかえ
  r = w.dropHand(fromChest(w, a, [1]), { zone: "chest", cid: a, slot: 2 });
  eq(names(w, a).slice(0, 4), ["-", "3", "2", "-"], "中身のあるスロットとは、入れかえる");
  // 別のチェストの中身と入れかえ
  w.dropHand(inv([file("x")]), { zone: "chest", cid: b, slot: 0 });
  r = w.dropHand(fromChest(w, a, [1]), { zone: "chest", cid: b, slot: 0 });
  eq([names(w, a)[1], names(w, b)[0]], ["x", "3"], "別のチェストとも入れかえる");
  // 自分の場所に戻す
  const before = w.chest(a);
  r = w.dropHand(fromChest(w, a, [1]), { zone: "chest", cid: a, slot: 1 });
  ok(r.ok && w.chest(a) === before, "同じ場所に戻しても何も変わらない");
  sound(w, "動かしたあと");
}

section("複数を動かす");
{
  const w = World.starter();
  const [a, b] = w.room.map((r) => r.cid);
  w.dropHand(inv([file("1"), file("2"), file("3"), file("4")]), { zone: "chest", cid: a, slot: 0 });
  const r = w.dropHand(fromChest(w, a, [0, 2, 3]), { zone: "chest", cid: b, slot: 4 });
  eq(r.placed, 3, "3つ動く");
  eq(names(w, b).slice(4, 7), ["1", "3", "4"], "選んだ順にならぶ");
  eq(names(w, a), ["-", "2"], "元には残りだけ");
  // 先のスロットが埋まっているときは、空きをたどる
  w.dropHand(inv([file("p")]), { zone: "chest", cid: a, slot: 3 });
  const r2 = w.dropHand(inv([file("q"), file("r")]), { zone: "chest", cid: a, slot: 3 });
  eq([r2.placed, names(w, a).slice(3, 6)], [2, ["p", "q", "r"]], "埋まったスロットは飛ばして、先の空きに入る");
  sound(w, "複数のあと");
}

section("チェストの中にチェスト（ドロップ）");
{
  const w = World.starter();
  const [a, b] = w.room.map((r) => r.cid);
  const sub = w.addChest({ name: "サブ", parent: a });
  // ファイルを、中のチェストのスロットへ落とすと、そのチェストの中に入る
  let r = w.dropHand(inv([file("f1")]), { zone: "chest", cid: a, slot: 0 });
  ok(r.ok && r.into === sub, "チェストの上に落とすと、中へ入る");
  eq(names(w, sub), ["f1"], "中に入った");
  // チェストを、ほかのチェストの上へ
  w.nestChest(b, a);
  ok(w.parentOf(b).cid === a, "チェストを別のチェストへ入れられる");
  ok(!w.room.some((x) => x.cid === b), "部屋からは消える");
  // 自分の中には入れない
  ok(!w.nestChest(a, sub), "自分の下には入れられない");
  ok(!w.nestChest(a, a), "自分には入れられない");
  const slotOfSub = w.chest(a).slots.findIndex((s) => s && s.cid === sub);
  r = w.dropHand(fromChest(w, a, [slotOfSub]), { zone: "into", cid: sub });
  ok(!r.ok && r.reason === "loop", "ドロップでも、自分の中へは入れない");
  // 深い階層の移動
  const deep = w.addChest({ name: "深い", parent: sub });
  ok(!w.nestChest(a, deep), "子孫の中にも入れられない");
  ok(w.nestChest(deep, b), "子孫を、別の枝へは移せる");
  eq(w.pathOf(deep).map((id) => w.chest(id).name), ["しごと", "しゃしん", "深い"], "道すじは、移った先のとおり");
  sound(w, "入れ子のあと");
}

section("部屋の上の動かし");
{
  const w = World.starter();
  const [a, b] = w.room.map((r) => r.cid);
  const ra = w.room.find((r) => r.cid === a);
  ok(w.moveChestToRoom(a, 0, 0) && w.room.find((r) => r.cid === a).x === 0, "空いた升へ動く");
  const rb = w.room.find((r) => r.cid === b);
  w.moveChestToRoom(a, rb.x, rb.y);
  const na = w.room.find((r) => r.cid === a);
  ok(!(na.x === rb.x && na.y === rb.y), "ほかのチェストの升なら、ずらす");
  const sub = w.addChest({ name: "サブ", parent: b });
  ok(w.moveChestToRoom(sub, 7, 7), "中のチェストを部屋へ出せる");
  ok(w.parentOf(sub).cid === null && w.room.some((r) => r.cid === sub), "部屋の上にある");
  eq(w.chest(b).slots.length, 0, "元のスロットは空く");
  void ra;
  sound(w, "部屋のあと");
}

section("ホットバー");
{
  const w = World.starter();
  const [a] = w.room.map((r) => r.cid);
  w.dropHand(inv([file("note")]), { zone: "chest", cid: a, slot: 0 });
  let r = w.dropHand(fromChest(w, a, [0]), { zone: "hotbar", slot: 2 });
  ok(r.ok && w.hotbar[2].name === "note", "ホットバーに近道ができる");
  ok(w.chest(a).slots[0], "元のチェストには残る");
  r = w.dropHand({ items: [w.hotbar[2]], from: [{ zone: "hotbar", slot: 2 }] }, { zone: "hotbar", slot: 5 });
  ok(r.ok && !w.hotbar[2] && w.hotbar[5], "ホットバーの中で動かせる");
  r = w.dropHand({ items: [w.hotbar[5]], from: [{ zone: "hotbar", slot: 5 }] }, { zone: "chest", cid: a, slot: 3 });
  ok(!r.ok && r.reason === "hotbar" && w.hotbar[5], "近道は、チェストへは落とせない");
  r = w.dropHand({ items: [w.hotbar[5]], from: [{ zone: "hotbar", slot: 5 }] }, { zone: "inv" });
  ok(r.ok && !w.hotbar[5], "持ち物の所へ落とすと、近道が消える");
  // チェストの近道は、チェストをこわすと消える
  const sub = w.addChest({ name: "S", parent: a });
  w.setHotbar(0, chestItem(sub));
  w.removeChest(sub);
  ok(!w.hotbar[0], "こわしたチェストの近道は消える");
  w.setHotbar(1, file("note"));
  w.dropHand({ items: [file("other")], from: [{ zone: "inv" }] }, { zone: "hotbar", slot: 1 });
  eq(w.hotbar[1].name, "other", "近道は置きかえられる");
  ok(!w.dropHand({ items: [file("other")], from: [{ zone: "inv" }] }, { zone: "hotbar", slot: 4 }).ok, "同じものを近道に2つは置かない");
  sound(w, "ホットバーのあと");
}

section("持ち物の所へ落とす（チェストから外す）");
{
  const w = World.starter();
  const [a] = w.room.map((r) => r.cid);
  w.dropHand(inv([file("1"), file("2")]), { zone: "chest", cid: a, slot: 0 });
  const r = w.dropHand(fromChest(w, a, [0, 1]), { zone: "inv" });
  ok(r.ok && r.placed === 2 && w.chest(a).slots.length === 0, "外れて、チェストは空になる");
  ok(!w.dropHand(inv([file("1")]), { zone: "inv" }).ok, "持ち物から持ち物へは何も起きない");
  sound(w, "外したあと");
}

section("元に戻す・やり直す");
{
  const w = World.starter();
  const [a] = w.room.map((r) => r.cid);
  w.dropHand(inv([file("1")]), { zone: "chest", cid: a, slot: 0 });
  w.run("名前", () => w.rename(a, "変えた"));
  ok(w.canUndo && w.undoLabel === "名前", "記録の名前");
  w.undo();
  eq(w.chest(a).name, "しごと", "名前が戻る");
  w.undo();
  eq(w.chest(a).slots.length, 0, "ファイルが戻る（外れる）");
  ok(!w.canUndo && w.canRedo, "記録が空");
  w.redo(); w.redo();
  eq([w.chest(a).name, w.chest(a).slots.length], ["変えた", 1], "やり直せる");
  w.undo();
  w.run("別", () => w.rename(a, "別の名前"));
  ok(!w.canRedo, "新しく変えると、やり直しは消える");
  const n = w._undo.length;
  w.run("何もしない", () => w.rename(a, "別の名前"));
  eq(w._undo.length, n, "何も変わらなければ記録しない");
  for (let i = 0; i < 150; i++) w.run("x", () => w.rename(a, `n${i}`));
  ok(w._undo.length <= 100, "記録は100まで");
  sound(w, "戻したあと");
}

section("こわしても元に戻せる");
{
  const w = World.starter();
  const [a] = w.room.map((r) => r.cid);
  const sub = w.addChest({ name: "S", parent: a });
  w.dropHand(inv([file("keep")]), { zone: "into", cid: sub });
  w.run("こわす", () => w.removeChest(a));
  eq(w.chestCount, 2, "こわれた");
  w.undo();
  eq(w.chestCount, 4, "戻ると、中のチェストも一緒に戻る");
  eq(names(w, sub), ["keep"], "中のファイルの参照も戻る");
  sound(w, "こわして戻したあと");
}

section("整頓");
{
  const w = World.starter();
  const [a] = w.room.map((r) => r.cid);
  const sub = w.addChest({ name: "あサブ", parent: a, slot: 7 });
  w.dropHand(inv([file("b10.txt"), file("b2.txt"), dir("フォルダ"), file("a.zip"), file("c.png")]), { zone: "chest", cid: a, slot: 0 });
  w.sortChest(a, "name");
  eq(names(w, a), ["[あサブ]", "フォルダ", "a.zip", "b2.txt", "b10.txt", "c.png"], "チェスト・フォルダ・ファイルの順。名前は数のとおり");
  w.sortChest(a, "type");
  eq(names(w, a), ["[あサブ]", "フォルダ", "c.png", "b2.txt", "b10.txt", "a.zip"], "種類順。同じ種類は名前順");
  const meta = { "c.png": { size: 10, modified: 5 }, "b2.txt": { size: 99, modified: 1 }, "b10.txt": { size: 50, modified: 9 }, "a.zip": { size: 70, modified: 3 } };
  w.sortChest(a, "size", (it) => meta[it.name] || {});
  eq(names(w, a).slice(2), ["b2.txt", "a.zip", "b10.txt", "c.png"], "大きい順");
  w.sortChest(a, "modified", (it) => meta[it.name] || {});
  eq(names(w, a).slice(2), ["b10.txt", "c.png", "a.zip", "b2.txt"], "新しい順");
  w.dropHand(fromChest(w, a, [5]), { zone: "chest", cid: a, slot: 20 });
  w.sortChest(a, "compact");
  ok(w.chest(a).slots.every(Boolean), "つめると、すきまが無い");
  sound(w, "整頓のあと");
}

section("さがす");
{
  const w = World.starter();
  const [a, b] = w.room.map((r) => r.cid);
  const sub = w.addChest({ name: "2019年", parent: a });
  w.dropHand(inv([file("見積書.xlsx"), file("請求書.pdf")]), { zone: "into", cid: sub });
  w.dropHand(inv([file("見積書 最終.xlsx")]), { zone: "chest", cid: b, slot: 0 });
  const r = w.search("見積");
  eq(r.length, 2, "名前の一部で見つかる");
  eq(r[0].trail, ["しごと", "2019年"], "どのチェストの中かが分かる");
  eq(w.search("見積 最終").length, 1, "空白で区切ると、すべてを含むもの");
  ok(w.search("2019").some((x) => x.type === "chest"), "チェストの名前も見つかる");
  eq(w.search("   "), [], "空の言葉は何も返さない");
  eq(w.search("ＡＢＣ"), [], "無ければ空");
  eq(w.search("XLSX").length, 2, "大文字小文字は区別しない");
}

section("保存と読み込み");
{
  const w = World.starter();
  const [a, b] = w.room.map((r) => r.cid);
  const sub = w.addChest({ name: "サブ", parent: a, slot: 3 });
  w.dropHand(inv([file("1"), dir("D")]), { zone: "chest", cid: a, slot: 0 });
  w.dropHand(inv([file("2")]), { zone: "into", cid: sub });
  w.setHotbar(0, file("1"));
  w.setHotbar(1, chestItem(sub));
  const { meta, chests } = w.toParts();
  const back = World.fromParts(JSON.parse(JSON.stringify(meta)), JSON.parse(JSON.stringify(chests)));
  eq(back.toParts(), { meta, chests }, "書いて読むと同じ");
  sound(back, "読み込んだあと");
  ok(back.nextId >= w.nextId, "番号は続きから");
  const c2 = back.addChest({ name: "新" });
  ok(!w.chests[c2] && c2 !== sub && c2 !== a, "新しい番号が重ならない");
}

section("壊れた保存を読む");
{
  const good = World.starter().toParts();
  const [a, b, c] = good.meta.ids;
  // 部屋に置かれていないチェスト・消えたチェストを指すスロット・2か所から置かれたチェスト・部屋の外・升の重なり・ふつうでない値
  const chests = JSON.parse(JSON.stringify(good.chests));
  chests[a].slots = [{ t: "c", cid: "zzz" }, { t: "c", cid: b }, { t: "f", path: "C:\\x\\y.txt" }, null, 5, "ぬ", { t: "f" }, { t: "f", path: "C:\\k", id: 5 }];
  chests[b].slots = [{ t: "c", cid: b }, { t: "c", cid: a }];
  const meta = { ...good.meta, room: [{ c: a, x: 2, y: 3 }, { c: b, x: 2, y: 3 }, { c: c, x: -1, y: 0 }, { c: c, x: 99, y: 0 }, { c: "ぬ", x: 0, y: 0 }, null, { c: c, x: "1", y: 0 }], hotbar: [{ t: "c", cid: "zzz" }, { t: "f", path: "C:\\h.txt", name: "h.txt" }, 3, null] };
  const w = World.fromParts(meta, chests);
  sound(w, "壊れた保存を読んだあと");
  ok(w.room.length === 1 && w.room[0].cid === a, "置ける升のものだけ残る");
  ok(!w.chest(c), "どこにも置かれないチェストは消える");
  ok(w.chest(b) && w.parentOf(b).cid === a, "ほかのチェストのスロットに置かれていれば残る");
  eq(w.chest(b).slots.filter(Boolean).length, 0, "自分や親を指すスロットは外れる");
  eq(w.chest(a).slots.filter(Boolean).length, 3, "読めた参照だけ残る");
  ok(w.hotbar.filter(Boolean).length === 1 && w.hotbar[1].name === "h.txt", "ホットバーも読めた分だけ");
  ok(w.chest(a).slots.some((s) => s && s.path === "C:\\k" && s.name === "k" && s.id === ""), "名前が無ければパスから、IDが数なら空に");
  ok(World.fromParts(null, null).chestCount === 3, "何も無ければはじめのワールド");
  ok(World.fromParts({ v: 1 }, {}).chestCount === 0, "meta だけなら空のワールド");
  // 巨大な保存
  const big = World.starter().toParts();
  big.chests[big.meta.ids[0]].slots = Array.from({ length: 20000 }, (_, i) => ({ t: "f", id: String(i), path: `C:\\f${i}`, name: `f${i}` }));
  const wb = World.fromParts(big.meta, big.chests);
  ok(wb.chest(big.meta.ids[0]).slots.length <= C.MAX_SLOTS, "スロットは上限まで");
}

section("参照の直し（名前の変更）");
{
  const w = World.starter();
  const [a, b] = w.room.map((r) => r.cid);
  w.dropHand(inv([file("old.txt", "77")]), { zone: "chest", cid: a, slot: 0 });
  w.dropHand({ ...inv([file("old.txt", "77")]), copy: true }, { zone: "chest", cid: b, slot: 0 });
  w.setHotbar(0, file("old.txt", "77"));
  const undoLen = w._undo.length;
  const n = w.refreshRef("i:77", { path: "C:\\Docs\\new.txt", name: "new.txt", ext: "txt" });
  eq(n, 2, "チェスト2か所を直す");
  ok(w.chest(a).slots[0].name === "new.txt" && w.chest(b).slots[0].path.endsWith("new.txt") && w.hotbar[0].name === "new.txt", "どこでも直る");
  eq(w._undo.length, undoLen, "元に戻す記録には積まない");
  ok(w.refreshRef("i:77", { name: "new.txt" }) === 0, "変わらなければ何もしない");
  ok(keyOf(w.chest(a).slots[0]) === "i:77", "ID は同じ");
}

section("乱数で操作を重ねても、木の決まりが破れない");
{
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  let w = World.starter();
  let bad = null;
  let steps = 0;
  const files = Array.from({ length: 30 }, (_, i) => file(`f${i}.txt`, 1000 + i));
  for (let i = 0; i < 4000 && !bad; i++) {
    const ids = Object.keys(w.chests);
    const op = Math.floor(rnd() * 14);
    const cid = pick(ids) ?? null;
    const slot = Math.floor(rnd() * 20);
    steps++;
    try {
      if (op === 0) w.run("add", () => w.addChest({ name: `n${i}`, parent: rnd() < 0.5 ? null : cid, slot }));
      else if (op === 1 && cid) w.run("rm", () => (ids.length > 2 ? w.removeChest(cid) : 0));
      else if (op === 2) w.run("drop", () => w.dropHand(inv([pick(files), pick(files)]), { zone: "chest", cid, slot }));
      else if (op === 3 && cid) {
        const s = w.chest(cid).slots.map((x, k) => (x ? k : -1)).filter((k) => k >= 0);
        if (s.length) { const k = pick(s); w.run("mv", () => w.dropHand(fromChest(w, cid, [k]), { zone: "chest", cid: pick(ids), slot })); }
      } else if (op === 4 && cid) w.run("nest", () => w.nestChest(cid, pick(ids), slot));
      else if (op === 5 && cid) w.run("room", () => w.moveChestToRoom(cid, Math.floor(rnd() * 8), Math.floor(rnd() * 8)));
      else if (op === 6) w.undo();
      else if (op === 7) w.redo();
      else if (op === 8 && cid) w.run("sort", () => w.sortChest(cid, pick(["name", "type", "size", "modified", "compact"]), () => ({ size: rnd() * 100, modified: rnd() * 100 })));
      else if (op === 9 && cid) {
        const s = w.chest(cid).slots.map((x, k) => (x ? k : -1)).filter((k) => k >= 0);
        if (s.length) { const k = pick(s); w.run("mv2", () => w.dropHand(fromChest(w, cid, [k]), { zone: "into", cid: pick(ids) })); }
      } else if (op === 10 && cid) {
        const s = w.chest(cid).slots.map((x, k) => (x ? k : -1)).filter((k) => k >= 0).slice(0, 3);
        if (s.length) w.run("multi", () => w.dropHand(fromChest(w, cid, s), { zone: "chest", cid: pick(ids), slot }));
      } else if (op === 11) w.run("hot", () => w.dropHand(inv([pick(files)]), { zone: "hotbar", slot: slot % 9 }));
      else if (op === 12 && cid) w.run("inv", () => { const s = w.chest(cid).slots.map((x, k) => (x ? k : -1)).filter((k) => k >= 0); if (s.length) w.dropHand(fromChest(w, cid, [pick(s)]), { zone: "inv" }); });
      else if (op === 13) { const { meta, chests } = w.toParts(); const u = w._undo, r = w._redo; w = World.fromParts(JSON.parse(JSON.stringify(meta)), JSON.parse(JSON.stringify(chests))); w._undo = []; w._redo = []; void u; void r; }
    } catch (e) { bad = `例外 op=${op} ${e.stack}`; }
    const b = w.check();
    if (b.length && !bad) bad = `op=${op} step=${i}：${b.join(" / ")}`;
  }
  ok(!bad, `${steps} 回の操作のあいだ、木の決まりが保たれる ${bad || ""}`);
  const { meta, chests } = w.toParts();
  eq(World.fromParts(JSON.parse(JSON.stringify(meta)), JSON.parse(JSON.stringify(chests))).toParts(), { meta, chests }, "最後の形も、書いて読むと同じ");
}

section("コピーして落とす");
{
  const w = World.starter();
  const [a, b] = w.room.map((r) => r.cid);
  w.dropHand(inv([file("x.txt")]), { zone: "chest", cid: a, slot: 0 });
  let r = w.dropHand({ ...fromChest(w, a, [0]), copy: true }, { zone: "chest", cid: b, slot: 0 });
  ok(r.ok && w.locate(keyOf(file("x.txt"))).length === 2, "ほかのチェストへは、コピーできる");
  r = w.dropHand({ ...fromChest(w, a, [0]), copy: true }, { zone: "chest", cid: a, slot: 5 });
  ok(!r.ok && r.reason === "dup" && names(w, a).filter((n) => n === "x.txt").length === 1, "同じチェストの中では、コピーしても増えない");
  const sub = w.addChest({ name: "S", parent: a, slot: 3 });
  r = w.dropHand({ ...fromChest(w, a, [3]), copy: true }, { zone: "chest", cid: b, slot: 9 });
  ok(r.ok && w.parentOf(sub).cid === b, "チェストはコピーできず、移る");
  sound(w, "コピーのあと");
}

section("保存の部品");
{
  const P = await import(st.url("persist.js"));
  const mem = new Map();
  const calls = [];
  const storage = {
    get: async (k) => (mem.has(k) ? JSON.parse(JSON.stringify(mem.get(k))) : undefined),
    set: async (k, v) => { calls.push(["set", k]); if (storage.fail && storage.fail(k)) throw Object.assign(new Error("io"), { code: "io" }); mem.set(k, JSON.parse(JSON.stringify(v))); },
    delete: async (k) => { calls.push(["delete", k]); mem.delete(k); },
  };
  const errors = [];
  const s1 = P.createStore(storage, { delay: 5, onError: (e) => errors.push(e.message) });
  ok((await s1.load()) === null, "保存が無ければ null");
  const w = World.starter();
  s1.schedule(w);
  await s1.flush();
  ok(mem.has("w") && mem.has(`c.${w.room[0].cid}`), "はじめて書くと、meta とチェストが入る");
  const firstWrites = calls.filter((c) => c[0] === "set").length;
  eq(firstWrites, 4, "meta 1つとチェスト3つ");
  calls.length = 0;
  const [a, b] = w.room.map((r) => r.cid);
  w.run("入れる", () => w.dropHand(inv([file("1")]), { zone: "chest", cid: a, slot: 0 }));
  s1.schedule(w);
  await s1.flush();
  eq(calls.map((c) => c.join(" ")), [`set c.${a}`], "変わったチェストだけ書く。meta が変わらなければ書かない");
  calls.length = 0;
  w.run("名前", () => w.rename(b, "新しい名前"));
  w.run("動かす", () => w.moveChestToRoom(a, 0, 0));
  s1.schedule(w);
  await s1.flush();
  eq(calls.map((c) => c.join(" ")), [`set c.${b}`, "set w"], "チェストが先、meta があと");
  calls.length = 0;
  w.run("こわす", () => w.removeChest(a));
  s1.schedule(w);
  await s1.flush();
  ok(calls.some((c) => c.join(" ") === `delete c.${a}`) && !mem.has(`c.${a}`), "こわしたチェストの保存は消える");
  eq(calls.findIndex((c) => c[1] === "w") < calls.findIndex((c) => c[0] === "delete"), true, "meta を先に直してから、消す");
  // 続けて呼ぶと、最後の1回だけ
  calls.length = 0;
  for (let i = 0; i < 20; i++) { w.run("名前", () => w.rename(b, `名前${i}`)); s1.schedule(w); }
  await new Promise((r) => setTimeout(r, 60));
  eq(calls.filter((c) => c[1] === `c.${b}`).length, 1, "続けて変えても、書くのは1回");
  // 読み直すと同じ
  const s2 = P.createStore(storage, {});
  const back = await s2.load();
  eq(back.toParts(), w.toParts(), "読み直すと、同じワールド");
  s2.schedule(back);
  calls.length = 0;
  await s2.flush();
  eq(calls, [], "読み込んだだけなら、何も書かない");
  // 書けないとき
  storage.fail = (k) => k.startsWith("c.");
  w.run("名前", () => w.rename(b, "書けない"));
  s1.schedule(w);
  await s1.flush();
  ok(errors.length === 1, "書けなかったことを知らせる");
  storage.fail = null;
  s1.schedule(w);
  await s1.flush();
  eq((await storage.get(`c.${b}`)).name, "書けない", "書けるようになったら、次の保存で書かれる");
  // 設定
  const p = await P.loadPrefs({ get: async () => ({ view: "ぬ", rot: 9, zoom: 99, hide: 1, seen: true }) });
  eq([p.view, p.rot, p.zoom, p.hide, p.seen], ["caption", 1, 2.2, true, true], "設定の値は、範囲に直す");
  eq((await P.loadPrefs({ get: async () => { throw new Error("x"); } })).view, "caption", "読めなければ初期値");
}

section("画面の文字の整え");
{
  const T = await import(st.url("text.js"));
  eq([T.fmtSize(0), T.fmtSize(1023), T.fmtSize(1024), T.fmtSize(1536), T.fmtSize(10 * 1024 * 1024), T.fmtSize(-1), T.fmtSize(NaN)], ["0 B", "1023 B", "1.00 KB", "1.50 KB", "10.0 MB", "", ""], "大きさ");
  ok(/^\d{4}\/\d\d\/\d\d \d\d:\d\d$/.test(T.fmtDate(Date.UTC(2026, 9, 27, 5, 3))) && T.fmtDate(0) === "", "日付");
  eq([T.typeName("pdf"), T.typeName("")], ["PDFファイル", "ファイル"], "種類の名前");
  eq([T.parentPath("C:\\Users\\me"), T.parentPath("C:\\Users"), T.parentPath("C:\\"), T.parentPath("C:\\a\\b\\")], ["C:\\Users", "C:\\", null, "C:\\a"], "親のフォルダ");
  eq([T.nameMatches("見積書 最終版.xlsx", "見積 最終"), T.nameMatches("Report.PDF", "report"), T.nameMatches("a", "b"), T.nameMatches("a", "  ")], [true, true, false, true], "名前の絞り込み");
  eq(T.shortPath("C:\\a\\b\\c\\d", 2), "…\\c\\d", "長いパスを短く");
}

section("絵の部品が出す形");
{
  const S = fs.readFileSync(path.join(MOD_DIR, "sprites.js"), "utf8");
  const sets = [...S.matchAll(/(\w+): "([a-z0-9 ]+)",/g)].map((m) => [m[1], m[2].split(" ")]);
  const all = sets.flatMap(([, l]) => l);
  ok(new Set(all).size === all.length, "拡張子が、どの絵とも重ならない");
  ok(all.includes("pdf") && all.includes("xlsx") && all.includes("mp3") && all.includes("png") && all.includes("zip"), "よく使う拡張子がある");
}

section("3D のワールド：地形");
const B = await import(st.url("blocks.js"));
const T = await import(st.url("terrain.js"));
const Lt = await import(st.url("light.js"));
const Ms = await import(st.url("mesher.js"));
const Ph = await import(st.url("physics.js"));
let terrain, lit;
{
  const t0 = Date.now();
  terrain = T.generate(7);
  const tGen = Date.now() - t0;
  const { blocks } = terrain;
  const at = (x, y, z) => blocks[T.index(x, y, z)];
  ok(blocks.length === T.SX * T.SY * T.SZ, "大きさ");
  console.log(`  地形を作る ${tGen} ミリ秒`);
  const H = T.HALL, F = T.FLOOR;
  // 台座：チェストの升ごとに 1 つ。床の上
  let pads = 0;
  for (let cy = 0; cy < C.ROOM_N; cy++) for (let cx = 0; cx < C.ROOM_N; cx++) {
    const b = T.cellBlock(cx, cy);
    if (at(b.x, b.y, b.z) === B.PAD && at(b.x, b.y + 1, b.z) === B.AIR && at(b.x, b.y + 2, b.z) === B.AIR) pads++;
  }
  eq(pads, C.ROOM_N * C.ROOM_N, "台座が升の数だけあり、上が空いている");
  ok(at(H.x0, F + 3, H.z0 + 8) === B.AIR && at(H.x0 + 8, F + 5, H.z0 + 8) === B.AIR, "広間の中は空いている");
  ok(at(H.x0 + 7, F + 6, H.z0 + 7) === B.DARK && at(H.x0 + 2, F + 6, H.z0 + 2) === B.GLOW && at(H.x0 + 8, F + 6, H.z0 + 8) === B.GLOW, "天井と、天井の明かり");
  ok(at(T.DOOR.x, F + 1, H.z0 + H.d) === B.AIR && at(T.DOOR.x, F + 3, H.z0 + H.d) === B.AIR && at(T.DOOR.x, F + 4, H.z0 + H.d) === B.DARK, "南の壁に、入口が開いている");
  ok(at(H.x0 - 1, F + 3, H.z0 + 3) === B.GLASS && at(H.x0 + 17, F + 2, H.z0 + 13) === B.GLASS, "窓がある");
  ok([...terrain.torches.keys()].every((i) => blocks[i] === B.TORCH) && terrain.torches.size >= 10, "たいまつが壁に付いている");
  for (const [i, t] of terrain.torches) {
    const x = i % T.SX, z = ((i / T.SX) | 0) % T.SZ, y = (i / (T.SX * T.SZ)) | 0;
    if (!B.SOLID[at(x + t.ax, y, z + t.az)]) { ok(false, `たいまつ ${x},${y},${z} の向きの先に壁が無い`); break; }
  }
  // 歩ける：始まりの場所
  const sp = terrain.spawn;
  ok(!Ph.collides(blocks, sp.x, sp.y, sp.z, 1.8) && Ph.collides(blocks, sp.x, sp.y - 0.1, sp.z, 0.05), "はじまりの場所は、床の上で、どこにも埋まっていない");
  // 木・草・花がある。広間のまわりには無い
  let trees = 0, grass = 0;
  for (let i = 0; i < blocks.length; i++) { if (blocks[i] === B.LOG) trees++; if (blocks[i] === B.TALL) grass++; }
  ok(trees > 100 && grass > 500, `木と草がある 丸太 ${trees} 草 ${grass}`);
  ok(T.groundHeight(H.x0 + 8, H.z0 + 8) === F && T.groundHeight(T.DOOR.x, H.z0 + H.d + 8) === F, "広間と、入口の道は平ら");
  ok(Array.from({ length: 80 }, (_, i) => T.groundHeight(i, 100)).every((h) => h >= 2 && h <= 14), "地面の高さは範囲の中");
  eq(T.cellOfBlock(H.x0 + 1, H.z0 + 1), { cx: 0, cy: 0, exact: true }, "台座のブロックは、その升");
  eq(T.cellOfBlock(H.x0 + 16, H.z0 + 16), { cx: 7, cy: 7, exact: false }, "通路のブロックは、近い升。ぴったりではない");
  ok(T.cellOfBlock(H.x0 - 1, H.z0) === null, "広間の外は無い");
}

section("3D のワールド：光");
{
  const t0 = Date.now();
  lit = Lt.computeLight(terrain.blocks);
  console.log(`  光を計算 ${Date.now() - t0} ミリ秒`);
  const H = T.HALL, F = T.FLOOR;
  const I = (x, y, z) => T.index(x, y, z);
  eq(lit.sky[I(5, T.SY - 1, 5)], 15, "空の上は 15");
  eq(lit.sky[I(5, F + 4, 5)], 15, "外の地面の上も 15");
  ok(lit.sky[I(H.x0 + 8, F + 3, H.z0 + 8)] < 10, "広間のまんなかは、空の光がほとんど届かない");
  ok(lit.sky[I(H.x0 + 1, F + 2, H.z0 + 3)] > 8, "窓のそばには、空の光が入る");
  eq(lit.blk[I(H.x0 + 2, F + 6, H.z0 + 2)], 15, "光るブロックは 15");
  eq(lit.blk[I(H.x0 + 2, F + 5, H.z0 + 2)], 14, "となりは 14。1つごとに 1 ずつ弱くなる");
  ok(lit.blk[I(H.x0 + 8, F + 2, H.z0 + 8)] >= 6, "広間のまんなかも、明かりでほどよく明るい");
  ok(lit.blk[I(H.x0 + 8, F + 2, H.z0 + 8)] <= 15 && lit.blk.every((v) => v <= 15), "光は 15 まで");
  let q = 0;
  for (let i = 0; i < terrain.blocks.length && q < 1; i++) if (B.OPAQUE[terrain.blocks[i]] && (lit.sky[i] || (lit.blk[i] && !B.EMIT[terrain.blocks[i]]))) q++;
  eq(q, 0, "ブロックの中には、光が入らない。光るブロックだけが自分の光を持つ");
}

section("3D のワールド：面を作る");
{
  const w = { blocks: terrain.blocks, sky: lit.sky, blk: lit.blk, torches: terrain.torches };
  const t0 = Date.now();
  let tris = 0, bad = "", glassTris = 0, maxY = 0;
  const nl = B.LAYER_NAMES.length;
  for (let cz = 0; cz < Ms.CHUNKS_Z; cz++) for (let cx = 0; cx < Ms.CHUNKS_X; cx++) {
    const r = Ms.buildChunk(w, cx, cz);
    for (const part of [r.main, r.blend]) {
      if (part.index.length % 3) bad = "三角形の数が 3 で割れない";
      for (let k = 0; k < part.index.length && !bad; k++) if (part.index[k] >= part.verts.length / Ms.STRIDE) bad = "頂点の番号がはみ出す";
      for (let k = 0; k < part.verts.length && !bad; k += Ms.STRIDE) {
        const L = part.verts[k + 5];
        if (!(L >= 0 && L < nl && Number.isInteger(L))) bad = `絵の層が変 ${L}`;
        for (let m = 6; m < 10; m++) if (!(part.verts[k + m] >= 0 && part.verts[k + m] <= 1)) bad = `光の値が 0〜1 の外 ${part.verts[k + m]}`;
        for (let m = 0; m < 5; m++) if (!Number.isFinite(part.verts[k + m])) bad = "数が有限でない";
      }
    }
    tris += r.main.count / 3;
    glassTris += r.blend.count / 3;
    maxY = Math.max(maxY, r.maxY);
  }
  console.log(`  面を作る ${Date.now() - t0} ミリ秒  三角形 ${tris}  ガラス ${glassTris}`);
  ok(!bad, `すべての頂点が正しい ${bad}`);
  ok(tris > 20000 && tris < 600000, `三角形の数が、ほどよい ${tris}`);
  ok(glassTris > 20, "ガラスは別の組");
  ok(maxY < T.SY, "高さが収まる");
  // 台座の上にチェストの印を置いても、面は増えない
  const b = T.cellBlock(3, 3);
  const chunkOf = (x, z) => Ms.buildChunk(w, x >> 4, z >> 4);
  const before = chunkOf(b.x, b.z).main.count;
  terrain.blocks[T.index(b.x, b.y + 1, b.z)] = B.CHEST;
  eq(chunkOf(b.x, b.z).main.count, before + 0 * 1, "チェストの印の所には、面を作らない（面が増えるのは、まわりの面が見えるようになるときだけ）");
  terrain.blocks[T.index(b.x, b.y + 1, b.z)] = B.AIR;
  // チェストの形
  for (const k of C.KIND_IDS) {
    const g = Ms.chestGeometry(k);
    ok(g.body.verts.length === 24 * Ms.STRIDE && g.lid.verts.length === 24 * Ms.STRIDE && g.body.count === 36 && g.lid.count === 36, `チェスト ${k} の形は、体とふたで箱 1 つずつ`);
    const layers = [...g.body.verts, ...g.lid.verts].filter((_, i) => i % Ms.STRIDE === 5);
    ok(layers.every((l) => l >= B.LAYER.chest_oak_bs - 0 && l < nl), `チェスト ${k} の絵の層`);
  }
  eq(new Set(B.LAYER_NAMES).size, B.LAYER_NAMES.length, "絵の層の名前が重ならない");
  ok(B.LAYER_NAMES.length <= 256, "層は 256 まで");
}

section("3D のワールド：歩く・ぶつかる・見る");
{
  const blocks = terrain.blocks.slice();
  const sp = terrain.spawn;
  const p = Ph.createPlayer(sp);
  const run = (inp, sec) => { for (let i = 0; i < sec * 60; i++) Ph.step(blocks, p, inp, 1 / 60); };
  run({}, 1);
  ok(p.onGround && Math.abs(p.y - (T.FLOOR + 1)) < 0.01, "立っていると、床の上で止まる");
  // 落ちる
  p.y += 2.5; p.onGround = false;
  run({}, 1);
  ok(p.onGround && Math.abs(p.y - (T.FLOOR + 1)) < 0.01, "高い所から落ちて、床に着く");
  // ジャンプの高さ
  let top = 0;
  for (let i = 0; i < 60; i++) { Ph.step(blocks, p, { jump: true }, 1 / 60); top = Math.max(top, p.y - (T.FLOOR + 1)); }
  ok(top > 1.1 && top < 1.5, `ジャンプは、およそ 1.25 ブロック ${top.toFixed(2)}`);
  run({}, 1);
  // 前へ歩く（北へ）：奥の壁でとまる
  const z0 = p.z;
  run({ fwd: 1 }, 1);
  ok(z0 - p.z > 3.5 && z0 - p.z < 4.6, `1秒で、およそ 4.3 ブロック歩く ${(z0 - p.z).toFixed(2)}`);
  run({ fwd: 1 }, 6);
  ok(Math.abs(p.z - (T.HALL.z0 + 0.3)) < 0.02, `北の壁で止まる ${p.z.toFixed(2)}`);
  // 走る
  const q = Ph.createPlayer(sp);
  const runq = (inp, sec) => { for (let i = 0; i < sec * 60; i++) Ph.step(blocks, q, inp, 1 / 60); };
  runq({}, 1);
  const qz = q.z; runq({ fwd: 1, sprint: true }, 1);
  ok(qz - q.z > 5 && qz - q.z < 6.1, "走ると、速い");
  // しゃがむと遅く、目が低い
  const s = Ph.createPlayer(sp); s.y = sp.y;
  for (let i = 0; i < 60; i++) Ph.step(blocks, s, {}, 1 / 60);
  const sz = s.z; for (let i = 0; i < 60; i++) Ph.step(blocks, s, { fwd: 1, sneak: true }, 1 / 60);
  ok(sz - s.z < 1.6 && Ph.eyeHeight(s) < Ph.EYE, "しゃがむと、遅く、目が低い");
  // 入口から外へ：南へ歩くと広間を出る
  const o = Ph.createPlayer(sp);
  for (let i = 0; i < 60 * 8; i++) Ph.step(blocks, o, { fwd: -1 }, 1 / 60);
  ok(o.z > T.HALL.z0 + T.HALL.d + 4, `入口を通って、外へ出られる z=${o.z.toFixed(1)}`);
  ok(Math.abs(o.x - (T.DOOR.x + 0.5)) < 1.2, "入口の幅の中を通る");
  // 横の壁
  const e = Ph.createPlayer(sp);
  for (let i = 0; i < 60 * 8; i++) Ph.step(blocks, e, { right: 1 }, 1 / 60);
  ok(Math.abs(e.x - (T.HALL.x0 + 17 - 0.3)) < 0.02, "東の壁で止まる");
  // 飛ぶ
  const f = Ph.createPlayer(sp); f.flying = true;
  for (let i = 0; i < 60; i++) Ph.step(blocks, f, { up: 1 }, 1 / 60);
  ok(f.y > sp.y + 2.5, "飛ぶと、のぼる");
  for (let i = 0; i < 60 * 2; i++) Ph.step(blocks, f, { up: 1 }, 1 / 60);
  ok(f.y < T.FLOOR + 6, "天井にぶつかる");
  // 世界のはしの外へは出ない
  const w = Ph.createPlayer({ x: 2, y: 20, z: 2, yaw: 0 });
  for (let i = 0; i < 60 * 3; i++) Ph.step(blocks, w, { fwd: 1, right: -1 }, 1 / 60);
  ok(w.x >= Ph.HALF - 0.001 && w.z >= Ph.HALF - 0.001, "世界のはしの外へは出ない");
  // チェストの升はぶつかる
  const b = T.cellBlock(3, 3);
  blocks[T.index(b.x, b.y + 1, b.z)] = B.CHEST;
  ok(Ph.collides(blocks, b.x + 0.5, b.y + 1, b.z + 0.5, 1.8), "チェストの升は、通りぬけられない");
  // 見る：下の床
  let hit = Ph.raycast(blocks, sp.x, sp.y + 1.62, sp.z, 0, -1, -0.5);
  ok(hit && hit.kind === "block" && hit.ny === 1 && hit.y === T.FLOOR, "足もとの床を狙うと、上の面が当たる");
  // チェストを狙う
  const cb = (x, y, z) => (blocks[T.index(x, y, z)] === B.CHEST ? [x + 1 / 16, y, z + 1 / 16, x + 15 / 16, y + 0.875, z + 15 / 16] : null);
  hit = Ph.raycast(blocks, b.x + 0.5, b.y + 1.5, b.z + 5.5, 0, -0.05, -1, 8, cb);
  ok(hit && hit.kind === "chest" && hit.x === b.x && hit.z === b.z && hit.nz === 1, "チェストを狙うと、前の面が当たる");
  ok(Math.abs(hit.dist - (5.5 - 15 / 16)) < 0.1, `距離が合う ${hit.dist.toFixed(2)}`);
  // チェストの箱の外を通る光線は、通りぬける
  hit = Ph.raycast(blocks, b.x + 0.02, b.y + 1.5, b.z + 5.5, 0, 0, -1, 8, cb);
  ok(!hit || hit.kind !== "chest", "チェストの箱をかすめた光線は、チェストには当たらない");
  ok(Ph.raycast(blocks, sp.x, sp.y + 1.62, sp.z, 0, 0, 1, 1.5) === null, "とどかない先は、当たらない");
  const rb = Ph.rayBox(0, 0, 0, 1, 0, 0, [2, -1, -1, 3, 1, 1]);
  ok(rb && rb.t === 2 && rb.nx === -1, "光線と箱");
  ok(Ph.rayBox(0, 0, 0, 1, 0, 0, [2, 2, 2, 3, 3, 3]) === null, "外れる");
}

section("manifest・書き方の決まり");
{
  const manifest = JSON.parse(fs.readFileSync(path.join(MOD_DIR, "manifest.json"), "utf8").replace(/^\uFEFF/, ""));
  ok(/^[a-z0-9][a-z0-9.-]{1,62}[a-z0-9]$/.test(manifest.id), "id の形");
  ok(manifest.name.length >= 1 && manifest.name.length <= 40, "名前は40文字まで");
  ok(/^\d+\.\d+\.\d+$/.test(manifest.version), "版の形");
  ok(manifest.apiVersion === 1 && fs.existsSync(path.join(MOD_DIR, manifest.entry)), "入口がある");
  ok((manifest.description || "").length <= 200, "説明は200文字まで");
  ok(!manifest.network, "通信しない");
  const forbidden = ["trash", "createFolder", "files.create", "createShortcut", "clipboard", "net.fetch", "readText", "readBytes", "drag.start", "tags.assign"];
  const src = fs.readdirSync(MOD_DIR).filter((f) => f.endsWith(".js")).map((f) => [f, stripComments(fs.readFileSync(path.join(MOD_DIR, f), "utf8"))]);
  for (const [f, text] of src) {
    for (const w of forbidden) ok(!text.includes(w), `${f} が ${w} を呼ばない`);
    // 本物の名前を変えるのは、本体のメニューで利用者が「名前の変更」を選んだとき（onAction）の1か所だけ
    const renames = (text.match(/\b(ep|explorerPlus)\.rename\b/g) || []).length;
    ok(f === "index.js" ? renames === 1 && text.includes("ep.onAction") && /async function renameReal[\s\S]*?ep\.rename/.test(text) : renames === 0, `${f} が本物のファイルの名前を変えるのは、メニューで選ばれたときだけ`);
  }
  for (const [f, text] of src) {
    const lines = text.split("\n");
    lines.forEach((l, i) => { if (/[（）]/.test(l)) ok(false, `${f}:${i + 1} 画面の文章に全角の括弧がある ${l.trim().slice(0, 60)}`); });
  }
  const used = new Set(manifest.uses);
  const needs = { entries: "onFolder", links: "resolve", search: "search.find", icons: "iconUrl", thumbnails: "thumbnailUrl", pointerLock: "requestPointerLock" };
  const all = src.map(([, t]) => t).join("\n");
  for (const [u, w] of Object.entries(needs)) if (all.includes(w)) ok(used.has(u), `${w} を使うので uses に ${u}`);
}

console.log(fail ? `\n${fail} 件が失敗（全 ${total} 件）` : `\nすべて通った（${total} 件）`);
process.exit(fail ? 1 : 0);

function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => {
    const i = l.search(/(^|[^:"'`])\/\//);
    return i < 0 ? l : l.slice(0, i + (l[i] === "/" ? 0 : 1));
  }).join("\n");
}
