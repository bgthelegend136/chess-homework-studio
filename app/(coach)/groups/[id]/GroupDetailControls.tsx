'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  addStudentToGroup,
  deleteGroup,
  removeStudentFromGroup,
  renameGroup,
} from '../actions';
import type { Student } from '@/lib/types';

interface RenameGroupFormProps {
  groupId: string;
  initialName: string;
}

export function RenameGroupForm({ groupId, initialName }: RenameGroupFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await renameGroup(groupId, { name });
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to rename group');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input
            id="group-name"
            label="Group name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          disabled={loading || !name.trim() || name.trim() === initialName}
        >
          {loading ? 'Saving...' : 'Save name'}
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}

interface AddStudentFormProps {
  groupId: string;
  eligibleStudents: Pick<Student, 'id' | 'name' | 'email'>[];
}

export function AddStudentForm({ groupId, eligibleStudents }: AddStudentFormProps) {
  const router = useRouter();
  const [studentId, setStudentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!studentId) return;
    setError(null);
    setLoading(true);
    try {
      await addStudentToGroup(groupId, studentId);
      setStudentId('');
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add student');
    } finally {
      setLoading(false);
    }
  }

  if (eligibleStudents.length === 0) {
    return (
      <p className="text-sm text-stone-500">
        All current students are already in this group.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 flex flex-col gap-1">
          <label
            htmlFor="student"
            className="text-xs font-medium uppercase tracking-wide text-stone-500"
          >
            Add student
          </label>
          <select
            id="student"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="rounded border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="">Select a student...</option>
            {eligibleStudents.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name}
                {student.email ? ` (${student.email})` : ''}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="primary" disabled={loading || !studentId}>
          {loading ? 'Adding...' : 'Add'}
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}

interface RemoveStudentButtonProps {
  groupId: string;
  studentId: string;
}

export function RemoveStudentButton({ groupId, studentId }: RemoveStudentButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRemove() {
    setError(null);
    setLoading(true);
    try {
      await removeStudentFromGroup(groupId, studentId);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to remove student');
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="danger" size="sm" onClick={handleRemove} disabled={loading}>
        {loading ? 'Removing...' : 'Remove'}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

interface DeleteGroupButtonProps {
  groupId: string;
}

export function DeleteGroupButton({ groupId }: DeleteGroupButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    setLoading(true);
    try {
      await deleteGroup(groupId);
      router.push('/groups');
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete group');
      setLoading(false);
    }
  }

  if (confirming) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-3">
        <p className="text-sm font-medium text-red-900">Delete this group?</p>
        <p className="mt-1 text-xs text-red-700">
          Students will not be deleted. Only this group and its memberships are removed.
        </p>
        <div className="mt-3 flex gap-2">
          <Button variant="danger" size="sm" onClick={handleDelete} disabled={loading}>
            {loading ? 'Deleting...' : 'Delete group'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setConfirming(false)}
            disabled={loading}
          >
            Cancel
          </Button>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <Button variant="danger" onClick={() => setConfirming(true)}>
      Delete group
    </Button>
  );
}
