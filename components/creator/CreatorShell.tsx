'use client';
import { useReducer, useEffect, useCallback, useState } from 'react';
import { creatorReducer, initialCreatorState } from '@/creator-state/reducer';
import type { DraftQuestion } from '@/creator-state/reducer';
import { parsePgn } from '@/lib/chess/parsePgn';
import { PgnPanel } from './PgnPanel';
import { BoardPanel } from './BoardPanel';
import { QuestionEditor } from './QuestionEditor';
import { QuestionList } from './QuestionList';
import { Badge } from '@/components/ui/Badge';
import type { Assignment, Question } from '@/lib/types';
import {
  QUESTION_TAGS,
  STATUS_LABEL,
  STATUS_VARIANT,
} from '@/lib/assignments/labels';

interface CreatorShellProps {
  assignment: Assignment;
  initialQuestions: Question[];
  studentLink: string;
  batchLabel?: string | null;
  onSavePgn: (pgn: string) => Promise<void>;
  onSaveQuestion: (
    index: number,
    question: DraftQuestion,
    assignmentId: string,
  ) => Promise<{ id: string }>;
  onDeleteQuestion: (questionId: string) => Promise<void>;
}

export function CreatorShell({
  assignment,
  initialQuestions,
  studentLink,
  batchLabel,
  onSavePgn,
  onSaveQuestion,
  onDeleteQuestion,
}: CreatorShellProps) {
  const pgnLocked = assignment.status !== 'not_opened';
  const readOnly = false;
  const [state, dispatch] = useReducer(
    creatorReducer,
    initialCreatorState(readOnly),
  );

  useEffect(() => {
    if (assignment.pgn) {
      try {
        const result = parsePgn(assignment.pgn);
        dispatch({ type: 'PGN_PARSED', pgn: assignment.pgn, ...result });
      } catch (e) {
        dispatch({
          type: 'PGN_PARSE_ERROR',
          pgn: assignment.pgn,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (initialQuestions.length > 0) {
      dispatch({
        type: 'LOAD',
        questions: initialQuestions
          .sort((a, b) => a.order_index - b.order_index)
          .map((q) => ({
            id: q.id,
            order_index: q.order_index,
            fen: q.fen,
            side_to_move: q.side_to_move,
            move_number: q.move_number,
            prompt: q.prompt,
            coach_reference_answer: q.coach_reference_answer ?? '',
            coach_explanation: q.coach_explanation ?? '',
            hint: q.hint ?? '',
            coach_notes: q.coach_notes ?? '',
            tags: (q.tags ?? []).filter((tag) =>
              (QUESTION_TAGS as readonly string[]).includes(tag),
            ),
            calculation_depth: q.calculation_depth ?? 'none',
            dirty: false,
          })),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pgnLocked) return;
    function handleKey(e: KeyboardEvent) {
      const activeElement = document.activeElement;
      const tag = activeElement?.tagName;
      if (
        e.key.toLowerCase() === 'q' &&
        !e.ctrlKey &&
        !e.metaKey &&
        tag !== 'INPUT' &&
        tag !== 'TEXTAREA' &&
        tag !== 'SELECT' &&
        activeElement?.getAttribute('contenteditable') !== 'true'
      ) {
        e.preventDefault();
        dispatch({ type: 'ADD_QUESTION_FROM_SELECTED' });
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [pgnLocked]);

  const handleSaveQuestion = useCallback(async () => {
    const { editingIndex } = state;
    if (editingIndex === null) return;
    const q = state.questions[editingIndex];
    if (!q) return;

    dispatch({ type: 'SET_SAVING', saving: true });
    try {
      const { id } = await onSaveQuestion(editingIndex, q, assignment.id);
      dispatch({ type: 'SAVE_QUESTION_DONE', index: editingIndex, id });
    } finally {
      dispatch({ type: 'SET_SAVING', saving: false });
    }
  }, [state, assignment.id, onSaveQuestion]);

  const handleDeleteQuestion = useCallback(async () => {
    if (pgnLocked) return;
    const { editingIndex } = state;
    if (editingIndex === null) return;
    const q = state.questions[editingIndex];
    if (!q) return;

    dispatch({ type: 'SET_SAVING', saving: true });
    try {
      if (q.id) await onDeleteQuestion(q.id);
      dispatch({ type: 'DELETE_QUESTION', index: editingIndex });
    } finally {
      dispatch({ type: 'SET_SAVING', saving: false });
    }
  }, [state, onDeleteQuestion, pgnLocked]);

  const editingQuestion =
    state.editingIndex !== null ? state.questions[state.editingIndex] : null;

  const [copied, setCopied] = useState(false);

  function copyLink() {
    navigator.clipboard.writeText(studentLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {pgnLocked && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-800">
          This assignment has been opened by the student. PGN and new positions are
          locked, but existing questions can be updated for self-review. Status:{' '}
          <strong>{STATUS_LABEL[assignment.status]}</strong>
        </div>
      )}

      {batchLabel && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-sm text-blue-800">
          Group assignment: changes to PGN and questions sync to unopened copies for{' '}
          <strong>{batchLabel}</strong>.
        </div>
      )}

      <div className="border-b border-stone-200 bg-white px-4 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Badge variant={STATUS_VARIANT[assignment.status]}>
            {STATUS_LABEL[assignment.status]}
          </Badge>
          <span className="text-sm text-stone-500">
            {state.questions.length} question{state.questions.length !== 1 ? 's' : ''}
            {state.questions.length === 0 && !pgnLocked && (
              <span className="ml-1 text-stone-400">- min 1 to send</span>
            )}
          </span>
        </div>
        <button
          onClick={copyLink}
          data-testid="copy-student-link"
          data-student-link={studentLink}
          className="text-sm text-amber-600 hover:text-amber-800 border border-amber-300 rounded px-3 py-1.5 transition-colors"
        >
          {copied ? 'Copied!' : 'Copy student link'}
        </button>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="w-56 shrink-0 border-r border-stone-200 bg-white flex flex-col overflow-y-auto p-4 gap-3">
          <PgnPanel
            state={state}
            dispatch={dispatch}
            onPgnSave={onSavePgn}
            readOnly={pgnLocked}
          />
        </div>

        <div className="flex-1 flex items-start justify-center p-4 overflow-auto bg-stone-50">
          <BoardPanel
            state={state}
            dispatch={dispatch}
            canAddQuestion={!pgnLocked}
          />
        </div>

        <div className="w-72 shrink-0 border-l border-stone-200 bg-white flex flex-col overflow-y-auto p-4 gap-4">
          {editingQuestion ? (
            <QuestionEditor
              question={editingQuestion}
              index={state.editingIndex!}
              saving={state.saving}
              readOnly={readOnly}
              canDelete={!pgnLocked}
              onSave={handleSaveQuestion}
              onDelete={handleDeleteQuestion}
              dispatch={dispatch}
            />
          ) : (
            <div className="text-sm text-stone-400 text-center py-8">
              {state.plies.length === 0
                ? 'Paste a PGN and select a move to create a question.'
                : pgnLocked
                  ? 'Select a saved question to update its self-review details.'
                  : 'Select a move and click "Add question" or press Q.'}
            </div>
          )}

          <QuestionList
            questions={state.questions}
            editingIndex={state.editingIndex}
            readOnly={readOnly}
            onEdit={(i) => dispatch({ type: 'EDIT_QUESTION', index: i })}
          />
        </div>
      </div>
    </div>
  );
}
