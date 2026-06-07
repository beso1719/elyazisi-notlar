import { isConfigured } from './supabaseClient.js?v=14';
import * as auth from './auth.js?v=14';
import * as notesApi from './notes.js?v=14';
import { NoteEditor } from './drawing.js?v=14';

// pdf.js sadece gerektiğinde yüklensin (CDN sorunu çekirdek uygulamayı kırmasın)
const loadPdf = async (buf) => (await import('./pdf.js?v=14')).loadPdf(buf);

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
  pages: $('pages'), tools: $('tools'), toolModes: $('tool-modes'), pens: $('pens'), penAdd: $('pen-add'),
  penEditor: $('pen-editor'), penColor: $('pen-color'), penSize: $('pen-size'), penSizeVal: $('pen-size-val'),
  penSmooth: $('pen-smooth'), penDelete: $('pen-delete'),
  undoBtn: $('undo-btn'), redoBtn: $('redo-btn'), clearBtn: $('clear-btn'),
  fingerToggle: $('finger-toggle'), addpageGroup: $('addpage-group'),
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
applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
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

// ---------- Editör + sol kalem çubuğu ----------
function ensureEditor() {
  if (editor) return;
  editor = new NoteEditor(els.pages);
  editor.onChange = scheduleSave;
  buildPens();
  els.toolModes.querySelectorAll('[data-tool]').forEach((b) =>
    b.addEventListener('click', () => selectTool(b.dataset.tool)));
  els.undoBtn.addEventListener('click', () => editor.undo());
  els.redoBtn.addEventListener('click', () => editor.redo());
  els.clearBtn.addEventListener('click', () => { if (confirm('Tüm çizimi sil?')) editor.clear(); });
  els.fingerToggle.addEventListener('click', () => {
    const on = !els.fingerToggle.classList.contains('active');
    els.fingerToggle.classList.toggle('active', on);
    editor.setAllowFinger(on);
  });
  els.addpageGroup.querySelectorAll('[data-add]').forEach((b) =>
    b.addEventListener('click', () => editor.addBlankPage(b.dataset.add)));
  selectTool('pen');
}

// ---------- Kalemler & fosforlu kalemler (iki ayrı hazır set, localStorage) ----------
const PEN_KEY = 'eyn-pens';
const HI_KEY = 'eyn-hipens';
const DEFAULT_PENS = [
  { color: '#181818', size: 3 }, { color: '#da291c', size: 3 },
  { color: '#1f6feb', size: 3 }, { color: '#2f9e44', size: 4 },
  { color: '#f08c00', size: 6 }, { color: '#ae3ec9', size: 3 },
  { color: '#000000', size: 10 },
];
// Fosforlu neon renk paleti
const DEFAULT_HI = [
  { color: '#fff200', size: 16 }, { color: '#b2ff00', size: 16 },
  { color: '#00e5ff', size: 16 }, { color: '#ff6fff', size: 16 },
  { color: '#ff8a00', size: 16 },
];
let pens = loadSet(PEN_KEY, DEFAULT_PENS);
let hipens = loadSet(HI_KEY, DEFAULT_HI);
// Pürüzsüz yazan hazır bir kalem yoksa ekle (mevcut kullanıcılar da görsün).
if (!pens.some((p) => p.smooth)) { pens.push({ color: '#1f6feb', size: 5, smooth: true }); saveSet(PEN_KEY, pens); }
let curPen = 0, curHi = 0;
let curTool = 'pen';

function loadSet(key, def) {
  try { const v = JSON.parse(localStorage.getItem(key)); if (Array.isArray(v) && v.length) return v; } catch {}
  return def.map((p) => ({ ...p }));
}
function saveSet(key, arr) { localStorage.setItem(key, JSON.stringify(arr)); }
// Seçili araca göre aktif kalem setini döndür.
function activeSet() {
  return curTool === 'hi'
    ? { arr: hipens, idx: curHi, key: HI_KEY, set: (i) => (curHi = i) }
    : { arr: pens, idx: curPen, key: PEN_KEY, set: (i) => (curPen = i) };
}

