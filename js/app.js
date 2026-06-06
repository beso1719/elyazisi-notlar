import { isConfigured } from './supabaseClient.js?v=6';
import * as auth from './auth.js?v=6';
import * as notesApi from './notes.js?v=6';
import { NoteEditor } from './drawing.js?v=6';

// pdf.js sadece gerektiğinde yüklensin (CDN sorunu çekirdek uygulamayı kırmasın)
const loadPdf = async (buf) => (await import('./pdf.js?v=6')).loadPdf(buf);

const $ = (id) => document.getElementById(id);

if (!isConfigured) {
  $('config-warning').classList.remove('hidden');
  throw new Error('Supabase yapılandırılmamış. js/supabaseClient.js dosyasını doldur.');
}

const els = {
  authScreen: $('auth-screen'), app: $('app'), authForm: $('auth-form'),
  email: $('email'), password: $('password'), authMsg: $('auth-msg'),
  noteList: $('note-list'), newNote: $('new-note'), search: $('search'),
  emptyState: $('empty-state'), noteView: $('note-view'),
  title: $('note-title'), content: $('note-content'), saveStatus: $('save-status'),
  deleteNote: $('delete-note'), logout: $('logout-btn'), themeToggle: $('theme-toggle'),
  menuToggle: $('menu-toggle'), sidebar: $('sidebar'),
  pages: $('pages'), palette: $('palette'), grip: $('palette-grip'),
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

const PALETTE = ['#1d1d1f', '#e0463a', '#2f9e44', '#3b6df5', '#f08c00', '#ae3ec9', '#ffd43b'];
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

const SIZES = [2, 4, 8, 14];
function buildSizes() {
  els.sizes.innerHTML = '';
  SIZES.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'size-dot' + (i === 1 ? ' active' : '');
    const dot = document.createElement('i');
    const px = Math.min(20, 4 + s);
    dot.style.width = px + 'px'; dot.style.height = px + 'px';
    b.appendChild(dot);
    b.addEventListener('click', () => {
      editor.setSize(s);
      els.sizes.querySelectorAll('.size-dot').forEach((d) => d.classList.remove('active'));
      b.classList.add('active');
    });
    els.sizes.appendChild(b);
  });
  editor.setSize(SIZES[1]);
}

function setActiveTool(tool) {
  els.palette.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
}

// Paleti sürükle
function makeDraggable() {
  let drag = null;
  const start = (e) => {
    const r = els.palette.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    els.palette.style.transform = 'none';
    els.grip.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    if (!drag) return;
    const er = els.editor?.getBoundingClientRect?.() || { left: 0, top: 0 };
    els.palette.style.left = (e.clientX - drag.dx - er.left) + 'px';
    els.palette.style.top = (e.clientY - drag.dy - er.top) + 'px';
    els.palette.style.bottom = 'auto';
  };
  const end = () => { drag = null; };
  els.grip.addEventListener('pointerdown', start);
  els.grip.addEventListener('pointermove', move);
  els.grip.addEventListener('pointerup', end);
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
