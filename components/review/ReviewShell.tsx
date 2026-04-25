'use client';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Board } from '@/components/chess/Board';
import { Textarea } from '@/components/ui/Textarea';
import { Input } from '@/components/ui/Input';
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
  const [overallFeedback, setOverallFeedback] = useState(
    assignment.overall_feedback ?? '',
  );
  const [grade, setGrade] = useState(assignment.grade ?? '');
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
        overallFeedback,
        grade,
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
      <div className="mx-auto max-w-5xl w-full p-6 flex flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-stone-500">
              Answer Analysis
            </p>
            <h1 className="text-xl font-semibold text-stone-800">
              {assignment.title}
            </h1>
            <p className="text-sm text-stone-500 mt-0.5">
              Student: {assignment.students.name}
            </p>
          </div>
          <Badge variant="success">Completed</Badge>
        </header>

        <section className="rounded-lg border border-stone-200 bg-white shadow-sm p-5">
          <h2 className="text-sm font-semibold text-stone-800 mb-3">
            Wrong themes
          </h2>
          {wrongTagCounts.length === 0 ? (
            <p className="text-sm text-stone-500">
              No recurring weak tags from checked answers yet.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {wrongTagCounts.map(([tag, count]) => (
                <span
                  key={tag}
                  className="rounded border border-red-200 bg-red-50 px-2.5 py-1 text-sm text-red-800"
                >
                  {tag}: {count} wrong
                </span>
              ))}
            </div>
          )}
        </section>

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

                <div className="flex flex-col lg:flex-row gap-6 p-5">
                  <div className="shrink-0 w-full lg:w-auto">
                    <Board
                      fen={q.fen}
                      orientation={q.side_to_move === 'w' ? 'white' : 'black'}
                      draggable={false}
                      width={420}
                      arrows={arrows}
                    />
                    {ans?.student_move && (
                      <p className="mt-2 text-xs text-green-700">
                        Green arrow shows the student&apos;s move
                      </p>
                    )}
                  </div>

                  <div className="flex-1 flex flex-col gap-4 min-w-0">
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

        <section className="rounded-lg border border-stone-200 bg-white shadow-sm p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-stone-800">
            Optional summary
          </h2>
          <Textarea
            id="overall-feedback"
            label="Extra notes from the coach"
            value={overallFeedback}
            onChange={(e) => setOverallFeedback(e.target.value)}
            rows={4}
            placeholder="Optional summary comments..."
          />
          <Input
            id="grade"
            label="Grade (optional)"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            placeholder="e.g. A, 8/10, Pass"
          />
        </section>

        <div className="flex items-center justify-between gap-4 pb-8">
          <div className="text-xs text-stone-500">
            {error && <span className="text-red-600">{error}</span>}
            {!error && savedAt && <span>Saved.</span>}
          </div>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : 'Save optional feedback'}
          </Button>
        </div>
      </div>
    </div>
  );
}
