'use client';
import { useMemo, useEffect, useRef, useState, useTransition } from 'react';
import { Board } from '@/components/chess/Board';
import { Button } from '@/components/ui/Button';
import { validateMove } from '@/lib/chess/validateMove';
import type {
  OpeningAnnotation,
  OpeningMasteryLevel,
  OpeningPosition,
  OpeningPositionProgress,
  OpeningRepertoire,
} from '@/lib/types';
import { recordOpeningAttempt } from '../../actions';

interface TrainingPosition extends OpeningPosition {
  progress: Pick<
    OpeningPositionProgress,
    | 'mastery_level'
    | 'priority_score'
    | 'current_streak'
    | 'correct_count'
    | 'wrong_count'
  > | null;
}

interface OpeningTrainerProps {
  repertoire: OpeningRepertoire;
  positions: TrainingPosition[];
}

function annotationBoost(annotation: OpeningAnnotation | null): number {
  if (annotation === '!!') return 15;
  if (annotation === '!') return 8;
  return 0;
}

function levelBoost(level: OpeningMasteryLevel): number {
  if (level === 'weak') return 100;
  if (level === 'new') return 70;
  if (level === 'learning') return 35;
  return -20;
}

function effectiveScore(position: TrainingPosition): number {
  const level = position.progress?.mastery_level ?? 'new';
  return (
    (position.progress?.priority_score ?? position.priority_weight) +
    levelBoost(level) +
    (position.is_mainline ? 10 : -5) +
    annotationBoost(position.annotation)
  );
}

function chooseNextPosition(
  positions: TrainingPosition[],
  previousId: string | null,
  cursor: number,
): TrainingPosition {
  const sorted = [...positions].sort((a, b) => {
    const scoreDiff = effectiveScore(b) - effectiveScore(a);
    return scoreDiff || a.ply_index - b.ply_index;
  });
  const top = sorted.slice(0, Math.min(4, sorted.length));
  const filtered = top.length > 1 ? top.filter((p) => p.id !== previousId) : top;
  return filtered[cursor % filtered.length] ?? sorted[0];
}

