// 偽の explorer_plus：メモリの中の Windows 風のフォルダと、それを見る explorerPlus。
// 本物と同じく、ファイルID が合わないと断る（denied）・無ければ not-found・名前を変えても ID は同じ。
// ブラウザの試験（browser.mjs が、ページに読み込む）と node の試験の両方で使える。

export function createFakeFs() {
  let nextId = 7000;
  const nodes = new Map();   // 小文字のパス → ノード
  const kids = new Map();    // 小文字のパス → Set(小文字のパス)
  const lc = (p) => p.toLowerCase();
  const parentOf = (p) => { const s = p.replace(/\\+$/, ""); const i = s.lastIndexOf("\\"); return i > 2 ? s.slice(0, i) : i === 2 ? s.slice(0, 3) : null; };
  const nameOf = (p) => p.replace(/\\+$/, "").slice(p.replace(/\\+$/, "").lastIndexOf("\\") + 1);
  const listeners = new Set();

  function add(path, kind = "file", extra = {}) {
    if (nodes.has(lc(path))) throw err("exists", path);
    const parent = parentOf(path);
    if (parent && !nodes.has(lc(parent))) mkdirp(parent);
    const n = { id: String(nextId++), name: nameOf(path), path, kind, size: kind === "file" ? extra.size ?? 1000 + (nextId * 7919) % 90000 : undefined, modified: extra.modified ?? Date.UTC(2026, 9, 1) + nextId * 3_600_000, ...extra };
    nodes.set(lc(path), n);
    if (kind === "folder") kids.set(lc(path), new Set());
    if (parent) kids.get(lc(parent)).add(lc(path));
    for (const l of listeners) l(parent);
    return n;
  }
  function mkdirp(path) {
    const parts = path.split("\\");
    for (let i = 1; i <= parts.length; i++) {
      const p = parts.slice(0, i).join("\\") + (i === 1 ? "\\" : "");
      if (!nodes.has(lc(p))) {
        const n = { id: String(nextId++), name: nameOf(p), path: p, kind: "folder", modified: Date.UTC(2026, 8, 1) };
        nodes.set(lc(p), n);
        kids.set(lc(p), new Set());
        const par = parentOf(p);
        if (par) kids.get(lc(par)).add(lc(p));
      }
    }
    return nodes.get(lc(path));
  }
  function rename(path, newName) {
    const n = nodes.get(lc(path));
    if (!n) throw err("not-found", path);
    const parent = parentOf(path);
    const to = `${parent}\\${newName}`;
    if (nodes.has(lc(to)) && lc(to) !== lc(path)) throw err("exists", to);
    const move = (from, dest) => {
      const node = nodes.get(lc(from));
      nodes.delete(lc(from));
      node.path = dest; node.name = nameOf(dest);
      nodes.set(lc(dest), node);
      if (node.kind === "folder") {
        const set = kids.get(lc(from));
        kids.delete(lc(from));
        const next = new Set();
        for (const c of set) { const cn = nodes.get(c); move(cn.path, `${dest}\\${cn.name}`); next.add(lc(`${dest}\\${cn.name}`)); }
        kids.set(lc(dest), next);
      }
    };
    kids.get(lc(parent)).delete(lc(path));
    move(path, to);
    kids.get(lc(parent)).add(lc(to));
    for (const l of listeners) l(parent);
    return n;
  }
  function remove(path) {
    const n = nodes.get(lc(path));
    if (!n) return;
    if (n.kind === "folder") for (const c of [...kids.get(lc(path))]) remove(nodes.get(c).path);
    nodes.delete(lc(path)); kids.delete(lc(path));
    const parent = parentOf(path);
    if (parent) kids.get(lc(parent)).delete(lc(path));
    for (const l of listeners) l(parent);
  }
  const list = (dir) => [...(kids.get(lc(dir)) || [])].map((p) => nodes.get(p)).sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, "ja", { numeric: true }) : a.kind === "folder" ? -1 : 1));
  const byId = (id) => [...nodes.values()].find((n) => n.id === id);
  return { nodes, add, mkdirp, rename, remove, list, byId, get: (p) => nodes.get(lc(p)), onChange: (f) => listeners.add(f), parentOf };
}

