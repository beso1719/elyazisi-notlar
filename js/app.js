import { isConfigured } from './supabaseClient.js?v=11';
import * as auth from './auth.js?v=11';
import * as notesApi from './notes.js?v=11';
import { NoteEditor } from './drawing.js?v=11';

// pdf.js sadece gerektiğinde yüklensin (CDN sorunu çekirdek uygulamayı kırmasın)
const loadPdf = async (buf) => (await import('./pdf.js?v=11')).loadPdf(buf);

const $ = (id) => document.getElementById(id);

if (!isConfigured) {
  $('config-warning').classList.remove('hidden');
  throw new Error('Supabase yapılandırılmamış. js/supabaseClient.js dosyasını doldur.');
}

const els = {
  authScreen: $('auth-screen'), app: $('app'), authForm: $('auth-form'),
  email: $('email'), password: $('password'), authMsg: $('auth-msg'), googleBtn: $('google-btn'),
  noteList: $('note-list'), newNote: $('new-note'), search: $('search'),
  emptyState: $('empty-state'), noteView: $('note-view'),
  title: $('note-title'), content: $('note-content'), saveStatus: $('save-status'),
  deleteNote: $('delete-note'), logout: $('logout-btn'), themeToggle: $('theme-toggle'),
  menuToggle: $('menu-toggle'), sidebar: $('sidebar'), fullscreenBtn: $('fullscreen-btn'),
  pagesScroll: $('pages-scroll'), zoomIn: $('zoom-in'), zoomOut: $('zoom-out'), zoomLevel: $('zoom-level'),
  pages: $('pages'), palette: $('palette'), grip: $('palette-grip'), paletteToggle: $('palette-toggle'),
  colors: $('colors'), sizes: $('sizes'),
  undoBtn: $('undo-btn'), redoBtn: $('redo-btn'), clearBtn: $('clear-btn'),
  fingerDraw: $('finger-draw'), addpageGroup: $('addpage-group'),
  modal: $('newnote-modal'), modalCancel: $('newnote-cancel'), pdfInput: $('pdf-input'),
  busy: $('busy'), busyText: $('busy-text'),
};

const state = { user: null, notes: [], currentId: null, filter: '' };
let editor = null;
let saveTimer = null;

function busy(on, text = 'Yükleniyor…') { els.busyText.textContent = text; els.busy.classList.toggle('hidden', !on); }

// ---------- Tema ----------
const THEME_KEY = 'eyn-theme';
function applyTheme(t) { document.documentElement.setAttribute('data-theme', t); localStorage.setItem(THEME_KEY, t); }
applyTheme(localStorage.getItem(THEME_KEY) || 'auto');
els.themeToggle.addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  applyTheme(cur === 'dark' ? 'light' : cur === 'light' ? 'auto' : 'dark');
});

// ---------- Auth ----------
els.authForm.addEventListener('submit', (e) => { e.preventDefault(); doAuth('signin'); });
els.authForm.querySelector('[data-action="signup"]').addEventListener('click', () => doAuth('signup'));
els.authForm.querySelector('[data-action="magic"]').addEventListener('click', () => doAuth('magic'));
els.googleBtn.addEventListener('click', async () => {
  setAuthMsg('', false);
  try { const { error } = await auth.signInWithGoogle(); if (error) throw error; }
  catch (err) { setAuthMsg(err.message || 'Google girişi başarısız.', true); }
});

async function doAuth(action) {
  const email = els.email.value.trim();
  const password = els.password.value;
  setAuthMsg('', false);
  if (!email) return setAuthMsg('E-posta gir.', true);
  try {
    if (action === 'magic') {
      const { error } = await auth.signInWithMagicLink(email);
      if (error) throw error;
      return setAuthMsg('Giriş linki e-postana gönderildi.', false);
    }
    if (!password || password.length < 6) return setAuthMsg('Şifre en az 6 karakter olmalı.', true);
    const fn = action === 'signup' ? auth.signUp : auth.signIn;
    const { error } = await fn(email, password);
    if (error) throw error;
    if (action === 'signup') setAuthMsg('Kayıt başarılı. E-posta doğrulaması gerekebilir.', false);
  } catch (err) { setAuthMsg(err.message || 'Hata oluştu.', true); }
}
function setAuthMsg(msg, isError) { els.authMsg.textContent = msg; els.authMsg.classList.toggle('error', !!isError); }
els.logout.addEventListener('click', async () => { await auth.signOut(); });

