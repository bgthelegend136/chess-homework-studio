'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { createStudent } from '../actions';

export default function NewStudentPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await createStudent({ name, email: email || null, notes: notes || null });
      router.push('/students');
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create student');
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md w-full p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-stone-800">New student</h1>
      </div>

      <div className="bg-white rounded-lg border border-stone-200 shadow-sm p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            id="name"
            label="Name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Maya Kovalenko"
          />

          <Input
            id="email"
            type="email"
            label="Email (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="maya@example.com"
          />

          <Textarea
            id="notes"
            label="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Plays the Sicilian, needs work on endgames…"
          />

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="submit" variant="primary" disabled={loading || !name.trim()}>
              {loading ? 'Creating…' : 'Create student'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