function err(code, message) {
  return Object.assign(new Error(`${code}: ${message}`), { code });
}

const svgIcon = (color, label) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect x="4" y="2" width="24" height="28" rx="3" fill="${color}"/><text x="16" y="21" font-size="9" text-anchor="middle" fill="#fff" font-family="sans-serif">${label}</text></svg>`)}`;
const svgThumb = (c1, c2) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="96" height="96" fill="url(#g)"/><circle cx="68" cy="28" r="10" fill="#ffe27a"/></svg>`)}`;
const ICON_BY_EXT = { docx: ["#2b6cd4", "W"], xlsx: ["#1f8a4c", "X"], pptx: ["#d65a1f", "P"], pdf: ["#c8372d", "PDF"], txt: ["#667", "TXT"], zip: ["#a77b2f", "ZIP"], exe: ["#445", "EXE"], mp3: ["#c23b7a", "♪"], mp4: ["#4a57c4", "▶"] };

export function entryOf(n) {
  const ext = n.kind === "file" && n.name.includes(".") ? n.name.split(".").pop().toLowerCase() : "";
  const e = { id: n.id, name: n.name, path: n.path, kind: n.kind, ext, hidden: !!n.hidden, size: n.size, modified: n.modified };
  if (n.kind === "file") {
    const ic = ICON_BY_EXT[ext];
    e.iconUrl = ic ? svgIcon(ic[0], ic[1]) : svgIcon("#778", "");
    e.iconKind = "launch";
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) e.thumbnailUrl = svgThumb(n.c1 || "#4aa3df", n.c2 || "#2d6a4f");
  }
  return e;
}

/**
 * 1つのウィンドウ分の explorerPlus。folderPath を開いた状態で始まる。
 * opts: log（呼び出しの記録）・storage（初めの保存）・settings・menuChoice(extra, items)・choose(items)・confirm
 */
