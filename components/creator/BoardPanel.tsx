'use client';
import { useEffect } from 'react';
import { Board } from '@/components/chess/Board';
import { Button } from '@/components/ui/Button';
import type { CreatorAction, CreatorState } from '@/creator-state/reducer';
import { plyLabel } from '@/lib/chess/parsePgn';
import { validateMove } from '@/lib/chess/validateMove';
import { splitAcceptedMoves } from '@/lib/chess/selfReview';

interface BoardPanelProps {
  state: CreatorState;
  dispatch: React.Dispatch<CreatorAction>;
  canAddQuestion?: boolean;
}

export function BoardPanel({
  state,
  dispatch,
  canAddQuestion = !state.readOnly,
}: BoardPanelProps) {
  const { plies, selectedPlyIndex, startFen, readOnly } = state;

  const currentFen =
    selectedPlyIndex === -1
      ? startFen
      : plies[selectedPlyIndex]?.fen ?? startFen;

  const currentPly =
    selectedPlyIndex >= 0 ? plies[selectedPlyIndex] : null;

  const sideLabel =
    currentPly
      ? currentPly.fen.split(' ')[1] === 'b'
        ? 'Black to move'
        : 'White to move'
      : 'Starting position';

  const positionLabel = currentPly
    ? `Position after ${plyLabel(currentPly)}`
    : 'Start position';

  function go(index: number) {
    if (index < -1) index = -1;
    if (index > plies.length - 1) index = plies.length - 1;
    dispatch({ type: 'SELECT_PLY', index });
  }

  // Keyboard arrow nav (ignored when typing in inputs)
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(selectedPlyIndex - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(selectedPlyIndex + 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        go(-1);
      } else if (e.key === 'End') {
        e.preventDefault();
        go(plies.length - 1);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlyIndex, plies.length]);

  const selectedQuestionForThisPosition =
    state.questions.find((q) => q.fen === currentFen);

  const editingQuestion =
    state.editingIndex !== null ? state.questions[state.editingIndex] : null;
  const canDragAcceptedMove =
    !readOnly && editingQuestion?.fen === currentFen;

  function handleAcceptedMoveDrop(from: string, to: string): boolean {
    if (!editingQuestion) return false;
    const result = validateMove(currentFen, from, to);
    if (!result) return false;

    const acceptedMoves = splitAcceptedMoves(editingQuestion.coach_reference_answer);
    if (!acceptedMoves.includes(result.san)) {
      dispatch({
        type: 'UPDATE_EDITING',
        patch: {
          coach_reference_answer: [...acceptedMoves, result.san].join(', '),
        },
      });
    }

    return false;
  }

  const navBtn =
    'inline-flex items-center justify-center min-w-10 h-10 px-3 rounded border border-stone-300 bg-white text-stone-700 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium shadow-sm';

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div className="text-center">
        <p className="text-xs text-stone-500 uppercase tracking-wide">{positionLabel}</p>
        {currentPly && (
          <p className="text-lg font-semibold text-stone-800">
            {currentPly.moveNumber}.{currentPly.color === 'b' ? '..' : ''}{' '}
            {currentPly.san} —{' '}
            <span className="text-stone-500 font-normal text-base">
              {sideLabel}
            </span>
          </p>
        )}
      </div>

      <Board
        fen={currentFen}
        width={560}
        draggable={canDragAcceptedMove}
        onPieceDrop={canDragAcceptedMove ? handleAcceptedMoveDrop : undefined}
      />
      {canDragAcceptedMove && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Drag a legal move on the board to add it as an accepted move in SAN.
        </p>
      )}

      {/* Board navigation */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={selectedPlyIndex === -1}
          className={navBtn}
          title="Start (Home)"
          aria-label="Jump to start"
        >
          ⏮
        </button>
        <button
          type="button"
          onClick={() => go(selectedPlyIndex - 1)}
          disabled={selectedPlyIndex <= -1}
          className={navBtn}
          title="Previous move (←)"
          aria-label="Previous move"
        >
          ◀
        </button>
        <span className="px-3 py-1 text-xs text-stone-500 min-w-28 text-center">
          {selectedPlyIndex === -1
            ? 'start'
            : `move ${currentPly?.moveNumber ?? ''} (${selectedPlyIndex + 1}/${plies.length})`}
        </span>
        <button
          type="button"
          onClick={() => go(selectedPlyIndex + 1)}
          disabled={selectedPlyIndex >= plies.length - 1}
          className={navBtn}
          title="Next move (→)"
          aria-label="Next move"
        >
          ▶
        </button>
        <button
          type="button"
          onClick={() => go(plies.length - 1)}
          disabled={selectedPlyIndex >= plies.length - 1}
          className={navBtn}
          title="End (End)"
          aria-label="Jump to end"
        >
          ⏭
        </button>
      </div>

      {!readOnly && canAddQuestion && (
        <div className="flex flex-col items-center gap-1">
          {selectedQuestionForThisPosition ? (
            <p className="text-sm text-amber-600">
              ★ This position already has a question
            </p>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => dispatch({ type: 'ADD_QUESTION_FROM_SELECTED' })}
            >
              + Add question from this position
            </Button>
          )}
          <p className="text-xs text-stone-400">
            press <kbd className="font-mono bg-stone-100 px-1 rounded">Q</kbd> ·
            navigate with <kbd className="font-mono bg-stone-100 px-1 rounded">←</kbd>{' '}
            <kbd className="font-mono bg-stone-100 px-1 rounded">→</kbd>
          </p>
        </div>
      )}
    </div>
  );
}
