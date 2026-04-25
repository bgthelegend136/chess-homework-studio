'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { createGroup } from './actions';

export function GroupCreateForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await createGroup({ name });
      setName('');
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create group');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input
            id="group-name"
            label="New group"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Saturday juniors"
          />
        </div>
        <Button type="submit" variant="primary" disabled={loading || !name.trim()}>
          {loading ? 'Creating...' : 'Create group'}
        </Button>
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2">
          {error}
        </p>
      )}
    </form>
  );
}
