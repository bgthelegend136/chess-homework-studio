'use client';
import { useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
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
  const selectedNode = state.selectedNodeId
    ? state.moveNodes.find((node) => node.id === state.selectedNodeId)
    : null;
  const navigationNodes = state.moveNodes.length > 0 ? state.moveNodes : null;
  const navigationIndex =
    selectedNode && navigationNodes
      ? navigationNodes.findIndex((node) => node.id === selectedNode.id)
      : selectedPlyIndex;

  const currentFen =
    selectedNode?.fen ??
    (selectedPlyIndex === -1
      ? startFen
      : plies[selectedPlyIndex]?.fen ?? startFen);

  const currentPly =
    selectedNode ?? (selectedPlyIndex >= 0 ? plies[selectedPlyIndex] : null);

  const sideLabel = currentPly
    ? currentPly.fen.split(' ')[1] === 'b'
      ? 'Black to move'
      : 'White to move'
    : 'Starting position';

  const positionLabel = currentPly
    ? `Position after ${plyLabel(currentPly)}`
    : 'Start position';

  function go(index: number) {
    if (navigationNodes) {
      if (index < -1) {
        dispatch({ type: 'SELECT_PLY', index: -1 });
        return;
      }
      if (index > navigationNodes.length - 1) index = navigationNodes.length - 1;
      if (index === -1) dispatch({ type: 'SELECT_PLY', index: -1 });
      else dispatch({ type: 'SELECT_NODE', id: navigationNodes[index].id });
      return;
    }

    if (index < -1) index = -1;
    if (index > plies.length - 1) index = plies.length - 1;
    dispatch({ type: 'SELECT_PLY', index });
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(navigationIndex - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(navigationIndex + 1);
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
  }, [navigationIndex, plies.length, state.moveNodes]);

  const selectedQuestionForThisPosition = state.questions.find(
    (q) => q.fen === currentFen,
  );

  const editingQuestion =
    state.editingIndex !== null ? state.questions[state.editingIndex] : null;
  const canDragAcceptedMove = !readOnly && editingQuestion?.fen === currentFen;

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
    <div className="flex w-full flex-col items-center gap-4">
      <div className="text-center">
        <p className="text-xs uppercase tracking-wide text-stone-500">
          {positionLabel}
        </p>
        {currentPly && (
          <p className="text-lg font-semibold text-stone-800">
            {currentPly.moveNumber}.{currentPly.color === 'b' ? '..' : ''}{' '}
            {currentPly.san} -{' '}
            <span className="text-base font-normal text-stone-500">
              {sideLabel}
            </span>
          </p>
        )}
      </div>

      <Board
        fen={currentFen}
        width={660}
        draggable={canDragAcceptedMove}
        onPieceDrop={canDragAcceptedMove ? handleAcceptedMoveDrop : undefined}
      />
      {canDragAcceptedMove && (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Drag a legal move on the board to add it as an accepted move in SAN.
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={navigationIndex === -1}
          className={navBtn}
          title="Start (Home)"
          aria-label="Jump to start"
        >
          <ChevronsLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => go(navigationIndex - 1)}
          disabled={navigationIndex <= -1}
          className={navBtn}
          title="Previous move (Left arrow)"
          aria-label="Previous move"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-28 px-3 py-1 text-center text-xs text-stone-500">
          {!currentPly
            ? 'start'
            : `move ${currentPly?.moveNumber ?? ''} (${navigationIndex + 1}/${navigationNodes?.length ?? plies.length})`}
        </span>
        <button
          type="button"
          onClick={() => go(navigationIndex + 1)}
          disabled={navigationIndex >= (navigationNodes?.length ?? plies.length) - 1}
          className={navBtn}
          title="Next move (Right arrow)"
          aria-label="Next move"
        >
          <ChevronRight className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => go((navigationNodes?.length ?? plies.length) - 1)}
          disabled={navigationIndex >= (navigationNodes?.length ?? plies.length) - 1}
          className={navBtn}
          title="End (End)"
          aria-label="Jump to end"
        >
          <ChevronsRight className="size-4" />
        </button>
      </div>

      {!readOnly && canAddQuestion && (
        <div className="flex flex-col items-center gap-1">
          {selectedQuestionForThisPosition ? (
            <p className="text-sm text-amber-600">
              This position already has a question
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
            press <kbd className="rounded bg-stone-100 px-1 font-mono">Q</kbd> -
            navigate with{' '}
            <kbd className="rounded bg-stone-100 px-1 font-mono">Left</kbd>{' '}
            <kbd className="rounded bg-stone-100 px-1 font-mono">Right</kbd>
          </p>
        </div>
      )}
    </div>
  );
}