// ÖNEMLİ: onAuthStateChange callback'i içinde doğrudan supabase sorgusu (await) çağırmak
// supabase-js'in auth kilidini deadlock'a sokar. Bu yüzden loadNotes'u setTimeout ile
// callback döndükten sonra çalıştırıyoruz.
auth.onAuthChange((user) => {
  state.user = user;
  if (user) {
    els.authScreen.classList.add('hidden');
    els.app.classList.remove('hidden');
    setTimeout(() => loadNotes(), 0);
  } else {
    els.app.classList.add('hidden');
    els.authScreen.classList.remove('hidden');
    state.notes = []; state.currentId = null;
  }
});
(async () => { if (!(await auth.getSession())) els.authScreen.classList.remove('hidden'); })();

// ---------- Not listesi ----------
async function loadNotes() {
  try { state.notes = await notesApi.listNotes(); renderList(); } catch (err) { console.error(err); }
}
function renderList() {
  const f = state.filter.toLowerCase();
  const items = state.notes.filter((n) =>
    !f || (n.title || '').toLowerCase().includes(f) || (n.content || '').toLowerCase().includes(f));
  els.noteList.innerHTML = '';
  for (const n of items) {
    const li = document.createElement('li');
    li.className = 'note-item' + (n.id === state.currentId ? ' active' : '');
    li.innerHTML = `<span class="t"></span><span class="d"></span>`;
    li.querySelector('.t').textContent = n.title || 'Başlıksız';
    if (n.page_style === 'pdf') {
      const b = document.createElement('span'); b.className = 'badge'; b.textContent = 'PDF';
      li.querySelector('.t').appendChild(b);
    }
    li.querySelector('.d').textContent = formatDate(n.updated_at);
    li.addEventListener('click', () => openNote(n.id));
    els.noteList.appendChild(li);
  }
}
function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
els.search.addEventListener('input', () => { state.filter = els.search.value; renderList(); });

// ---------- Yeni not (modal) ----------
els.newNote.addEventListener('click', () => els.modal.classList.remove('hidden'));
els.modalCancel.addEventListener('click', () => els.modal.classList.add('hidden'));
els.modal.addEventListener('click', (e) => { if (e.target === els.modal) els.modal.classList.add('hidden'); });

els.modal.querySelectorAll('.pagetype').forEach((b) =>
  b.addEventListener('click', () => {
    const style = b.dataset.style;
    els.modal.classList.add('hidden');
    if (style === 'pdf') els.pdfInput.click();
    else createStyleNote(style);
  }));

async function createStyleNote(style) {
  try {
    const note = await notesApi.createNote(state.user.id, { page_style: style, page_count: 1 });
    state.notes.unshift(note); renderList(); await openNote(note.id);
  } catch (err) { console.error(err); alert('Not oluşturulamadı: ' + (err.message || err)); }
}

els.pdfInput.addEventListener('change', async () => {
  const file = els.pdfInput.files[0];
  els.pdfInput.value = '';
  if (!file) return;
  busy(true, 'PDF yükleniyor…');
  try {
    const note = await notesApi.createNote(state.user.id, {
      page_style: 'pdf', title: file.name.replace(/\.pdf$/i, ''),
    });
    const path = await notesApi.uploadPdf(state.user.id, note.id, file);
    const buf = await file.arrayBuffer();
    const doc = await loadPdf(buf);
    note.pdf_path = path; note.page_count = doc.numPages;
    await notesApi.updateNote(note.id, { pdf_path: path, page_count: doc.numPages });
    state.notes.unshift(note); renderList();
    await openNoteWithDoc(note, doc);
  } catch (err) { console.error(err); alert('PDF eklenemedi: ' + err.message); }
  finally { busy(false); }
});

// ---------- Not açma ----------
async function openNote(id) {
  flushSave();
  const note = state.notes.find((n) => n.id === id);
  if (!note) return;
  if (note.page_style === 'pdf' && note.pdf_path) {
    busy(true, 'PDF açılıyor…');
    try {
      const buf = await notesApi.downloadPdf(note.pdf_path);
      const doc = await loadPdf(buf);
      await openNoteWithDoc(note, doc);
    } catch (err) { console.error(err); alert('PDF açılamadı: ' + err.message); }
    finally { busy(false); }
  } else {
    try { await openNoteWithDoc(note, null); }
    catch (err) { console.error(err); alert('Not açılamadı: ' + (err.message || err)); }
  }
}

async function openNoteWithDoc(note, doc) {
  state.currentId = note.id;
  els.emptyState.classList.add('hidden');
  els.noteView.classList.remove('hidden');
  els.title.value = note.title || '';
  els.content.value = note.content || '';
  els.addpageGroup.style.display = note.page_style === 'pdf' ? 'none' : 'flex';
  ensureEditor();
  resetZoom();
  await editor.loadNote(note, doc);
  setSaveStatus('');
  renderList();
  closeSidebar();
}

