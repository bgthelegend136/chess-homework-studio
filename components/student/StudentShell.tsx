'use client';
import { useState, useCallback } from 'react';
import { AnswerBoard } from './AnswerBoard';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { QuestionWithAnswer, Assignment } from '@/lib/types';
import { CALCULATION_DEPTH_LABEL } from '@/lib/assignments/labels';
import { splitAcceptedMoves } from '@/lib/chess/selfReview';

interface StudentShellProps {
  assignment: Assignment & { students: { name: string } };
  questions: QuestionWithAnswer[];
  token: string;
  initialAnswers: Record<
    string,
    {
      student_move: string | null;
      explanation: string | null;
      is_correct: boolean | null;
    }
  >;
}

type AnswerDraft = {
  student_move: string;
  explanation: string;
  saving: boolean;
  checking: boolean;
  is_correct: boolean | null;
  resultVisible: boolean;
  checkMessage: string | null;
  checkError: string | null;
};

type CheckResponse = {
  acceptedMoves: string[];
  invalidAcceptedMoves: string[];
  canCheck: boolean;
  isCorrect: boolean | null;
  message: string | null;
};

function dueDateBadge(due: string | null): {
  text: string;
  variant: 'muted' | 'info' | 'warning' | 'danger';
} | null {
  if (!due) return null;
  const dueDate = new Date(due + 'T23:59:59');
  const now = new Date();
  const diffMs = dueDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  const formatted = dueDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  if (diffMs < 0) {
    return { text: `Overdue - was due ${formatted}`, variant: 'danger' };
  }
  if (diffDays === 0) {
    return { text: `Due today (${formatted})`, variant: 'warning' };
  }
  if (diffDays <= 3) {
    return {
      text: `Due in ${diffDays} day${diffDays === 1 ? '' : 's'} (${formatted})`,
      variant: 'warning',
    };
  }
  return { text: `Due ${formatted} - in ${diffDays} days`, variant: 'info' };
}

function hasAcceptedMoves(question: QuestionWithAnswer): boolean {
  return splitAcceptedMoves(question.coach_reference_answer).length > 0;
}