function buildPens() {
  els.pens.innerHTML = '';
  const hi = curTool === 'hi';
  const arr = hi ? hipens : pens;
  const cur = hi ? curHi : curPen;
  const showSel = curTool === 'pen' || curTool === 'hi';
  arr.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = 'pen' + (hi ? ' pen--hi' : '') + (!hi && p.smooth ? ' pen--smooth' : '') + (showSel && i === cur ? ' active' : '');
    b.style.setProperty('--c', p.color);
    b.innerHTML = '<i class="body"></i><i class="tip"></i>';
    b.addEventListener('click', () => selectPen(i, b));
    els.pens.appendChild(b);
  });
}
function markTool() {
  els.toolModes.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === curTool));
}
function applyActive() {
  const { arr, idx } = activeSet();
  const p = arr[idx]; if (!p) return;
  editor.setTool(curTool === 'hi' ? 'hi' : 'pen');
  editor.setColor(p.color); editor.setSize(p.size);
  editor.setSmooth(curTool === 'pen' && !!p.smooth);
}
function selectTool(t) {
  curTool = t;
  if (t === 'eraser') editor.setTool('eraser');
  else applyActive();
  markTool(); buildPens(); closePenEditor();
}
function selectPen(i, btn) {
  // Eraser modunda kaleme basınca o sete geç.
  if (curTool === 'eraser') curTool = 'pen';
  const a = activeSet();
  if (a.idx === i) { openPenEditor(i, btn); return; } // aktif kaleme tekrar bas → düzenle
  a.set(i);
  applyActive(); markTool(); buildPens(); closePenEditor();
}

// Kalem düzenleme açılır kutusu
function openPenEditor(i, btn) {
  const a = activeSet(); a.set(i);
  const p = a.arr[i];
  els.penColor.value = p.color;
  els.penSize.value = p.size; els.penSizeVal.textContent = p.size;
  // Pürüzsüz toggle yalnızca normal kalemlerde anlamlı.
  els.penSmooth.style.display = curTool === 'pen' ? '' : 'none';
  els.penSmooth.classList.toggle('active', !!p.smooth);
  els.penEditor.classList.remove('hidden');
  const nv = els.noteView.getBoundingClientRect();
  const tr = els.tools.getBoundingClientRect();
  const r = (btn || els.tools).getBoundingClientRect();
  els.penEditor.style.left = (tr.right - nv.left + 8) + 'px';
  els.penEditor.style.top = Math.max(8, r.top - nv.top) + 'px';
}
function closePenEditor() { els.penEditor.classList.add('hidden'); }
els.penColor.addEventListener('input', () => {
  const a = activeSet(); a.arr[a.idx].color = els.penColor.value;
  saveSet(a.key, a.arr); buildPens(); applyActive();
});
els.penSize.addEventListener('input', () => {
  const a = activeSet(); a.arr[a.idx].size = +els.penSize.value;
  els.penSizeVal.textContent = els.penSize.value; saveSet(a.key, a.arr); buildPens(); applyActive();
});
els.penSmooth.addEventListener('click', () => {
  const a = activeSet();
  const p = a.arr[a.idx]; p.smooth = !p.smooth;
  els.penSmooth.classList.toggle('active', p.smooth);
  saveSet(a.key, a.arr); buildPens(); applyActive();
});
els.penDelete.addEventListener('click', () => {
  const a = activeSet();
  if (a.arr.length <= 1) return;
  a.arr.splice(a.idx, 1); a.set(Math.max(0, a.idx - 1));
  saveSet(a.key, a.arr); applyActive(); buildPens(); closePenEditor();
});
els.penAdd.addEventListener('click', () => {
  const a = activeSet();
  a.arr.push(curTool === 'hi' ? { color: '#fff200', size: 16 } : { color: '#1f6feb', size: 4 });
  a.set(a.arr.length - 1);
  saveSet(a.key, a.arr); applyActive(); markTool(); buildPens();
  openPenEditor(a.arr.length - 1, els.pens.lastElementChild);
});
// Boş alana basınca düzenleyiciyi kapat
document.addEventListener('pointerdown', (e) => {
  if (!els.penEditor.classList.contains('hidden') &&
      !els.penEditor.contains(e.target) && !els.pens.contains(e.target) && e.target !== els.penAdd) {
    closePenEditor();
  }
});

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

// ---------- Klavye kısayolları ----------
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isFsActive()) { setFs(false); return; }
  if (!editor || els.noteView.classList.contains('hidden')) return;
  const typing = ['INPUT', 'TEXTAREA'].includes(e.target.tagName);
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault(); e.shiftKey ? editor.redo() : editor.undo();
  } else if (mod && e.key.toLowerCase() === 'y') {
    e.preventDefault(); editor.redo();
  } else if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault(); flushSave();
  } else if (!mod && !typing) {
    const k = e.key.toLowerCase();
    if (k === 'p') selectTool('pen');
    else if (k === 'h') selectTool('hi');
    else if (k === 'e') selectTool('eraser');
    else if (k === 'f') els.fingerToggle.click();
  }
});

// ---------- Yakınlaştırma (PDF + tüm sayfalar) ----------
// CSS `zoom` kullanıyoruz: transform'un aksine yerleşimi etkiler, böylece
// büyütünce kaydırma alanı genişler ve içerikte gezinilebilir.
const ZMIN = 0.5, ZMAX = 6, ZSTEP = 0.25;
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