// ---------- Editör + palet ----------
function ensureEditor() {
  if (editor) return;
  editor = new NoteEditor(els.pages);
  editor.onChange = scheduleSave;
  buildColors();
  buildSizes();
  setActiveTool('pen');
  els.palette.querySelectorAll('[data-tool]').forEach((b) =>
    b.addEventListener('click', () => { editor.setTool(b.dataset.tool); setActiveTool(b.dataset.tool); }));
  els.undoBtn.addEventListener('click', () => editor.undo());
  els.redoBtn.addEventListener('click', () => editor.redo());
  els.clearBtn.addEventListener('click', () => { if (confirm('Tüm çizimi sil?')) editor.clear(); });
  els.fingerDraw.addEventListener('change', () => editor.setAllowFinger(els.fingerDraw.checked));
  els.addpageGroup.querySelectorAll('[data-add]').forEach((b) =>
    b.addEventListener('click', () => editor.addBlankPage(b.dataset.add)));
  makeDraggable();
}

const PALETTE = [
  '#1d1d1f', '#5f6368', '#9aa0a6', '#ffffff',
  '#e0463a', '#ff8c00', '#ffd43b', '#f783ac',
  '#2f9e44', '#12b886', '#3b6df5', '#1864ab',
  '#ae3ec9', '#e64980', '#7a4f2a', '#000080',
];
function buildColors() {
  els.colors.innerHTML = '';
  PALETTE.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'color-swatch' + (i === 0 ? ' active' : '');
    b.style.background = c;
    b.addEventListener('click', () => {
      editor.setColor(c); setActiveTool('pen');
      els.colors.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('active'));
      b.classList.add('active');
    });
    els.colors.appendChild(b);
  });
  const picker = document.createElement('input');
  picker.type = 'color'; picker.className = 'color-swatch'; picker.value = '#000000'; picker.title = 'Serbest renk';
  picker.addEventListener('input', () => {
    editor.setColor(picker.value); setActiveTool('pen');
    els.colors.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('active'));
  });
  els.colors.appendChild(picker);
}

const SIZES = [1, 2, 4, 6, 10, 16, 24];
const DEFAULT_SIZE_IDX = 2; // 4px
function buildSizes() {
  els.sizes.innerHTML = '';
  SIZES.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'size-dot' + (i === DEFAULT_SIZE_IDX ? ' active' : '');
    const dot = document.createElement('i');
    const px = Math.min(22, 3 + s);
    dot.style.width = px + 'px'; dot.style.height = px + 'px';
    b.appendChild(dot);
    b.addEventListener('click', () => {
      editor.setSize(s);
      els.sizes.querySelectorAll('.size-dot').forEach((d) => d.classList.remove('active'));
      b.classList.add('active');
    });
    els.sizes.appendChild(b);
  });
  editor.setSize(SIZES[DEFAULT_SIZE_IDX]);
}

function setActiveTool(tool) {
  els.palette.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
  // Kapalı palet düğmesinde seçili aracın simgesi görünsün
  const btn = els.palette.querySelector(`[data-tool="${tool}"]`);
  if (btn && els.palette.classList.contains('collapsed')) els.paletteToggle.textContent = btn.textContent;
}

// Paleti aç/kapa (Apple Pencil paleti gibi)
function setPaletteOpen(open) {
  els.palette.classList.toggle('collapsed', !open);
  if (open) {
    els.paletteToggle.textContent = '▾';
  } else {
    const act = els.palette.querySelector('[data-tool].active') || els.palette.querySelector('[data-tool="pen"]');
    els.paletteToggle.textContent = act ? act.textContent : '✒️';
  }
}
// Sürükleme bir tıklamaya dönüşmesin diye (küçük paleti taşırken açılmasını engelle)
let palMoved = false;
els.paletteToggle.addEventListener('click', () => {
  if (palMoved) { palMoved = false; return; }
  setPaletteOpen(els.palette.classList.contains('collapsed'));
});

// Paleti sürükle — hem açık (grip) hem kapalı (yuvarlak düğme) durumda
function makeDraggable() {
  const attach = (handle) => {
    let drag = null;
    handle.addEventListener('pointerdown', (e) => {
      const r = els.palette.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY };
      palMoved = false;
      els.palette.style.transform = 'none';
      try { handle.setPointerCapture(e.pointerId); } catch {}
    });
    handle.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) palMoved = true;
      const er = els.editor?.getBoundingClientRect?.() || { left: 0, top: 0 };
      els.palette.style.left = (e.clientX - drag.dx - er.left) + 'px';
      els.palette.style.top = (e.clientY - drag.dy - er.top) + 'px';
      els.palette.style.bottom = 'auto';
    });
    handle.addEventListener('pointerup', () => { drag = null; });
  };
  attach(els.grip);
  attach(els.paletteToggle);
}
els.editor = $('editor');

