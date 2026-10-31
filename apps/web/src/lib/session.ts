import { redirect } from 'next/navigation';
import { supabase } from './supabase/server';
import { configured } from './env';
export async function requireUser() {
  if (!configured()) redirect('/login');
  const db = await supabase();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) redirect('/login');
  return { db, user: data.user };
}
