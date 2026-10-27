// 画面に出す数や日付の整え方。

export function fmtSize(n) {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)} ${u[i]}`;
}

export function fmtDate(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const d = new Date(ms);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function typeName(ext) {
  return ext ? `${String(ext).toUpperCase()}ファイル` : "ファイル";
}

/** パスの終わりの数個だけ。長いパスを短く見せる */
export function shortPath(p, n = 3) {
  const parts = String(p || "").replace(/\\$/, "").split("\\");
  return parts.length <= n ? parts.join("\\") : `…\\${parts.slice(-n).join("\\")}`;
}

/** 名前の絞り込み。空白で区切ると、すべてを含むもの。大文字小文字は区別しない */
export function nameMatches(name, query) {
  const toks = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!toks.length) return true;
  const n = String(name).toLowerCase();
  return toks.every((t) => n.includes(t));
}

/** 親のフォルダ */
export function parentPath(p) {
  const s = String(p || "").replace(/\\+$/, "");
  const i = s.lastIndexOf("\\");
  return i > 2 ? s.slice(0, i) : i === 2 ? s.slice(0, 3) : null;
}