export function StudentShell({
  assignment,
  questions,
  token,
  initialAnswers,
}: StudentShellProps) {
  const isReviewed = assignment.status === 'reviewed';

  const [currentIndex, setCurrentIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, AnswerDraft>>(() => {
    const result: Record<string, AnswerDraft> = {};
    for (const q of questions) {
      const existing = initialAnswers[q.id];
      const checkedResult = existing?.is_correct ?? null;
      result[q.id] = {
        student_move: existing?.student_move ?? '',
        explanation: existing?.explanation ?? '',
        saving: false,
        checking: false,
        is_correct: checkedResult,
        resultVisible: checkedResult !== null,
        checkMessage: null,
        checkError: null,
      };
    }
    return result;
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(
    assignment.status === 'submitted' || assignment.status === 'reviewed',
  );
  const [submitError, setSubmitError] = useState<string | null>(null);

  const currentQuestion = questions[currentIndex];
  const currentDraft = currentQuestion ? drafts[currentQuestion.id] : null;
  const completed = submitted;

  async function saveDraft(questionId: string, move: string, explanation: string) {
    if (drafts[questionId]?.resultVisible) return;
    setDrafts((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], saving: true },
    }));

    try {
      await fetch(`/api/public/${token}/answers`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: questionId, student_move: move, explanation }),
      });
    } finally {
      setDrafts((prev) => ({
        ...prev,
        [questionId]: { ...prev[questionId], saving: false },
      }));
    }
  }

  const handleMove = useCallback(
    async (questionId: string, san: string) => {
      setDrafts((prev) => ({
        ...prev,
        [questionId]: {
          ...prev[questionId],
          student_move: san,
          is_correct: null,
          resultVisible: false,
          checkMessage: null,
          checkError: null,
        },
      }));
      await saveDraft(questionId, san, drafts[questionId]?.explanation ?? '');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, drafts, completed],
  );

  const handleExplanationChange = (questionId: string, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], explanation: value },
    }));
  };

  const handleExplanationBlur = async (questionId: string) => {
    const draft = drafts[questionId];
    if (!draft) return;
    await saveDraft(questionId, draft.student_move, draft.explanation);
  };

  async function handleCheck(question: QuestionWithAnswer) {
    const draft = drafts[question.id];
    if (!draft) return;
    setDrafts((prev) => ({
      ...prev,
      [question.id]: { ...prev[question.id], checking: true, checkError: null },
    }));

    try {
      await saveDraft(question.id, draft.student_move, draft.explanation);
      const res = await fetch(`/api/public/${token}/answers/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: question.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? 'Could not check this answer');
      }
      const result = body as CheckResponse;
      setDrafts((prev) => ({
        ...prev,
        [question.id]: {
          ...prev[question.id],
          checking: false,
          is_correct: result.isCorrect,
          resultVisible: true,
          checkMessage: result.message,
          checkError: null,
        },
      }));
    } catch (e: unknown) {
      setDrafts((prev) => ({
        ...prev,
        [question.id]: {
          ...prev[question.id],
          checking: false,
          checkError: e instanceof Error ? e.message : 'Could not check this answer',
        },
      }));
    }
  }

  async function goTo(index: number) {
    if (currentQuestion) {
      const draft = drafts[currentQuestion.id];
      if (draft) {
        await saveDraft(currentQuestion.id, draft.student_move, draft.explanation);
      }
    }
    setCurrentIndex(index);
  }

  const unresolvedConfiguredCount = questions.filter(
    (q) => hasAcceptedMoves(q) && !drafts[q.id]?.resultVisible,
  ).length;

  async function handleSubmit() {
    if (unresolvedConfiguredCount > 0) {
      setSubmitError('Check each configured question before completing.');
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/${token}/submit`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Submit failed');
      }
      setSubmitted(true);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  if (!currentQuestion) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-stone-500">No questions in this assignment.</p>
      </div>
    );
  }

  const due = dueDateBadge(assignment.due_date);
  const acceptedMoves = splitAcceptedMoves(currentQuestion.coach_reference_answer);
  const canEditCurrent = !currentDraft?.resultVisible;
  const showSelfReview =
    acceptedMoves.length === 0 || currentDraft?.resultVisible;

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white px-4 py-3">
        <div className="mx-auto max-w-5xl flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-stone-500 uppercase tracking-wide">
              Assignment from coach
            </p>
            <h1 className="text-lg font-semibold text-stone-800">{assignment.title}</h1>
            {due && (
              <span
                className={`inline-block mt-1 text-xs px-2 py-0.5 rounded border ${
                  due.variant === 'danger'
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : due.variant === 'warning'
                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                      : 'bg-stone-50 border-stone-200 text-stone-600'
                }`}
              >
                {due.text}
              </span>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <p className="text-xs text-stone-500">
              Question {currentIndex + 1} of {questions.length}
            </p>
            <div className="flex gap-1">
              {questions.map((q, i) => (
                <div
                  key={q.id}
                  className={`h-1.5 w-8 rounded-full transition-colors ${
                    i < currentIndex
                      ? 'bg-stone-400'
                      : i === currentIndex
                        ? 'bg-amber-500'
                        : 'bg-stone-200'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </header>

      {isReviewed && (assignment.overall_feedback || assignment.grade) && (
        <div className="mx-auto max-w-5xl px-4 pt-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm font-medium text-green-800 mb-1">
              Extra feedback from your coach
            </p>
            {assignment.overall_feedback && (
              <p className="text-sm text-green-900 whitespace-pre-wrap">
                {assignment.overall_feedback}
              </p>
            )}
            {assignment.grade && (
              <p className="mt-2 text-sm">
                Grade: <strong className="text-green-900">{assignment.grade}</strong>
              </p>
            )}
          </div>
        </div>
      )}

      {completed && !isReviewed && unresolvedConfiguredCount === 0 && (
        <div className="mx-auto max-w-5xl px-4 pt-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm font-medium text-green-800">
              Completed. You can review your checked answers below.
            </p>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-6">
          <p className="text-xs text-stone-500 uppercase tracking-wide mb-1">
            Question {currentIndex + 1} - Position after move {currentQuestion.move_number}
          </p>
          <h2 className="text-2xl font-semibold text-stone-800 leading-snug">
            {currentQuestion.prompt}
          </h2>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="shrink-0 w-full max-w-[520px] lg:w-[520px]">
            <AnswerBoard
              fen={currentQuestion.fen}
              sideToMove={currentQuestion.side_to_move}
              currentMove={currentDraft?.student_move ?? null}
              onMove={(san) => handleMove(currentQuestion.id, san)}
              readOnly={!canEditCurrent}
              width={520}
            />
          </div>

          <div className="flex-1 flex flex-col gap-5 min-w-0">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-stone-500 mb-1 block">
                Your move
              </label>
              <div className="rounded border border-stone-300 bg-white px-4 py-3 text-stone-800">
                {currentDraft?.student_move ? (
                  <span className="font-mono text-base">
                    {currentQuestion.side_to_move === 'b' ? '...' : ''}
                    {currentDraft.student_move}
                  </span>
                ) : (
                  <span className="text-stone-400 italic text-sm">
                    Drag a piece on the board to select your move
                  </span>
                )}
              </div>
            </div>

            {canEditCurrent ? (
              <Textarea
                id={`explanation-${currentQuestion.id}`}
                label="Your reasoning"
                value={currentDraft?.explanation ?? ''}
                onChange={(e) =>
                  handleExplanationChange(currentQuestion.id, e.target.value)
                }
                onBlur={() => handleExplanationBlur(currentQuestion.id)}
                rows={5}
                placeholder="Explain your thinking - candidate moves, key squares, plans..."
              />
            ) : (
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-stone-500 mb-1 block">
                  Your reasoning
                </label>
                <div className="rounded border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 whitespace-pre-wrap min-h-20">
                  {currentDraft?.explanation || (
                    <span className="text-stone-400 italic">No explanation submitted</span>
                  )}
                </div>
              </div>
            )}

            {acceptedMoves.length > 0 && canEditCurrent && (
              <div>
                {currentDraft?.checkError && (
                  <p className="mb-2 text-xs text-red-600">{currentDraft.checkError}</p>
                )}
                <Button
                  variant="primary"
                  onClick={() => handleCheck(currentQuestion)}
                  disabled={!currentDraft?.student_move || currentDraft.checking}
                >
                  {currentDraft?.checking ? 'Checking...' : 'Check answer'}
                </Button>
              </div>
            )}

            {showSelfReview && (
              <div className="rounded border border-stone-200 bg-white p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-stone-500 mb-2">
                  Self-review
                </p>
                {acceptedMoves.length === 0 ? (
                  <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-3">
                    This question has no self-review answer configured yet.
                  </p>
                ) : currentDraft?.is_correct === null ? (
                  <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-3">
                    {currentDraft?.checkMessage ??
                      'No checked result is stored for this answer yet.'}
                  </p>
                ) : (
                  <div
                    className={`rounded border px-3 py-2 text-sm font-semibold ${
                      currentDraft?.is_correct
                        ? 'border-green-200 bg-green-50 text-green-800'
                        : 'border-red-200 bg-red-50 text-red-800'
                    }`}
                  >
                    {currentDraft?.is_correct ? 'Correct' : 'Incorrect'}
                  </div>
                )}

                {acceptedMoves.length > 0 && (
                  <div className="mt-4 flex flex-col gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-stone-500 mb-1">
                        Accepted move(s)
                      </p>
                      <p className="font-mono text-sm text-stone-800">
                        {acceptedMoves.join(', ')}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-stone-500 mb-1">
                        Coach explanation
                      </p>
                      <p className="text-sm text-stone-700 whitespace-pre-wrap">
                        {currentQuestion.coach_explanation || (
                          <span className="text-stone-400 italic">
                            No coach explanation has been added yet.
                          </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-stone-500 mb-1">
                        Themes
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {currentQuestion.tags.length > 0 ? (
                          currentQuestion.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded border border-stone-200 bg-stone-50 px-2 py-0.5 text-xs text-stone-700"
                            >
                              {tag}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-stone-400 italic">No tags</span>
                        )}
                        <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-800">
                          Calculation: {CALCULATION_DEPTH_LABEL[currentQuestion.calculation_depth ?? 'none']}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {isReviewed && currentQuestion.answers?.feedback && (
              <div className="rounded border border-stone-200 bg-white p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-stone-500 mb-1">
                  Extra coach feedback
                </p>
                <p className="text-sm text-stone-700 whitespace-pre-wrap">
                  {currentQuestion.answers.feedback}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-stone-200 bg-white sticky bottom-0 px-4 py-3">
        <div className="mx-auto max-w-5xl flex items-center justify-between gap-4">
          <Button
            variant="secondary"
            onClick={() => goTo(currentIndex - 1)}
            disabled={currentIndex === 0}
          >
            Previous
          </Button>

          <div className="flex items-center gap-3">
            {!completed && currentDraft?.saving && (
              <span className="text-xs text-stone-400">Saving...</span>
            )}
            {completed && unresolvedConfiguredCount === 0 && (
              <Badge variant="success">Completed</Badge>
            )}
          </div>

          {currentIndex < questions.length - 1 ? (
            <Button variant="primary" onClick={() => goTo(currentIndex + 1)}>
              {canEditCurrent ? 'Save & next' : 'Next'}
            </Button>
          ) : !completed ? (
            <div className="flex flex-col items-end gap-1">
              {submitError && (
                <p className="text-xs text-red-600">{submitError}</p>
              )}
              {unresolvedConfiguredCount > 0 && !submitError && (
                <p className="text-xs text-stone-500">
                  Check {unresolvedConfiguredCount} configured question
                  {unresolvedConfiguredCount === 1 ? '' : 's'} before completing.
                </p>
              )}
              <Button
                variant="primary"
                onClick={handleSubmit}
                disabled={submitting || unresolvedConfiguredCount > 0}
              >
                {submitting ? 'Completing...' : 'Complete assignment'}
              </Button>
            </div>
          ) : (
            <div className="w-32" />
          )}
        </div>
      </footer>
    </div>
  );
}
