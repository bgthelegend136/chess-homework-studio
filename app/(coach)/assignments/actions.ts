'use server';
import { requireCoach } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { generateToken } from '@/lib/assignments/token';
import { z } from 'zod';

const CreateAssignmentSchema = z.object({
  title: z.string().min(1).max(300),
  student_id: z.string().uuid(),
  due_date: z.string().nullable().optional(),
});

const CreateGroupAssignmentSchema = z.object({
  title: z.string().min(1).max(300),
  group_id: z.string().uuid(),
  due_date: z.string().nullable().optional(),
});

export async function createAssignment(
  input: z.infer<typeof CreateAssignmentSchema>,
): Promise<{ id: string }> {
  const coach = await requireCoach();
  const data = CreateAssignmentSchema.parse(input);

  const supabase = createSupabaseServerClient();

  // Verify student belongs to this coach
  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('id')
    .eq('id', data.student_id)
    .eq('coach_id', coach.id)
    .single();

  if (studentError || !student) {
    throw new Error('Student not found');
  }

  const token = generateToken();

  const { data: assignment, error } = await supabase
    .from('assignments')
    .insert({
      coach_id: coach.id,
      student_id: data.student_id,
      title: data.title,
      pgn: '',
      status: 'not_opened',
      due_date: data.due_date ?? null,
      student_token: token,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return { id: assignment.id };
}

export async function createGroupAssignment(
  input: z.infer<typeof CreateGroupAssignmentSchema>,
): Promise<{ id: string; batchId: string; count: number }> {
  const coach = await requireCoach();
  const data = CreateGroupAssignmentSchema.parse(input);

  const supabase = createSupabaseServerClient();

  const { data: group, error: groupError } = await supabase
    .from('student_groups')
    .select('id')
    .eq('id', data.group_id)
    .eq('coach_id', coach.id)
    .single();

  if (groupError || !group) {
    throw new Error('Group not found');
  }

  const { data: members, error: membersError } = await supabase
    .from('student_group_members')
    .select('student_id, students(id, coach_id)')
    .eq('group_id', data.group_id);

  if (membersError) throw new Error(membersError.message);

  const studentIds = (members ?? [])
    .filter((member) => {
      const student = Array.isArray(member.students)
        ? member.students[0]
        : member.students;
      return student?.coach_id === coach.id;
    })
    .map((member) => member.student_id as string);

  if (studentIds.length === 0) {
    throw new Error('This group has no students');
  }

  const { data: batch, error: batchError } = await supabase
    .from('assignment_batches')
    .insert({
      coach_id: coach.id,
      group_id: data.group_id,
      title: data.title,
      due_date: data.due_date ?? null,
    })
    .select('id')
    .single();

  if (batchError) throw new Error(batchError.message);

  const { data: assignments, error } = await supabase
    .from('assignments')
    .insert(
      studentIds.map((studentId) => ({
        coach_id: coach.id,
        student_id: studentId,
        batch_id: batch.id,
        title: data.title,
        pgn: '',
        status: 'not_opened',
        due_date: data.due_date ?? null,
        student_token: generateToken(),
      })),
    )
    .select('id');

  if (error) throw new Error(error.message);
  const first = assignments?.[0];
  if (!first) throw new Error('No assignments were created');

  return { id: first.id as string, batchId: batch.id as string, count: studentIds.length };
}