// ---------- Başlık / metin ----------
els.title.addEventListener('input', scheduleSave);
els.content.addEventListener('input', scheduleSave);

// ---------- Kaydetme (debounce) ----------
function scheduleSave() {
  setSaveStatus('Kaydediliyor…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 800);
}
function flushSave() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; save(); } }
async function save() {
  if (!state.currentId || !editor) return;
  const id = state.currentId;
  const patch = {
    title: els.title.value || 'Başlıksız',
    content: els.content.value,
    drawing: editor.toJSON(),
    page_count: editor.pageCount,
  };
  try {
    const res = await notesApi.updateNote(id, patch);
    const note = state.notes.find((n) => n.id === id);
    if (note) {
      Object.assign(note, patch);
      note.updated_at = res?.updated_at || new Date().toISOString();
      state.notes.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    }
    renderList();
    setSaveStatus('Kaydedildi ✓');
  } catch (err) { console.error(err); setSaveStatus('Kaydedilemedi'); }
}
function setSaveStatus(s) { els.saveStatus.textContent = s; }
window.addEventListener('beforeunload', flushSave);

els.deleteNote.addEventListener('click', async () => {
  if (!state.currentId || !confirm('Bu notu sil?')) return;
  const id = state.currentId;
  const note = state.notes.find((n) => n.id === id);
  try {
    await notesApi.deleteNote(id, note?.pdf_path);
    state.notes = state.notes.filter((n) => n.id !== id);
    state.currentId = null;
    els.noteView.classList.add('hidden');
    els.emptyState.classList.remove('hidden');
    renderList();
  } catch (err) { console.error(err); }
});

// ---------- Mobil sidebar ----------
els.menuToggle.addEventListener('click', () => els.sidebar.classList.toggle('open'));
function closeSidebar() { els.sidebar.classList.remove('open'); }

// ---------- Tam ekran (odak modu) ----------
// Saf CSS "focus-mode": topbar + sidebar gizlenir, not tüm ekranı kaplar.
// Native Fullscreen API kullanmıyoruz; iPad'de avuç/parmak dokunuşuyla kapanıp
// odak modunu beklenmedik şekilde sonlandırıyordu.
function isFsActive() { return document.body.classList.contains('focus-mode'); }
function setFs(on) {
  document.body.classList.toggle('focus-mode', on);
  els.fullscreenBtn.textContent = on ? '✕' : '⛶';
  els.fullscreenBtn.title = on ? 'Tam ekrandan çık' : 'Tam ekran';
  setTimeout(() => editor && editor._relayout(), 80);
}
els.fullscreenBtn.addEventListener('click', () => setFs(!isFsActive()));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isFsActive()) setFs(false); });

// ---------- Yakınlaştırma (PDF + tüm sayfalar) ----------
// CSS `zoom` kullanıyoruz: transform'un aksine yerleşimi etkiler, böylece
// büyütünce kaydırma alanı genişler ve içerikte gezinilebilir.
const ZMIN = 0.5, ZMAX = 3, ZSTEP = 0.25;
let zoom = 1, zoomRelayout = null;
function applyZoom(z, doRelayout = true) {
  zoom = Math.min(ZMAX, Math.max(ZMIN, Math.round(z * 100) / 100));
  els.pages.style.zoom = zoom;
  els.zoomLevel.textContent = Math.round(zoom * 100) + '%';
  if (doRelayout) {
    clearTimeout(zoomRelayout);
    zoomRelayout = setTimeout(() => editor && editor._relayout(), 150);
  }
}
function resetZoom() { applyZoom(1); }
els.zoomIn.addEventListener('click', () => applyZoom(zoom + ZSTEP));
els.zoomOut.addEventListener('click', () => applyZoom(zoom - ZSTEP));
els.zoomLevel.addEventListener('click', () => resetZoom());

// iPad Safari pinch (jest olayları). user-scalable=no olduğundan sayfa zoom'u
// devre dışı; biz kendi zoom'umuzu uyguluyoruz.
let pinchStart = 1;
els.pagesScroll.addEventListener('gesturestart', (e) => { e.preventDefault(); pinchStart = zoom; }, { passive: false });
els.pagesScroll.addEventListener('gesturechange', (e) => { e.preventDefault(); applyZoom(pinchStart * e.scale, false); }, { passive: false });
els.pagesScroll.addEventListener('gestureend', (e) => { e.preventDefault(); applyZoom(zoom); }, { passive: false });
