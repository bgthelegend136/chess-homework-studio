'use client';
import { useState, useCallback, useEffect } from 'react';
import { Chess } from 'chess.js';
import { Board } from '@/components/chess/Board';
import { Button } from '@/components/ui/Button';
import { validateMove } from '@/lib/chess/validateMove';

interface AnswerBoardProps {
  fen: string;
  sideToMove: 'w' | 'b';
  currentMove: string | null;
  onMove: (san: string, afterFen: string) => void;
  readOnly?: boolean;
  width?: number;
}

export function AnswerBoard({
  fen,
  sideToMove,
  currentMove,
  onMove,
  readOnly = false,
  width = 520,
}: AnswerBoardProps) {
  const [displayFen, setDisplayFen] = useState(() => {
    if (currentMove) {
      try {
        const chess = new Chess(fen);
        chess.move(currentMove);
        return chess.fen();
      } catch {
        return fen;
      }
    }
    return fen;
  });

  // Reset displayed position when the underlying question (fen) changes.
  useEffect(() => {
    if (currentMove) {
      try {
        const chess = new Chess(fen);
        chess.move(currentMove);
        setDisplayFen(chess.fen());
        return;
      } catch {
        /* fall through */
      }
    }
    setDisplayFen(fen);
  }, [fen, currentMove]);

  const handleDrop = useCallback(
    (from: string, to: string): boolean => {
      if (readOnly) return false;

      const result = validateMove(fen, from, to);
      if (!result) return false;

      setDisplayFen(result.afterFen);
      onMove(result.san, result.afterFen);
      return true;
    },
    [fen, readOnly, onMove],
  );

  function resetMove() {
    setDisplayFen(fen);
    onMove('', fen);
  }

  return (
    <div className="flex w-full max-w-full flex-col gap-3">
      <Board
        fen={displayFen}
        orientation={sideToMove === 'b' ? 'black' : 'white'}
        onPieceDrop={readOnly ? undefined : handleDrop}
        draggable={!readOnly}
        width={width}
      />
      <div className="flex items-center justify-between gap-3 text-xs text-stone-500">
        <span>
          {sideToMove === 'b' ? 'Black' : 'White'} to move
          {sideToMove === 'b' && ' - board flipped to your side'}
        </span>
        {currentMove && !readOnly && (
          <Button
            variant="secondary"
            size="sm"
            onClick={resetMove}
            aria-label="Reset move"
          >
            Reset move
          </Button>
        )}
      </div>
    </div>
  );
}
