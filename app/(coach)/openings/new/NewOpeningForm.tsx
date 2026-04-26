'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { createOpeningRepertoire } from '../actions';
import type { OpeningSide } from '@/lib/types';

export function NewOpeningForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [sideToTrain, setSideToTrain] = useState<OpeningSide>('white');
  const [pgn, setPgn] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const { id } = await createOpeningRepertoire({
        name,
        side_to_train: sideToTrain,
        pgn,
      });
      router.push(`/openings/${id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not create repertoire');
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-lg border border-stone-200 bg-white p-6 shadow-sm"
    >
      <Input
        id="name"
        label="Name *"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="White vs Sicilian"
        required
      />

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
          Side to train
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(['white', 'black'] as const).map((side) => (
            <button
              type="button"
              key={side}
              onClick={() => setSideToTrain(side)}
              className={`rounded border px-3 py-2 text-sm capitalize transition-colors ${
                sideToTrain === side
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
              }`}
            >
              {side} repertoire
            </button>
          ))}
        </div>
      </div>

      <Textarea
        id="pgn"
        label="Repertoire PGN *"
        hint="Paste any PGN — variations and ? annotations are stripped automatically, only the mainline is trained."
        value={pgn}
        onChange={(e) => setPgn(e.target.value)}
        rows={12}
        placeholder={`[Event "Repertoire"]\n1. e4 e5 2. Nf3! Nc6 3. Bb5!! a6`}
        className="font-mono text-xs"
        required
      />

      {error && (
        <p className="rounded border border-red-100 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          type="submit"
          variant="primary"
          disabled={saving || !name.trim() || !pgn.trim()}
        >
          {saving ? 'Creating...' : 'Create repertoire'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
