'use client';
import type { DraftQuestion } from '@/creator-state/reducer';

interface QuestionListProps {
  questions: DraftQuestion[];
  editingIndex: number | null;
  readOnly: boolean;
  onEdit: (index: number) => void;
}

export function QuestionList({
  questions,
  editingIndex,
  readOnly,
  onEdit,
}: QuestionListProps) {
  if (questions.length === 0) return null;

  return (
    <div className="border-t border-stone-100 pt-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
          Saved questions - {questions.length}
        </p>
        {!readOnly && <p className="text-xs text-stone-400">click to edit</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        {questions.map((q, i) => (
          <button
            key={q.id ?? `draft-${i}`}
            onClick={() => onEdit(i)}
            className={`rounded border p-2.5 text-left text-sm transition-colors ${
              editingIndex === i
                ? 'border-amber-300 bg-amber-50'
                : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50'
            }`}
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 font-mono text-xs text-stone-400">
                Q{i + 1}
              </span>
              <div className="min-w-0">
                <p className="truncate text-stone-800">
                  {q.prompt || (
                    <span className="italic text-stone-400">No prompt yet</span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-stone-400">
                  after move {q.move_number} -{' '}
                  {q.side_to_move === 'b' ? 'Black' : 'White'} to move
                  {q.dirty && !readOnly && (
                    <span className="ml-1 text-amber-500">- unsaved</span>
                  )}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
