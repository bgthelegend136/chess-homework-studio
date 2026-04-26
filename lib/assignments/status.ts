import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { AssignmentStatus } from '@/lib/types';

export async function openByToken(token: string): Promise<void> {
  const supabase = createAdminClient();

  const { data: assignment, error } = await supabase
    .from('assignments')
    .select('id, status')
    .eq('student_token', token)
    .single();

  if (error || !assignment) throw new Error('Assignment not found');

  // Idempotent: already opened
  if (assignment.status !== 'not_opened') return;

  const { error: updateError } = await supabase
    .from('assignments')
    .update({
      status: 'in_progress' as AssignmentStatus,
      first_opened_at: new Date().toISOString(),
    })
    .eq('id', assignment.id);

  if (updateError) throw updateError;
}

export async function submitByToken(token: string): Promise<void> {
  const supabase = createAdminClient();

  const { data: assignment, error } = await supabase
    .from('assignments')
    .select('id, status, coach_id, title, students(name)')
    .eq('student_token', token)
    .single();

  if (error || !assignment) throw new Error('Assignment not found');

  if (assignment.status !== 'in_progress') {
    throw new Error(`Cannot submit: assignment is ${assignment.status}`);
  }

  const { error: updateError } = await supabase
    .from('assignments')
    .update({
      status: 'submitted' as AssignmentStatus,
      submitted_at: new Date().toISOString(),
    })
    .eq('id', assignment.id);

  if (updateError) throw updateError;

  try {
    const student = Array.isArray(assignment.students)
      ? assignment.students[0]
      : assignment.students;
    const studentName = student?.name ?? 'A student';
    const { error: notificationError } = await supabase
      .from('notifications')
      .insert({
        coach_id: assignment.coach_id,
        assignment_id: assignment.id,
        type: 'assignment_submitted',
        title: `Student completed assignment: ${assignment.title}`,
        body: `${studentName} completed "${assignment.title}".`,
      });

    if (notificationError && notificationError.code !== '23505') {
      console.error('Failed to create assignment submission notification', {
        assignmentId: assignment.id,
        error: notificationError.message,
      });
    }
  } catch (notificationError) {
    console.error('Failed to create assignment submission notification', {
      assignmentId: assignment.id,
      error:
        notificationError instanceof Error
          ? notificationError.message
          : String(notificationError),
    });
  }
}

export async function markReviewed(
  assignmentId: string,
  coachId: string,
  overallFeedback: string,
  grade: string,
): Promise<void> {
  const supabase = createAdminClient();

  const { data: assignment, error } = await supabase
    .from('assignments')
    .select('id, status, coach_id')
    .eq('id', assignmentId)
    .eq('coach_id', coachId)
    .single();

  if (error || !assignment) throw new Error('Assignment not found');

  if (assignment.status !== 'submitted') {
    throw new Error(
      `Cannot mark reviewed: assignment is ${assignment.status}`,
    );
  }

  const { error: updateError } = await supabase
    .from('assignments')
    .update({
      status: 'reviewed' as AssignmentStatus,
      reviewed_at: new Date().toISOString(),
      overall_feedback: overallFeedback || null,
      grade: grade || null,
    })
    .eq('id', assignmentId);

  if (updateError) throw updateError;
}
