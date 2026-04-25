'use server';
import { revalidatePath } from 'next/cache';
import { requireCoach } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

const GroupIdSchema = z.string().uuid();
const StudentIdSchema = z.string().uuid();

const GroupNameSchema = z.object({
  name: z.string().min(1, 'Group name is required').max(120),
});

async function verifyGroupOwnership(groupId: string, coachId: string) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('student_groups')
    .select('id')
    .eq('id', groupId)
    .eq('coach_id', coachId)
    .single();

  if (error || !data) throw new Error('Group not found');
}

async function verifyStudentOwnership(studentId: string, coachId: string) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('students')
    .select('id')
    .eq('id', studentId)
    .eq('coach_id', coachId)
    .single();

  if (error || !data) throw new Error('Student not found');
}

export async function createGroup(input: z.infer<typeof GroupNameSchema>) {
  const coach = await requireCoach();
  const data = GroupNameSchema.parse(input);
  const supabase = createSupabaseServerClient();

  const { data: group, error } = await supabase
    .from('student_groups')
    .insert({
      coach_id: coach.id,
      name: data.name,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  revalidatePath('/groups');
  return { id: group.id as string };
}

export async function renameGroup(groupId: string, input: z.infer<typeof GroupNameSchema>) {
  const coach = await requireCoach();
  const id = GroupIdSchema.parse(groupId);
  const data = GroupNameSchema.parse(input);
  await verifyGroupOwnership(id, coach.id);

  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from('student_groups')
    .update({ name: data.name })
    .eq('id', id)
    .eq('coach_id', coach.id);

  if (error) throw new Error(error.message);
  revalidatePath('/groups');
  revalidatePath(`/groups/${id}`);
}

export async function deleteGroup(groupId: string) {
  const coach = await requireCoach();
  const id = GroupIdSchema.parse(groupId);
  await verifyGroupOwnership(id, coach.id);

  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from('student_groups')
    .delete()
    .eq('id', id)
    .eq('coach_id', coach.id);

  if (error) throw new Error(error.message);
  revalidatePath('/groups');
}

export async function addStudentToGroup(groupId: string, studentId: string) {
  const coach = await requireCoach();
  const parsedGroupId = GroupIdSchema.parse(groupId);
  const parsedStudentId = StudentIdSchema.parse(studentId);

  await verifyGroupOwnership(parsedGroupId, coach.id);
  await verifyStudentOwnership(parsedStudentId, coach.id);

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from('student_group_members').upsert(
    {
      group_id: parsedGroupId,
      student_id: parsedStudentId,
    },
    { onConflict: 'group_id,student_id' },
  );

  if (error) throw new Error(error.message);
  revalidatePath('/groups');
  revalidatePath(`/groups/${parsedGroupId}`);
  revalidatePath(`/students/${parsedStudentId}`);
}

export async function removeStudentFromGroup(groupId: string, studentId: string) {
  const coach = await requireCoach();
  const parsedGroupId = GroupIdSchema.parse(groupId);
  const parsedStudentId = StudentIdSchema.parse(studentId);

  await verifyGroupOwnership(parsedGroupId, coach.id);
  await verifyStudentOwnership(parsedStudentId, coach.id);

  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from('student_group_members')
    .delete()
    .eq('group_id', parsedGroupId)
    .eq('student_id', parsedStudentId);

  if (error) throw new Error(error.message);
  revalidatePath('/groups');
  revalidatePath(`/groups/${parsedGroupId}`);
  revalidatePath(`/students/${parsedStudentId}`);
}