export function OpeningTrainer({ repertoire, positions }: OpeningTrainerProps) {
  const [positionState, setPositionState] = useState(positions);
  const [cursor, setCursor] = useState(0);
  const [current, setCurrent] = useState(() =>
    positions.length > 0 ? chooseNextPosition(positions, null, 0) : null,
  );
  const [feedback, setFeedback] = useState<{
    kind: 'correct' | 'incorrect';
    attempted: string;
    correctMove: string;
  } | null>(null);
  const [sessionStats, setSessionStats] = useState({ correct: 0, incorrect: 0 });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const advanceRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!feedback || feedback.kind !== 'correct') return;
    const timer = setTimeout(() => {
      advanceRef.current?.();
    }, 600);
    return () => clearTimeout(timer);
  }, [feedback]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string, TrainingPosition[]>();
    for (const position of positionState) {
      if (!position.parent_position_id) continue;
      const list = map.get(position.parent_position_id) ?? [];
      list.push(position);
      map.set(position.parent_position_id, list);
    }
    return map;
  }, [positionState]);

  if (!current) {
    return (
      <div className="rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-stone-500">
        No trainable positions in this repertoire.
      </div>
    );
  }

  const accuracyTotal = sessionStats.correct + sessionStats.incorrect;
  const accuracy =
    accuracyTotal > 0 ? Math.round((sessionStats.correct / accuracyTotal) * 100) : 0;
  const sideLabel = repertoire.side_to_train === 'white' ? 'White' : 'Black';

  function advance(fromPosition: TrainingPosition) {
    const child = childrenByParent.get(fromPosition.id)?.[0];
    setFeedback(null);
    if (child) {
      setCurrent(child);
      return;
    }
    const nextCursor = cursor + 1;
    setCursor(nextCursor);
    setCurrent(chooseNextPosition(positionState, fromPosition.id, nextCursor));
  }

  function handleDrop(from: string, to: string): boolean {
    if (!current || feedback || isPending) return false;
    const result = validateMove(current.fen, from, to);
    if (!result) return false;

    setError(null);
    startTransition(async () => {
      try {
        const response = await recordOpeningAttempt({
          repertoire_id: repertoire.id,
          position_id: current.id,
          attempted_move: result.san,
          attempted_uci: `${result.from}${result.to}`,
        });

        setSessionStats((prev) => ({
          correct: prev.correct + (response.wasCorrect ? 1 : 0),
          incorrect: prev.incorrect + (response.wasCorrect ? 0 : 1),
        }));
        setPositionState((prev) =>
          prev.map((position) =>
            position.id === current.id
              ? {
                  ...position,
                  progress: {
                    mastery_level: response.masteryLevel,
                    priority_score: response.priorityScore,
                    current_streak: response.wasCorrect
                      ? (position.progress?.current_streak ?? 0) + 1
                      : 0,
                    correct_count:
                      (position.progress?.correct_count ?? 0) +
                      (response.wasCorrect ? 1 : 0),
                    wrong_count:
                      (position.progress?.wrong_count ?? 0) +
                      (response.wasCorrect ? 0 : 1),
                  },
                }
              : position,
          ),
        );
        const fb = {
          kind: response.wasCorrect ? 'correct' as const : 'incorrect' as const,
          attempted: result.san,
          correctMove: response.correctMove,
        };
        const snapshot = current;
        advanceRef.current = () => advance(snapshot);
        setFeedback(fb);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not record attempt');
      }
    });

    return true;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,520px)_1fr]">
      <div>
        <Board
          fen={current.fen}
          orientation={repertoire.side_to_train}
          draggable={!feedback && !isPending}
          onPieceDrop={handleDrop}
          width={520}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Current position
          </p>
          <h2 className="mt-1 text-xl font-semibold text-stone-800">
            Play {sideLabel}&apos;s repertoire move
          </h2>
          <p className="mt-2 text-sm text-stone-500">
            {current.opponent_move_san
              ? `Opponent just played ${current.opponent_move_san}.`
              : 'Start of repertoire.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded border border-stone-200 bg-stone-50 px-2 py-0.5 text-stone-700">
              {current.progress?.mastery_level ?? 'new'}
            </span>
            {current.annotation && (
              <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-800">
                {current.annotation}
              </span>
            )}
            <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-blue-800">
              score {effectiveScore(current)}
            </span>
          </div>
        </section>

        {feedback && (
          <section
            className={`rounded-lg border p-4 shadow-sm ${
              feedback.kind === 'correct'
                ? 'border-green-200 bg-green-50 text-green-900'
                : 'border-red-200 bg-red-50 text-red-900'
            }`}
          >
            <p className="font-semibold">
              {feedback.kind === 'correct' ? '✓ Correct' : '✗ Incorrect'}
            </p>
            {feedback.kind === 'incorrect' && (
              <>
                <p className="mt-1 text-sm">
                  You played: <span className="font-mono">{feedback.attempted}</span>
                </p>
                <p className="mt-1 text-sm">
                  Correct move: <span className="font-mono">{feedback.correctMove}</span>
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-3 bg-white"
                  onClick={() => advanceRef.current?.()}
                >
                  Continue
                </Button>
              </>
            )}
          </section>
        )}

        {error && (
          <p className="rounded border border-red-100 bg-red-50 p-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Session stats
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded border border-stone-200 bg-stone-50 p-2">
              <p className="text-lg font-semibold text-stone-800">
                {sessionStats.correct}
              </p>
              <p className="text-xs text-stone-500">Correct</p>
            </div>
            <div className="rounded border border-stone-200 bg-stone-50 p-2">
              <p className="text-lg font-semibold text-stone-800">
                {sessionStats.incorrect}
              </p>
              <p className="text-xs text-stone-500">Incorrect</p>
            </div>
            <div className="rounded border border-stone-200 bg-stone-50 p-2">
              <p className="text-lg font-semibold text-stone-800">{accuracy}%</p>
              <p className="text-xs text-stone-500">Accuracy</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
