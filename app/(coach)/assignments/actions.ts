'use server';
import { redirect } from 'next/navigation';
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

const DuplicateAssignmentSchema = z.object({
  source_id: z.string().uuid(),
  title: z.string().min(1).max(300).optional(),
  due_date: z.string().nullable().optional(),
  recipient_type: z.enum(['student', 'group']).default('student'),
  student_id: z.string().uuid().optional(),
  group_id: z.string().uuid().optional(),
});

export async function duplicateAssignment(
  input: z.infer<typeof DuplicateAssignmentSchema>,
): Promise<{ id: string; count: number }> {
  const coach = await requireCoach();
  const data = DuplicateAssignmentSchema.parse(input);

  const supabase = createSupabaseServerClient();

  const { data: source, error: sourceError } = await supabase
    .from('assignments')
    .select('id, student_id, title, pgn, due_date')
    .eq('id', data.source_id)
    .eq('coach_id', coach.id)
    .single();

  if (sourceError || !source) {
    throw new Error('Source assignment not found');
  }

  const { data: questions, error: questionsError } = await supabase
    .from('questions')
    .select(
      'order_index, fen, side_to_move, move_number, prompt, coach_reference_answer, coach_explanation, hint, coach_notes, tags, calculation_depth',
    )
    .eq('assignment_id', source.id)
    .order('order_index');

  if (questionsError) throw new Error(questionsError.message);

  const title = (data.title?.trim() || `Copy of ${source.title}`).slice(0, 300);
  const dueDate = data.due_date ?? source.due_date ?? null;

  if (data.recipient_type === 'group') {
    if (!data.group_id) throw new Error('Choose a group');

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
        title,
        due_date: dueDate,
      })
      .select('id')
      .single();

    if (batchError) throw new Error(batchError.message);

    let insertedAssignments: { id: string }[] | null = null;
    let lastGroupError: string | null = null;
    for (let attempt = 0; attempt < 2 && !insertedAssignments; attempt++) {
      const { data: assignments, error } = await supabase
        .from('assignments')
        .insert(
          studentIds.map((studentId) => ({
            coach_id: coach.id,
            student_id: studentId,
            batch_id: batch.id,
            title,
            pgn: source.pgn ?? '',
            status: 'not_opened',
            due_date: dueDate,
            student_token: generateToken(),
            source_assignment_id: source.id,
          })),
        )
        .select('id');

      if (!error && assignments) {
        insertedAssignments = assignments as { id: string }[];
        break;
      }
      lastGroupError = error?.message ?? 'Unknown error creating duplicate';
      if (!error?.message?.toLowerCase().includes('duplicate')) break;
    }

    if (!insertedAssignments || insertedAssignments.length === 0) {
      throw new Error(lastGroupError ?? 'Failed to create duplicate assignments');
    }

    if (questions && questions.length > 0) {
      const { error: insertQuestionsError } = await supabase.from('questions').insert(
        insertedAssignments.flatMap((assignment) =>
          questions.map((q) => ({
            assignment_id: assignment.id,
            order_index: q.order_index,
            fen: q.fen,
            side_to_move: q.side_to_move,
            move_number: q.move_number,
            prompt: q.prompt,
            coach_reference_answer: q.coach_reference_answer,
            coach_explanation: q.coach_explanation,
            hint: q.hint,
            coach_notes: q.coach_notes,
            tags: q.tags ?? [],
            calculation_depth: q.calculation_depth ?? 'none',
          })),
        ),
      );

      if (insertQuestionsError) {
        throw new Error(insertQuestionsError.message);
      }
    }

    return {
      id: insertedAssignments[0].id,
      count: insertedAssignments.length,
    };
  }

  const targetStudentId = data.student_id ?? source.student_id;
  const { data: targetStudent, error: targetStudentError } = await supabase
    .from('students')
    .select('id')
    .eq('id', targetStudentId)
    .eq('coach_id', coach.id)
    .single();

  if (targetStudentError || !targetStudent) {
    throw new Error('Student not found');
  }

  let newAssignmentId: string | null = null;
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2 && !newAssignmentId; attempt++) {
    const token = generateToken();
    const { data: inserted, error } = await supabase
      .from('assignments')
      .insert({
        coach_id: coach.id,
        student_id: targetStudentId,
        title,
        pgn: source.pgn ?? '',
        status: 'not_opened',
        due_date: dueDate,
        student_token: token,
        source_assignment_id: source.id,
      })
      .select('id')
      .single();

    if (!error && inserted) {
      newAssignmentId = inserted.id as string;
      break;
    }
    lastError = error?.message ?? 'Unknown error creating duplicate';
    // Retry once on unique violation (token collision); otherwise stop.
    if (!error?.message?.toLowerCase().includes('duplicate')) break;
  }

  if (!newAssignmentId) {
    throw new Error(lastError ?? 'Failed to create duplicate assignment');
  }

  if (questions && questions.length > 0) {
    const { error: insertQuestionsError } = await supabase
      .from('questions')
      .insert(
        questions.map((q) => ({
          assignment_id: newAssignmentId,
          order_index: q.order_index,
          fen: q.fen,
          side_to_move: q.side_to_move,
          move_number: q.move_number,
          prompt: q.prompt,
          coach_reference_answer: q.coach_reference_answer,
          coach_explanation: q.coach_explanation,
          hint: q.hint,
          coach_notes: q.coach_notes,
          tags: q.tags ?? [],
          calculation_depth: q.calculation_depth ?? 'none',
        })),
      );

    if (insertQuestionsError) {
      throw new Error(insertQuestionsError.message);
    }
  }

  return { id: newAssignmentId, count: 1 };
}

export async function duplicateAssignmentFormAction(formData: FormData) {
  const sourceId = formData.get('source_id');
  if (typeof sourceId !== 'string') {
    throw new Error('Missing source assignment id');
  }
  const { id } = await duplicateAssignment({
    source_id: sourceId,
    recipient_type: 'student',
  });
  redirect(`/assignments/${id}/edit`);
}
