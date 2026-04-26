'use server';
import { revalidatePath } from 'next/cache';
import { requireCoach } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function markAllNotificationsRead(): Promise<void> {
  const coach = await requireCoach();
  const supabase = createSupabaseServerClient();

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('coach_id', coach.id)
    .is('read_at', null);

  if (error) throw new Error(error.message);
  revalidatePath('/dashboard');
}
