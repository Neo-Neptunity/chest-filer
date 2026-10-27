// 試験用の種。偽のフォルダに、仕事の書類・写真・音楽などを置き、にぎわうワールドを作る。

export const HOME = "C:\\Users\\me";
export const DOCS = `${HOME}\\Documents`;

const DOC_FILES = [
  "見積書 2019.xlsx", "見積書 最終版.xlsx", "請求書 10月.pdf", "請求書 11月.pdf", "契約書 ひな形.docx", "企画書 新製品.pptx", "議事録 0412.txt", "議事録 0510.txt",
  "報告書 第3四半期.docx", "売上集計.xlsx", "顧客リスト.csv", "README.md", "メモ.txt", "スケジュール.xlsx", "提案資料 A案.pptx", "提案資料 B案.pptx",
  "領収書 スキャン.pdf", "名刺データ.csv", "ロゴ案.png", "会議の録音.mp3", "研修動画.mp4", "setup.exe", "backup.zip", "script.js", "index.html",
];

export function seedFs(fs) {
  fs.mkdirp(DOCS);
  for (const n of DOC_FILES) fs.add(`${DOCS}\\${n}`);
  for (const f of ["仕事", "アーカイブ", "写真の整理"]) fs.mkdirp(`${DOCS}\\${f}`);
  for (const n of ["旧 見積書.xlsx", "旧 契約書.docx", "引き継ぎ資料.pdf"]) fs.add(`${DOCS}\\仕事\\${n}`);
  fs.mkdirp(`${DOCS}\\仕事\\2019年`);
  fs.add(`${DOCS}\\仕事\\2019年\\決算メモ.txt`);
  const pics = [["#e76f51", "#264653"], ["#2a9d8f", "#e9c46a"], ["#4aa3df", "#2d6a4f"], ["#9b5de5", "#f15bb5"], ["#ffb703", "#fb8500"], ["#06d6a0", "#118ab2"]];
  pics.forEach(([c1, c2], i) => fs.add(`${HOME}\\Pictures\\旅行 ${String(i + 1).padStart(2, "0")}.jpg`, "file", { c1, c2 }));
  fs.add(`${HOME}\\Pictures\\スクリーンショット.png`, "file", { c1: "#355070", c2: "#b56576" });
  fs.mkdirp(`${HOME}\\Music`);
  fs.add(`${HOME}\\Music\\好きな曲.mp3`);
  fs.mkdirp(`${HOME}\\Downloads`);
  fs.add(`${HOME}\\Downloads\\installer.exe`);
  fs.add(`${DOCS}\\.hidden-config`, "file", { hidden: true });
  return fs;
}

/** 保存されたワールドの形（meta と chests）を作る。model.js の World を渡す */
export function seedWorld(World, fs) {
  const w = World.starter();
  const [work, photo, later] = w.room.map((r) => r.cid);
  const it = (path) => {
    const n = fs.get(path);
    return { t: "f", id: n.id, path: n.path, name: n.name, k: n.kind === "folder" ? "d" : "f", ext: n.kind === "folder" ? "" : n.name.split(".").pop().toLowerCase() };
  };
  const put = (cid, paths) => w.dropHand({ items: paths.map(it), from: paths.map(() => ({ zone: "inv" })) }, { zone: "chest", cid, slot: 0 });
  put(work, ["見積書 2019.xlsx", "見積書 最終版.xlsx", "契約書 ひな形.docx", "企画書 新製品.pptx", "報告書 第3四半期.docx", "売上集計.xlsx"].map((n) => `${DOCS}\\${n}`));
  const y2019 = w.addChest({ name: "2019年", kind: "spruce", parent: work });
  put(y2019, [`${DOCS}\\仕事\\2019年\\決算メモ.txt`, `${DOCS}\\仕事\\旧 見積書.xlsx`]);
  const bill = w.addChest({ name: "請求書", kind: "acacia", parent: work });
  put(bill, [`${DOCS}\\請求書 10月.pdf`, `${DOCS}\\請求書 11月.pdf`]);
  put(photo, [1, 2, 3, 4].map((i) => `${HOME}\\Pictures\\旅行 0${i}.jpg`));
  w.addChest({ name: "旅行", kind: "cherry", parent: photo });
  put(later, [`${DOCS}\\メモ.txt`, `${DOCS}\\README.md`, `${HOME}\\Music\\好きな曲.mp3`, `${DOCS}\\仕事`]);
  w.addChest({ name: "資料", kind: "darkoak", x: 2, y: 5 });
  w.addChest({ name: "秘密", kind: "ender", x: 5, y: 5 });
  w.setHotbar(0, it(`${DOCS}\\企画書 新製品.pptx`));
  w.setHotbar(1, { t: "c", cid: work });
  w.setHotbar(2, it(`${DOCS}\\仕事`));
  w._undo = [];
  return w;
}
