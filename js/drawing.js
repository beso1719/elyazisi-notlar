// Çok sayfalı not editörü. Her not = N sayfa (boş/çizgili/kareli/noktalı veya PDF sayfası).
// Koordinatlar sayfa-bağımsız "unit" cinsinden saklanır: sayfa genişliği = 1000 unit.
// Stroke: { page, tool:'pen'|'hi'|'eraser', color, size, points:[{x,y,p}] }  (x,y unit cinsinden)

const PAGE_W = 1000;                 // mantıksal genişlik (unit)
const A4 = 1.4142;                   // boş sayfa en-boy oranı (yükseklik/genişlik)

export class NoteEditor {
  constructor(host) {
    this.host = host;                // kaydırılabilir kapsayıcı
    this.strokes = [];
    this.redoStack = [];
    this.pages = [];                 // { wrapper, draw, ctx, bg, hUnits, cssW, dpr, pdfPage, dirty }
    this.tool = 'pen';
    this.color = '#1d1d1f';
    this.size = 4;
    this.allowFinger = false;
    this.current = null;
    this.activePage = null;
    this.onChange = null;
    this.pdfDoc = null;
    this._resizeTimer = null;

    this._ro = new ResizeObserver(() => {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => this._relayout(), 120);
    });
    this._ro.observe(host);
    this._rafPending = false;
  }

  setTool(t) { this.tool = t; }
  setColor(c) { this.color = c; if (this.tool === 'eraser') this.tool = 'pen'; }
  setSize(s) { this.size = s; }
  setAllowFinger(v) { this.allowFinger = v; }

  // note: {page_style, page_count, drawing}; pdfDoc: pdf.js belgesi (page_style==='pdf' ise)
  async loadNote(note, pdfDoc = null) {
    this.host.innerHTML = '';
    this.pages = [];
    this.pdfDoc = pdfDoc;
    this.current = null;
    this.strokes = (Array.isArray(note.drawing) ? note.drawing : []).filter(
      (s) => s && Array.isArray(s.points)
    );
    this.redoStack = [];

    if (note.page_style === 'pdf' && pdfDoc) {
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const pg = await pdfDoc.getPage(i);
        const vp = pg.getViewport({ scale: 1 });
        this._addPage('pdf', (vp.height / vp.width) * PAGE_W, pg);
      }
    } else {
      const count = Math.max(1, note.page_count || 1);
      for (let i = 0; i < count; i++) this._addPage(note.page_style || 'blank', PAGE_W * A4, null);
    }
    this._relayout();
  }

  addBlankPage(style) {
    this._addPage(style, PAGE_W * A4, null);
    this._relayout();
    this._emit();
  }

  get pageCount() { return this.pages.length; }

  _addPage(style, hUnits, pdfPage) {
    const idx = this.pages.length;
    const wrapper = document.createElement('div');
    wrapper.className = 'page page--' + style;
    wrapper.style.aspectRatio = `${PAGE_W} / ${hUnits}`;

    let bg = null;
    if (pdfPage) {
      bg = document.createElement('canvas');
      bg.className = 'page-bg';
      wrapper.appendChild(bg);
    }
    const draw = document.createElement('canvas');
    draw.className = 'page-draw';
    wrapper.appendChild(draw);

    const num = document.createElement('span');
    num.className = 'page-num';
    num.textContent = idx + 1;
    wrapper.appendChild(num);

    this.host.appendChild(wrapper);
    const page = { wrapper, draw, ctx: draw.getContext('2d'), bg, hUnits, cssW: 0, dpr: 1, pdfPage, dirty: true };
    this.pages.push(page);
    this._bind(page, idx);
  }

  _bind(page, idx) {
    const c = page.draw;
    c.addEventListener('pointerdown', (e) => this._down(e, page, idx));
    c.addEventListener('pointermove', (e) => this._move(e, page));
    c.addEventListener('pointerup', (e) => this._up(e, page));
    c.addEventListener('pointercancel', (e) => this._up(e, page));
    c.addEventListener('pointerleave', (e) => this._up(e, page));
  }

  _isDraw(e) {
    if (e.pointerType === 'pen') return true;
    if (e.pointerType === 'touch') return this.allowFinger;
    return e.buttons === 1 || e.type === 'pointerdown';
  }

  _toUnits(e, page) {
    const r = page.draw.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * PAGE_W, y: ((e.clientY - r.top) / r.width) * PAGE_W };
  }

  _pressure(e) { return e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5; }

  _down(e, page, idx) {
    if (!this._isDraw(e)) return;
    e.preventDefault();
    page.draw.setPointerCapture(e.pointerId);
    this.redoStack = [];
    const p = this._toUnits(e, page);
    this.current = { page: idx, tool: this.tool, color: this.color, size: this.size, points: [{ ...p, p: this._pressure(e) }] };
    this.activePage = page;
    this.strokes.push(this.current);
    page.dirty = true;
    this._markDirty();
  }

  _move(e, page) {
    if (!this.current || page !== this.activePage) return;
    e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    const r = page.draw.getBoundingClientRect();
    for (const ev of evs) {
      this.current.points.push({
        x: ((ev.clientX - r.left) / r.width) * PAGE_W,
        y: ((ev.clientY - r.top) / r.width) * PAGE_W,
        p: this._pressure(ev),
      });
    }
    page.dirty = true;
    this._markDirty();
  }

  _up(e, page) {
    if (!this.current) return;
    e.preventDefault?.();
    try { page.draw.releasePointerCapture(e.pointerId); } catch {}
    this.current = null;
    this.activePage = null;
    this._emit();
  }

  undo() { if (this.strokes.length) { this.redoStack.push(this.strokes.pop()); this._dirtyAll(); this._emit(); } }
  redo() { if (this.redoStack.length) { this.strokes.push(this.redoStack.pop()); this._dirtyAll(); this._emit(); } }
  clear() { if (this.strokes.length) { this.strokes = []; this.redoStack = []; this._dirtyAll(); this._emit(); } }

  toJSON() { return this.strokes; }

  _dirtyAll() { for (const p of this.pages) p.dirty = true; this._markDirty(); }

  async _relayout() {
    for (const page of this.pages) {
      const rect = page.draw.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (page.draw.width !== w || page.draw.height !== h) {
        page.draw.width = w; page.draw.height = h;
        page.cssW = rect.width; page.dpr = dpr; page.dirty = true;
        if (page.bg && page.pdfPage) await this._renderPdf(page);
      }
    }
    this._markDirty();
  }

  async _renderPdf(page) {
    const vp1 = page.pdfPage.getViewport({ scale: 1 });
    const scale = (page.cssW * page.dpr) / vp1.width;
    const vp = page.pdfPage.getViewport({ scale });
    page.bg.width = Math.round(vp.width);
    page.bg.height = Math.round(vp.height);
    await page.pdfPage.render({ canvasContext: page.bg.getContext('2d'), viewport: vp }).promise;
  }

  // Talebe-bağlı render: yalnızca kirli sayfa varken bir kare planla (sürekli rAF yok).
  _markDirty() {
    if (this._rafPending) return;
    this._rafPending = true;
    this._raf = requestAnimationFrame(() => {
      this._rafPending = false;
      let again = false;
      for (let i = 0; i < this.pages.length; i++) {
        const page = this.pages[i];
        if (page.dirty) { page.dirty = false; this._renderPage(page, i); }
        if (page.dirty) again = true;
      }
      if (again) this._markDirty();
    });
  }

  _renderPage(page, idx) {
    const ctx = page.ctx;
    const scale = page.cssW / PAGE_W * page.dpr; // unit -> device px
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, page.draw.width, page.draw.height);
    ctx.scale(scale, scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of this.strokes) if (s.page === idx) this._drawStroke(ctx, s);
  }

  _drawStroke(ctx, s) {
    const pts = s.points;
    if (!pts.length) return;
    ctx.save();
    if (s.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.fillStyle = 'rgba(0,0,0,1)';
    } else if (s.tool === 'hi') {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.4;
      ctx.lineCap = 'butt';
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
    }
    const sizeFor = (p) => (s.tool === 'hi' ? s.size * 2.4 : s.size * (0.4 + p));

    if (pts.length === 1) {
      const p = pts[0];
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, sizeFor(p.p) / 2), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      ctx.lineWidth = Math.max(0.5, sizeFor((a.p + b.p) / 2));
      ctx.beginPath();
      if (i === 1) ctx.moveTo(a.x, a.y);
      else { const pa = pts[i - 2]; ctx.moveTo((pa.x + a.x) / 2, (pa.y + a.y) / 2); }
      ctx.quadraticCurveTo(a.x, a.y, mid.x, mid.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  destroy() { this._ro.disconnect(); cancelAnimationFrame(this._raf); }
  _emit() { if (this.onChange) this.onChange(); }
}
