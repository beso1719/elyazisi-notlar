import { supabase } from './supabaseClient.js?v=12';

export async function getUser() {
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

export function onAuthChange(cb) {
  supabase.auth.onAuthStateChange((_event, session) => cb(session?.user ?? null));
}

export function signUp(email, password) {
  return supabase.auth.signUp({ email, password });
}

export function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export function signInWithMagicLink(email) {
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href.split('#')[0] },
  });
}

export function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href.split('#')[0] },
  });
}

export function signOut() {
  return supabase.auth.signOut();
}
