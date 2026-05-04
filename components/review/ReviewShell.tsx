'use client';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Board } from '@/components/chess/Board';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { Assignment, Question, Answer, Evaluation } from '@/lib/types';
import type { ReviewPayload } from '@/app/(coach)/assignments/[id]/review/actions';
import {
  CALCULATION_DEPTH_LABEL,
  EVALUATION_CLASSES,
  EVALUATION_LABEL,
  EVALUATION_OPTIONS,
} from '@/lib/assignments/labels';
import { splitAcceptedMoves } from '@/lib/chess/selfReview';
import { Chess } from 'chess.js';

interface ReviewShellProps {
  assignment: Assignment & { students: { name: string } };
  questions: Question[];
  answersByQuestion: Record<string, Answer>;
  onSaveReview: (payload: ReviewPayload) => Promise<void>;
}

const DEFAULT_INCORRECT_FEEDBACK =
  'Review the coach explanation carefully and bring questions to the next lesson.';

function moveToSquares(fen: string, san: string | null): [string, string] | null {
  if (!san) return null;
  try {
    const chess = new Chess(fen);
    const move = chess.move(san, { strict: false });
    if (!move) return null;
    return [move.from, move.to];
  } catch {
    return null;
  }
}

function resultBadge(answer: Answer | undefined) {
  if (!answer || answer.is_correct === null) {
    return <Badge variant="muted">Not checked</Badge>;
  }
  return answer.is_correct ? (
    <Badge variant="success">Correct</Badge>
  ) : (
    <span className="inline-flex items-center rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
      Incorrect
    </span>
  );
}