export function createFakeEp(fs, folderPath, opts = {}) {
  const store = new Map(opts.storage || []);
  const log = opts.log || [];
  const settings = { slotSize: 44, iconStyle: "windows", sound: false, lights: true, ...(opts.settings || {}) };
  let cwd = folderPath;
  let theme = opts.theme || "light";
  const folderCbs = new Set(), settingCbs = new Set(), themeCbs = new Set(), cmdCbs = new Set(), actionCbs = new Set();
  const verify = (ref) => {
    if (!ref || typeof ref.path !== "string") throw err("invalid", "bad ref");
    const n = fs.get(ref.path);
    if (!n) throw err("not-found", ref.path);
    if (n.id !== ref.id) throw err("denied", `id does not match ${ref.path}`);
    return n;
  };
  const snapshot = () => {
    const n = fs.get(cwd);
    return { id: n.id, path: n.path, name: n.name, parentPath: fs.parentOf(n.path), entries: fs.list(cwd).map(entryOf) };
  };
  const emit = () => { const s = snapshot(); for (const cb of folderCbs) cb(s); };
  fs.onChange((parent) => { if (parent && parent.toLowerCase() === cwd.toLowerCase()) setTimeout(emit, 0); });
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const call = (name, ...a) => log.push(`${name}${a.length ? " " + a.join(" ") : ""}`);

  const ep = {
    apiVersion: 1,
    get theme() { return theme; },
    ready: async () => ({ apiVersion: 1, viewId: "neo.chest-filer", tabId: "t1", theme, background: false }),
    settings: { get: async () => ({ ...settings }) },
    onSettings: (cb) => { settingCbs.add(cb); return () => settingCbs.delete(cb); },
    onTheme: (cb) => { themeCbs.add(cb); return () => themeCbs.delete(cb); },
    storage: {
      get: async (k) => clone(store.get(k)),
      set: async (k, v) => {
        const s = JSON.stringify(v);
        if (s.length > (opts.storageLimit || 1024 * 1024)) throw err("too-large", k);
        if (opts.failWrite && opts.failWrite(k)) throw err("io", k);
        store.set(k, JSON.parse(s));
      },
      delete: async (k) => void store.delete(k),
      keys: async () => [...store.keys()],
    },
    onFolder: (cb) => { folderCbs.add(cb); setTimeout(() => cb(snapshot()), 0); return () => folderCbs.delete(cb); },
    rename: async (ref, newName) => {
      const n = verify(ref);
      if (/[\\/:*?"<>|]/.test(newName)) throw err("invalid", newName);
      call("rename", n.name, newName);
      const r = fs.rename(n.path, newName);
      return entryOf(r);
    },
    onAction: (cb) => { actionCbs.add(cb); return () => actionCbs.delete(cb); },
    navigate: async (p) => {
      const n = fs.get(p);
      if (!n || n.kind !== "folder") throw err("not-found", p);
      call("navigate", p);
      cwd = n.path;
      setTimeout(emit, 0);
    },
    navigateUp: async () => { const p = fs.parentOf(cwd); if (!p) throw err("not-found", "no parent"); call("navigateUp"); cwd = fs.get(p).path; setTimeout(emit, 0); },
    open: async (ref) => { const n = verify(ref); call("open", n.name); },
    resolve: async (refs) => {
      call("resolve", refs.length);
      return refs.map((r) => {
        const n = (r.id && fs.byId(r.id)) || null;
        return n ? entryOf(n) : null;
      });
    },
    search: {
      find: async (folder, q = {}, o = {}) => {
        const root = verify(folder);
        call("search.find", q.name || "");
        const out = [];
        const walk = (dir) => { for (const n of fs.list(dir)) { out.push(n); if (n.kind === "folder") walk(n.path); } };
        walk(root.path);
        const needle = (q.name || "").toLowerCase();
        const hit = out.filter((n) => !needle || n.name.toLowerCase().includes(needle)).filter((n) => !(q.hidden === false && n.hidden));
        const limit = o.limit || 1000;
        return { entries: hit.slice(0, limit).map(entryOf), truncated: hit.length > limit };
      },
    },
    showMenu: async (m) => {
      call("showMenu", (m.items || []).length, (m.extra || []).map((x) => x.id).join(","));
      if (opts.menuDeny && (m.items || []).length) throw err("denied", "menu");
      return { chosen: opts.menuChoice ? opts.menuChoice(m.extra || [], m.items || []) : null };
    },
    commands: { set: async (l) => void (ep.__commands = l) },
    onCommand: (cb) => { cmdCbs.add(cb); return () => cmdCbs.delete(cb); },
    ui: {
      toast: async (t) => void call("toast", t),
      status: async () => {},
      tab: async () => {},
      confirm: async (m) => (call("confirm", m.split("\n")[0]), opts.confirm !== false),
      ask: async (o) => (call("ask", o.label), opts.ask ?? o.value ?? null),
      choose: async (items, o = {}) => { call("choose", o.title || "", items.map((i) => i.id).join(",")); return opts.choose ? opts.choose(items, o) : null; },
    },
    // 試験から
    __emit: emit,
    __store: store,
    __settings: (next) => { Object.assign(settings, next); for (const cb of settingCbs) cb({ ...settings }); },
    __theme: (t) => { theme = t; for (const cb of themeCbs) cb(t); },
    __command: (id) => { for (const cb of cmdCbs) cb(id); },
    /** 本体のメニューで「名前の変更」が選ばれた */
    __action: (a) => { for (const cb of actionCbs) cb(a); },
    __cwd: () => cwd,
    __opts: opts,
  };
  return ep;
}
