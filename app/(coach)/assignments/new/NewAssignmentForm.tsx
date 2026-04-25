'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { createAssignment, createGroupAssignment } from '../actions';
import type { Student, StudentGroupWithCount } from '@/lib/types';

interface NewAssignmentFormProps {
  students: Student[];
  groups: StudentGroupWithCount[];
  preselectedStudentId: string;
  preselectedGroupId: string;
}

export function NewAssignmentForm({
  students,
  groups,
  preselectedStudentId,
  preselectedGroupId,
}: NewAssignmentFormProps) {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [recipientType, setRecipientType] = useState<'student' | 'group'>(
    preselectedGroupId ? 'group' : 'student',
  );
  const [studentId, setStudentId] = useState(preselectedStudentId);
  const [groupId, setGroupId] = useState(preselectedGroupId);
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { id } =
        recipientType === 'group'
          ? await createGroupAssignment({
              title,
              group_id: groupId,
              due_date: dueDate || null,
            })
          : await createAssignment({
              title,
              student_id: studentId,
              due_date: dueDate || null,
            });
      router.push(`/assignments/${id}/edit`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create assignment');
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-stone-200 shadow-sm p-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          id="title"
          label="Title *"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="Sicilian - your game vs A. Ivanov"
        />

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Send to
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
            htmlFor="student"
            className="text-xs font-medium uppercase tracking-wide text-stone-500"
          >
            {recipientType === 'group' ? 'Group *' : 'Student *'}
          </label>
          {recipientType === 'student' && students.length === 0 ? (
            <p className="text-sm text-stone-400">
              No students yet.{' '}
              <a href="/students/new" className="text-amber-600 hover:underline">
                Add one first
              </a>
              .
            </p>
          ) : recipientType === 'student' ? (
            <select
              id="student"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              required
              className="rounded border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="">Select a student...</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : groups.length === 0 ? (
            <p className="text-sm text-stone-400">
              No groups yet.{' '}
              <a href="/groups" className="text-amber-600 hover:underline">
                Create one first
              </a>
              .
            </p>
          ) : (
            <select
              id="group"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              required={recipientType === 'group'}
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
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2">
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
            {loading ? 'Creating...' : 'Create & add questions'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
