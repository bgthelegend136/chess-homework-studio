'use server';
import { requireCoach } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

const CreateStudentSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  email: z.string().email().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function createStudent(
  input: z.infer<typeof CreateStudentSchema>,
): Promise<{ id: string }> {
  const coach = await requireCoach();
  const data = CreateStudentSchema.parse(input);

  const supabase = createSupabaseServerClient();
  const { data: student, error } = await supabase
    .from('students')
    .insert({
      coach_id: coach.id,
      name: data.name,
      email: data.email ?? null,
      notes: data.notes ?? null,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return { id: student.id };
}
