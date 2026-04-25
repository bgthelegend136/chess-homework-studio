'use client';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import type { DraftQuestion, CreatorAction } from '@/creator-state/reducer';
import {
  CALCULATION_DEPTH_LABEL,
  CALCULATION_DEPTH_OPTIONS,
  QUESTION_TAGS,
} from '@/lib/assignments/labels';
import type { CalculationDepth } from '@/lib/types';

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

interface QuestionEditorProps {
  question: DraftQuestion;
  index: number;
  saving: boolean;
  readOnly: boolean;
  canDelete: boolean;
  onSave: () => void;
  onDelete: () => void;
  dispatch: React.Dispatch<CreatorAction>;
}

export function QuestionEditor({
  question,
  index,
  saving,
  readOnly,
  canDelete,
  onSave,
  onDelete,
  dispatch,
}: QuestionEditorProps) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [listening, setListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const sideLabel = question.side_to_move === 'b' ? 'Black' : 'White';
  const positionLabel =
    question.side_to_move === 'b'
      ? `${question.move_number}...`
      : `${question.move_number}.`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-stone-500 uppercase tracking-wide">
            {readOnly ? 'Question' : `Editing Q${index + 1}`}
          </p>
          <p className="text-xs text-stone-400">
            position after {positionLabel} - {sideLabel} to move
          </p>
        </div>
        {!readOnly && (
          <button
            onClick={() => dispatch({ type: 'CLEAR_EDITING' })}
            className="text-xs text-stone-400 hover:text-stone-600"
            title="Close editor"
          >
            x
          </button>
        )}
      </div>

      <Textarea
        id={`prompt-${index}`}
        label="Prompt for student"
        value={question.prompt}
        onChange={(e) =>
          dispatch({ type: 'UPDATE_EDITING', patch: { prompt: e.target.value } })
        }
        rows={3}
        placeholder="What is the best plan for Black here?"
        disabled={readOnly}
      />

      <Textarea
        id={`ref-${index}`}
        label="Accepted move(s)"
        hint="Drag the correct move on the board to add SAN notation, or edit the list manually."
        value={question.coach_reference_answer}
        onChange={(e) =>
          dispatch({
            type: 'UPDATE_EDITING',
            patch: { coach_reference_answer: e.target.value },
          })
        }
        rows={2}
        placeholder="Nxd3, Qg4"
        disabled={readOnly}
      />

      <Textarea
        id={`explanation-${index}`}
        label="Coach explanation / thinking"
        hint="Shown to the student after they check their answer."
        value={question.coach_explanation}
        onChange={(e) =>
          dispatch({
            type: 'UPDATE_EDITING',
            patch: { coach_explanation: e.target.value },
          })
        }
        rows={3}
        placeholder="Explain the idea, candidate moves, and what the student should notice."
        disabled={readOnly}
      />
      {!readOnly && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={listening ? 'danger' : 'secondary'}
              onClick={() => {
                const SpeechRecognitionApi =
                  window.SpeechRecognition ?? window.webkitSpeechRecognition;

                if (!SpeechRecognitionApi) {
                  setSpeechError('Voice typing is not supported in this browser.');
                  return;
                }

                if (listening) {
                  recognitionRef.current?.stop();
                  return;
                }

                const recognition = new SpeechRecognitionApi();
                recognitionRef.current = recognition;
                recognition.continuous = true;
                recognition.interimResults = false;
                recognition.lang = 'en-US';
                recognition.onresult = (event) => {
                  const transcript = Array.from(event.results)
                    .slice(event.resultIndex)
                    .map((result) => result[0]?.transcript ?? '')
                    .join(' ')
                    .trim();
                  if (!transcript) return;

                  const nextValue = question.coach_explanation.trim()
                    ? `${question.coach_explanation.trim()} ${transcript}`
                    : transcript;
                  dispatch({
                    type: 'UPDATE_EDITING',
                    patch: { coach_explanation: nextValue },
                  });
                };
                recognition.onerror = (event) => {
                  setSpeechError(`Voice typing stopped: ${event.error}`);
                  setListening(false);
                };
                recognition.onend = () => setListening(false);
                setSpeechError(null);
                setListening(true);
                recognition.start();
              }}
            >
              {listening ? 'Stop voice typing' : 'Mic voice typing'}
            </Button>
            <span className="text-xs text-stone-400">
              Dictates into coach explanation.
            </span>
          </div>
          {speechError && <p className="text-xs text-red-600">{speechError}</p>}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
          Tags
        </p>
        <div className="flex flex-wrap gap-1.5">
          {QUESTION_TAGS.map((tag) => {
            const active = question.tags.includes(tag);
            return (
              <button
                type="button"
                key={tag}
                onClick={() => {
                  if (readOnly) return;
                  const tags = active
                    ? question.tags.filter((item) => item !== tag)
                    : [...question.tags, tag];
                  dispatch({ type: 'UPDATE_EDITING', patch: { tags } });
                }}
                disabled={readOnly}
                className={`rounded border px-2.5 py-1 text-xs transition-colors ${
                  active
                    ? 'border-amber-300 bg-amber-100 text-amber-900'
                    : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                } disabled:cursor-not-allowed disabled:opacity-70`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor={`depth-${index}`}
          className="text-xs font-medium uppercase tracking-wide text-stone-500"
        >
          Calculation depth
        </label>
        <select
          id={`depth-${index}`}
          value={question.calculation_depth}
          onChange={(e) =>
            dispatch({
              type: 'UPDATE_EDITING',
              patch: {
                calculation_depth: e.target.value as CalculationDepth,
              },
            })
          }
          disabled={readOnly}
          className="rounded border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:bg-stone-50"
        >
          {CALCULATION_DEPTH_OPTIONS.map((depth) => (
            <option key={depth} value={depth}>
              {CALCULATION_DEPTH_LABEL[depth]}
            </option>
          ))}
        </select>
      </div>

      <div className="text-xs text-stone-400 flex gap-3">
        <span className="bg-stone-100 px-2 py-1 rounded">move</span>
        <span className="bg-stone-100 px-2 py-1 rounded">short explanation</span>
        <span className="text-stone-300">student will provide</span>
      </div>

      {!readOnly && (
        <div className="flex gap-2 pt-1">
          <Button
            variant="primary"
            onClick={onSave}
            disabled={saving || !question.prompt.trim()}
          >
            {saving ? 'Saving...' : question.id ? 'Update question' : 'Save question'}
          </Button>
          {canDelete && (
            <Button
              variant="danger"
              onClick={() => setConfirmingDelete(true)}
              disabled={saving}
            >
              Delete
            </Button>
          )}
        </div>
      )}

      {confirmingDelete && (
        <div className="rounded border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-medium text-red-900">Delete this question?</p>
          <p className="mt-1 text-xs text-red-700">
            This removes the question and any saved student answer for it.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setConfirmingDelete(false);
                onDelete();
              }}
              disabled={saving}
            >
              Delete question
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmingDelete(false)}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
