// スロットのグリッド。見えている行だけを DOM にする（数千あっても軽い）。
// 1つのスロットは position: absolute。セルの中身は render(el, i) が決める。

export class VirtualGrid {
  /**
   * @param {HTMLElement} el スクロールする枠
   * @param {{ cols: number, render: (el: HTMLElement, i: number) => void, className?: string }} opt
   */
  constructor(el, opt) {
    this.el = el;
    this.cols = opt.cols;
    this.render = opt.render;
    this.cls = opt.className || "slot";
    this.cw = 44;
    this.ch = 44;
    this.count = 0;
    this.cells = new Map();   // 番号 → 要素
    this.inner = document.createElement("div");
    this.inner.className = "grid-inner";
    el.append(this.inner);
    this._raf = 0;
    el.addEventListener("scroll", () => this._schedule(), { passive: true });
    if (typeof ResizeObserver === "function") new ResizeObserver(() => this._schedule()).observe(el);
  }

  get rows() { return Math.ceil(this.count / this.cols); }

  setSize(cw, ch) {
    if (cw === this.cw && ch === this.ch) return;
    this.cw = cw; this.ch = ch;
    this.refresh(true);
  }

  setCount(n) {
    this.count = n;
    this.refresh();
  }

  /** 全部、描きなおす。hard なら、セルも作りなおす */
  refresh(hard = false) {
    this.inner.style.height = `${this.rows * this.ch}px`;
    this.inner.style.width = `${this.cols * this.cw}px`;
    if (hard) { for (const c of this.cells.values()) c.remove(); this.cells.clear(); }
    this._draw(true);
  }

  _schedule() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this._draw(false); });
  }

  _draw(all) {
    const top = this.el.scrollTop;
    const view = this.el.clientHeight || this.ch * 4;
    const r0 = Math.max(0, Math.floor(top / this.ch) - 1);
    const r1 = Math.min(this.rows - 1, Math.ceil((top + view) / this.ch));
    const first = r0 * this.cols;
    const last = Math.min(this.count - 1, (r1 + 1) * this.cols - 1);
    for (const [i, c] of this.cells) if (i < first || i > last) { c.remove(); this.cells.delete(i); }
    for (let i = first; i <= last; i++) {
      let c = this.cells.get(i);
      const fresh = !c;
      if (fresh) {
        c = document.createElement("div");
        c.className = this.cls;
        c.dataset.i = String(i);
        c.style.left = `${(i % this.cols) * this.cw}px`;
        c.style.top = `${Math.floor(i / this.cols) * this.ch}px`;
        c.style.width = `${this.cw}px`;
        c.style.height = `${this.ch}px`;
        this.inner.append(c);
        this.cells.set(i, c);
      }
      if (fresh || all) this.render(c, i);
    }
  }

  cell(i) { return this.cells.get(i) || null; }

  /** 番号の升が見える位置までスクロールする */
  reveal(i) {
    const top = Math.floor(i / this.cols) * this.ch;
    if (top < this.el.scrollTop) this.el.scrollTop = top;
    else if (top + this.ch > this.el.scrollTop + this.el.clientHeight) this.el.scrollTop = top + this.ch - this.el.clientHeight;
    this._draw(false);
  }

  /** 画面の点が指す升の番号。無ければ -1 */
  indexAt(x, y) {
    const r = this.el.getBoundingClientRect();
    if (x < r.left || x > r.left + this.cols * this.cw || y < r.top || y > r.bottom) return -1;
    const col = Math.floor((x - r.left) / this.cw);
    const row = Math.floor((y - r.top + this.el.scrollTop) / this.ch);
    const i = row * this.cols + col;
    return col >= 0 && col < this.cols && i >= 0 && i < this.count ? i : -1;
  }
}
