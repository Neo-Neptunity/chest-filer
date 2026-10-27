// 数と種類の決まり。画面にも本体にも触れない。

export const COLS = 9;             // チェストの横のスロット数
export const HOTBAR = 9;           // ホットバーのスロット数
export const ROOM_N = 8;           // 部屋の広さ。N × N 升
export const NAME_MAX = 40;        // チェストの名前の長さ
export const MAX_SLOTS = COLS * 150;
export const MAX_CHESTS = 2000;
export const MIN_ROWS = 3;

/** チェストの種類。木の種類で見分ける */
export const KINDS = [
  { id: "oak", name: "オーク" },
  { id: "spruce", name: "トウヒ" },
  { id: "birch", name: "シラカバ" },
  { id: "jungle", name: "ジャングル" },
  { id: "acacia", name: "アカシア" },
  { id: "darkoak", name: "ダークオーク" },
  { id: "cherry", name: "サクラ" },
  { id: "crimson", name: "クリムゾン" },
  { id: "warped", name: "ワープド" },
  { id: "ender", name: "エンダー" },
];
export const DEFAULT_KIND = "oak";
export const KIND_IDS = KINDS.map((k) => k.id);

/** 整頓の並べかた */
export const SORTS = [
  { id: "compact", name: "つめる", hint: "並びはそのまま" },
  { id: "name", name: "名前順" },
  { id: "type", name: "種類順" },
  { id: "size", name: "大きい順" },
  { id: "modified", name: "新しい順" },
];
