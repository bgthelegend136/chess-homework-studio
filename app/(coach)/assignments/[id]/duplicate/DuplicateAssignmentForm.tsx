'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { duplicateAssignment } from '@/app/(coach)/assignments/actions';
import type { Student, StudentGroupWithCount } from '@/lib/types';

interface DuplicateAssignmentFormProps {
  sourceId: string;
  initialTitle: string;
  initialDueDate: string;
  students: Student[];
  groups: StudentGroupWithCount[];
}

export function DuplicateAssignmentForm({
  sourceId,
  initialTitle,
  initialDueDate,
  students,
  groups,
}: DuplicateAssignmentFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [dueDate, setDueDate] = useState(initialDueDate);
  const [recipientType, setRecipientType] = useState<'student' | 'group'>('student');
  const [studentId, setStudentId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { id } = await duplicateAssignment({
        source_id: sourceId,
        title,
        due_date: dueDate || null,
        recipient_type: recipientType,
        student_id: recipientType === 'student' ? studentId : undefined,
        group_id: recipientType === 'group' ? groupId : undefined,
      });
      router.push(`/assignments/${id}/edit`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to duplicate assignment');
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          id="title"
          label="New title *"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Duplicate to
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRecipientType('student')}
              className={`rounded border px-3 py-2 text-sm ${
                recipientType === 'student'
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
              }`}
            >
              Student
            </button>
            <button
              type="button"
              onClick={() => setRecipientType('group')}
              className={`rounded border px-3 py-2 text-sm ${
                recipientType === 'group'
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
              }`}
            >
              Group
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor={recipientType}
            className="text-xs font-medium uppercase tracking-wide text-stone-500"
          >
            {recipientType === 'group' ? 'Group *' : 'Student *'}
          </label>
          {recipientType === 'student' ? (
            <select
              id="student"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              required
              className="rounded border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="">Select a student...</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                </option>
              ))}
            </select>
          ) : (
            <select
              id="group"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              required
              className="rounded border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="">Select a group...</option>
              {groups.map((group) => (
                <option
                  key={group.id}
                  value={group.id}
                  disabled={group.student_count === 0}
                >
                  {group.name} ({group.student_count} student
                  {group.student_count === 1 ? '' : 's'})
                </option>
              ))}
            </select>
          )}
        </div>

        <Input
          id="due_date"
          type="date"
          label="Due date (optional)"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />

        {error && (
          <p className="rounded border border-red-100 bg-red-50 p-2 text-xs text-red-600">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            type="submit"
            variant="primary"
            disabled={
              loading ||
              !title.trim() ||
              (recipientType === 'student' ? !studentId : !groupId)
            }
          >
            {loading ? 'Duplicating...' : 'Duplicate & edit'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
