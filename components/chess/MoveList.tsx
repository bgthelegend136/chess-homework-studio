'use client';
import type { Ply } from '@/lib/chess/parsePgn';

interface MoveListProps {
  plies: Ply[];
  selectedIndex: number;
  questionPlyIndices?: Set<number>;
  onSelect: (index: number) => void;
  readOnly?: boolean;
}

export function MoveList({
  plies,
  selectedIndex,
  questionPlyIndices = new Set(),
  onSelect,
  readOnly = false,
}: MoveListProps) {
  if (plies.length === 0) {
    return (
      <p className="text-sm text-stone-400 text-center py-6">
        Paste a PGN to see moves
      </p>
    );
  }

  // Group into move pairs for display
  const movePairs: Array<{ moveNumber: number; white?: Ply; black?: Ply }> = [];
  for (let i = 0; i < plies.length; i++) {
    const ply = plies[i];
    if (ply.color === 'w') {
      movePairs.push({ moveNumber: ply.moveNumber, white: ply });
    } else {
      const last = movePairs[movePairs.length - 1];
      if (last && last.moveNumber === ply.moveNumber) {
        last.black = ply;
      } else {
        movePairs.push({ moveNumber: ply.moveNumber, black: ply });
      }
    }
  }

  const chipClass = (ply: Ply) => {
    const isSelected = ply.index === selectedIndex;
    const hasQuestion = questionPlyIndices.has(ply.index);
    return [
      'px-2 py-0.5 rounded text-sm font-mono cursor-pointer transition-colors',
      isSelected
        ? 'bg-amber-100 text-amber-900 font-semibold ring-1 ring-amber-400'
        : 'text-stone-700 hover:bg-stone-100',
      hasQuestion ? 'underline decoration-amber-500 decoration-2' : '',
    ].join(' ');
  };

  return (
    <div className="flex flex-col gap-0.5 text-sm select-none">
      {movePairs.map(({ moveNumber, white, black }) => (
        <div key={moveNumber} className="flex items-center gap-1">
          <span className="w-7 shrink-0 text-right text-xs text-stone-400 font-mono">
            {moveNumber}.
          </span>
          {white ? (
            <button
              className={chipClass(white)}
              onClick={() => onSelect(white.index)}
              title={readOnly ? undefined : 'Click to view position • Q to add question'}
            >
              {white.san}
              {questionPlyIndices.has(white.index) && (
                <span className="ml-1 text-amber-500 text-xs">★</span>
              )}
            </button>
          ) : (
            <span className="px-2 py-0.5 text-stone-300">…</span>
          )}
          {black ? (
            <button
              className={chipClass(black)}
              onClick={() => onSelect(black.index)}
              title={readOnly ? undefined : 'Click to view position • Q to add question'}
            >
              {black.san}
              {questionPlyIndices.has(black.index) && (
                <span className="ml-1 text-amber-500 text-xs">★</span>
              )}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
