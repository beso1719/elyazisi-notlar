import { supabase } from './supabaseClient.js?v=6';

const TABLE = 'notes';
const BUCKET = 'pdfs';

export async function listNotes() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, title, content, drawing, page_style, page_count, pdf_path, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createNote(userId, fields = {}) {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      title: fields.title || 'Yeni not',
      content: '',
      drawing: [],
      page_style: fields.page_style || 'blank',
      page_count: fields.page_count || 1,
      pdf_path: fields.pdf_path || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateNote(id, patch) {
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .select('updated_at')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteNote(id, pdfPath) {
  if (pdfPath) await supabase.storage.from(BUCKET).remove([pdfPath]);
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

export async function uploadPdf(userId, noteId, file) {
  const path = `${userId}/${noteId}.pdf`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: 'application/pdf' });
  if (error) throw error;
  return path;
}

export async function downloadPdf(path) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw error;
  return await data.arrayBuffer();
}