export function ReviewShell({
  assignment,
  questions,
  answersByQuestion,
  onSaveReview,
}: ReviewShellProps) {
  const router = useRouter();

  const [perQuestionFeedback, setPerQuestionFeedback] = useState<Record<string, string>>(
    () => {
      const initial: Record<string, string> = {};
      for (const q of questions) initial[q.id] = answersByQuestion[q.id]?.feedback ?? '';
      return initial;
    },
  );
  const [perQuestionEval, setPerQuestionEval] = useState<Record<string, Evaluation | ''>>(
    () => {
      const initial: Record<string, Evaluation | ''> = {};
      for (const q of questions)
        initial[q.id] = (answersByQuestion[q.id]?.evaluation ?? '') as Evaluation | '';
      return initial;
    },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const wrongTagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const q of questions) {
      const answer = answersByQuestion[q.id];
      if (answer?.is_correct !== false) continue;
      for (const tag of q.tags ?? []) {
        counts[tag] = (counts[tag] ?? 0) + 1;
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [questions, answersByQuestion]);

  function fillMissingEvaluations(
    predicate: (answer: Answer) => boolean,
    evaluation: Evaluation,
  ) {
    setPerQuestionEval((prev) => {
      const next = { ...prev };
      for (const q of questions) {
        const answer = answersByQuestion[q.id];
        if (!answer || !predicate(answer) || next[q.id]) continue;
        next[q.id] = evaluation;
      }
      return next;
    });
  }

  function fillIncorrectFeedback() {
    setPerQuestionFeedback((prev) => {
      const next = { ...prev };
      for (const q of questions) {
        const answer = answersByQuestion[q.id];
        if (answer?.is_correct !== false || next[q.id]?.trim()) continue;
        next[q.id] = DEFAULT_INCORRECT_FEEDBACK;
      }
      return next;
    });
  }

  function clearEvaluations() {
    setPerQuestionEval((prev) => {
      const next = { ...prev };
      for (const q of questions) next[q.id] = '';
      return next;
    });
  }

  async function handleSubmit() {
    setError(null);
    setSaving(true);
    try {
      const payload: ReviewPayload = {
        perQuestionFeedback: questions
          .map((q) => {
            const ans = answersByQuestion[q.id];
            if (!ans) return null;
            return {
              answerId: ans.id,
              feedback: perQuestionFeedback[q.id] ?? '',
              evaluation: (perQuestionEval[q.id] || null) as Evaluation | null,
            };
          })
          .filter(
            (x): x is {
              answerId: string;
              feedback: string;
              evaluation: Evaluation | null;
            } => x !== null,
          ),
        overallFeedback: '',
        grade: '',
      };
      await onSaveReview(payload);
      setSavedAt(Date.now());
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-stone-50">
      <div className="mx-auto max-w-6xl w-full p-4 sm:p-6 flex flex-col gap-4">
        <header className="sticky top-0 z-10 -mx-4 -mt-4 border-b border-stone-200 bg-stone-50/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:-mt-6 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-stone-500">
              Answer Analysis
            </p>
            <h1 className="text-lg font-semibold text-stone-800">
              {assignment.title}
            </h1>
            <p className="text-xs text-stone-500 mt-0.5">
              Student: {assignment.students.name}
            </p>
          </div>
          <div className="flex flex-col gap-2 lg:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success">Completed</Badge>
              {wrongTagCounts.length === 0 ? (
                <span className="text-xs text-stone-500">No recurring weak tags</span>
              ) : (
                wrongTagCounts.map(([tag, count]) => (
                  <span
                    key={tag}
                    className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-800"
                  >
                    {tag}: {count} wrong
                  </span>
                ))
              )}
            </div>
            <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                fillMissingEvaluations(
                  (answer) => answer.is_correct === true,
                  'correct',
                )
              }
              title="Missing evaluations for correct checked answers become Correct."
            >
              Fill correct
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                fillMissingEvaluations(
                  (answer) => answer.is_correct === false,
                  'mistake',
                )
              }
              title="Missing evaluations for incorrect checked answers become Mistake."
            >
              Fill mistakes
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                fillMissingEvaluations(
                  (answer) => answer.is_correct === null,
                  'blunder',
                )
              }
              title="Missing evaluations for saved unchecked answers become Blunder. Missing answer rows are skipped."
            >
              Fill blunders
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={fillIncorrectFeedback}
              title="Fill empty feedback on incorrect answers."
            >
              Feedback for incorrect
            </Button>
            <Button
              type="button"
              size="sm"
              variant="danger"
              onClick={clearEvaluations}
              title="Clears all local evaluation selections. Nothing is saved until Save review."
            >
              Clear evaluations
            </Button>
            <Button variant="primary" size="sm" onClick={handleSubmit} disabled={saving}>
              {saving ? 'Saving...' : 'Save review'}
            </Button>
            </div>
          </div>
          </div>
        </header>

        {questions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-stone-500">
            This assignment has no questions.
          </div>
        ) : (
          questions.map((q, idx) => {
            const ans = answersByQuestion[q.id];
            const acceptedMoves = splitAcceptedMoves(q.coach_reference_answer);
            const arrowSquares = moveToSquares(q.fen, ans?.student_move ?? null);
            const arrows: Array<[string, string, string?]> | undefined = arrowSquares
              ? [[arrowSquares[0], arrowSquares[1], 'rgb(22, 163, 74)']]
              : undefined;

            return (
              <section
                key={q.id}
                className="rounded-lg border border-stone-200 bg-white shadow-sm overflow-hidden"
              >
                <div className="border-b border-stone-100 px-5 py-3 bg-stone-50">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-stone-500">
                        Question {idx + 1} - Move {q.move_number}
                      </p>
                      <p className="text-stone-800 mt-1">{q.prompt}</p>
                    </div>
                    {resultBadge(ans)}
                  </div>
                </div>

                <div className="grid gap-5 p-4 lg:grid-cols-[380px_minmax(0,1fr)]">
                  <div className="w-full lg:sticky lg:top-32 lg:self-start">
                    <Board
                      fen={q.fen}
                      orientation={q.side_to_move === 'w' ? 'white' : 'black'}
                      draggable={false}
                      width={380}
                      arrows={arrows}
                    />
                    {ans?.student_move && (
                      <p className="mt-2 text-xs text-green-700">
                        Green arrow shows the student&apos;s move
                      </p>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-col gap-4">
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wide text-stone-500 mb-1 block">
                        Student move
                      </label>
                      <div className="rounded border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-sm text-stone-800">
                        {ans?.student_move ? (
                          <>
                            {q.side_to_move === 'b' ? '...' : ''}
                            {ans.student_move}
                          </>
                        ) : (
                          <span className="text-stone-400 italic font-sans">
                            No move submitted
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium uppercase tracking-wide text-stone-500 mb-1 block">
                        Student explanation
                      </label>
                      <div className="rounded border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700 whitespace-pre-wrap min-h-16">
                        {ans?.explanation || (
                          <span className="text-stone-400 italic">
                            No explanation submitted
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded border border-stone-200 bg-white p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-stone-500 mb-1">
                          Attempts
                        </p>
                        <p className="text-sm text-stone-700">
                          {ans
                            ? `${ans.attempt_count ?? 0} check${
                                (ans.attempt_count ?? 0) === 1 ? '' : 's'
                              }`
                            : 'No answer'}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">
                          Hint {ans?.hint_used ? 'used' : 'not used'}
                        </p>
                      </div>

                      <div className="rounded border border-stone-200 bg-white p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-stone-500 mb-1">
                          Hint
                        </p>
                        {q.hint ? (
                          <p className="text-sm text-stone-700 whitespace-pre-wrap">
                            {q.hint}
                          </p>
                        ) : (
                          <p className="text-sm text-stone-400 italic">
                            No hint configured
                          </p>
                        )}
                      </div>

                      <div className="rounded border border-stone-200 bg-white p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-stone-500 mb-1">
                          Accepted move(s)
                        </p>
                        {acceptedMoves.length > 0 ? (
                          <p className="font-mono text-sm text-stone-800">
                            {acceptedMoves.join(', ')}
                          </p>
                        ) : (
                          <p className="text-sm text-amber-800">
                            This question has no self-review answer configured yet.
                          </p>
                        )}
                      </div>

                      <div className="rounded border border-stone-200 bg-white p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-stone-500 mb-1">
                          Themes
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {(q.tags ?? []).length > 0 ? (
                            q.tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded border border-stone-200 bg-stone-50 px-2 py-0.5 text-xs text-stone-700"
                              >
                                {tag}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-stone-400 italic">
                              No tags
                            </span>
                          )}
                          <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-800">
                            Calculation: {CALCULATION_DEPTH_LABEL[q.calculation_depth ?? 'none']}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded border border-stone-200 bg-white p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-stone-500 mb-1">
                        Coach explanation
                      </p>
                      <p className="text-sm text-stone-700 whitespace-pre-wrap">
                        {q.coach_explanation || (
                          <span className="text-stone-400 italic">
                            No coach explanation has been added yet.
                          </span>
                        )}
                      </p>
                    </div>

                    {ans ? (
                      <>
                        <div>
                          <label className="text-xs font-medium uppercase tracking-wide text-stone-500 mb-1 block">
                            Optional coach assessment
                          </label>
                          <div className="flex flex-wrap gap-1.5">
                            {EVALUATION_OPTIONS.map((opt) => {
                              const active = perQuestionEval[q.id] === opt;
                              return (
                                <button
                                  type="button"
                                  key={opt}
                                  aria-pressed={active}
                                  onClick={() =>
                                    setPerQuestionEval((prev) => ({
                                      ...prev,
                                      [q.id]: active ? '' : opt,
                                    }))
                                  }
                                  className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                                    active
                                      ? EVALUATION_CLASSES[opt] + ' font-medium'
                                      : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-50'
                                  }`}
                                >
                                  {EVALUATION_LABEL[opt]}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <Textarea
                          id={`feedback-${q.id}`}
                          label="Optional personal feedback"
                          value={perQuestionFeedback[q.id] ?? ''}
                          onChange={(e) =>
                            setPerQuestionFeedback((prev) => ({
                              ...prev,
                              [q.id]: e.target.value,
                            }))
                          }
                          rows={3}
                          placeholder="Extra note for this student, if needed."
                        />
                      </>
                    ) : (
                      <p className="text-xs text-stone-400 italic">
                        No answer submitted - optional feedback unavailable.
                      </p>
                    )}
                  </div>
                </div>
              </section>
            );
          })
        )}

        <div className="flex items-center justify-between gap-4 pb-8">
          <div className="text-xs text-stone-500">
            {error && <span className="text-red-600">{error}</span>}
            {!error && savedAt && <span>Saved.</span>}
          </div>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : 'Save review'}
          </Button>
        </div>
      </div>
    </div>
  );
}
