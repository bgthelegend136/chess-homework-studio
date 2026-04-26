import type { Ply } from '@/lib/chess/parsePgn';
import type { CalculationDepth } from '@/lib/types';
import { sideToMoveFromFen } from '@/lib/chess/parsePgn';

export interface DraftQuestion {
  id?: string;
  order_index: number;
  fen: string;
  side_to_move: 'w' | 'b';
  move_number: number;
  prompt: string;
  coach_reference_answer: string;
  coach_explanation: string;
  hint: string;
  coach_notes: string;
  tags: string[];
  calculation_depth: CalculationDepth;
  dirty: boolean;
}

export interface CreatorState {
  pgn: string;
  parseError: string | null;
  plies: Ply[];
  startFen: string;
  selectedPlyIndex: number; // -1 = start position
  questions: DraftQuestion[];
  editingIndex: number | null;
  readOnly: boolean;
  saving: boolean;
}

export type CreatorAction =
  | { type: 'PGN_PARSED'; pgn: string; plies: Ply[]; startFen: string }
  | { type: 'PGN_PARSE_ERROR'; pgn: string; error: string }
  | { type: 'SELECT_PLY'; index: number }
  | { type: 'ADD_QUESTION_FROM_SELECTED' }
  | { type: 'EDIT_QUESTION'; index: number }
  | {
      type: 'UPDATE_EDITING';
      patch: Partial<
        Pick<
          DraftQuestion,
          | 'prompt'
          | 'coach_reference_answer'
          | 'coach_explanation'
          | 'hint'
          | 'coach_notes'
          | 'tags'
          | 'calculation_depth'
        >
      >;
    }
  | { type: 'SAVE_QUESTION_DONE'; index: number; id: string }
  | { type: 'DELETE_QUESTION'; index: number }
  | { type: 'LOAD'; questions: DraftQuestion[] }
  | { type: 'SET_SAVING'; saving: boolean }
  | { type: 'CLEAR_EDITING' };

const MUTATING_ACTIONS = new Set([
  'ADD_QUESTION_FROM_SELECTED',
  'UPDATE_EDITING',
  'DELETE_QUESTION',
]);

export function creatorReducer(
  state: CreatorState,
  action: CreatorAction,
): CreatorState {
  if (state.readOnly && MUTATING_ACTIONS.has(action.type)) return state;

  switch (action.type) {
    case 'PGN_PARSED':
      return {
        ...state,
        pgn: action.pgn,
        parseError: null,
        plies: action.plies,
        startFen: action.startFen,
        selectedPlyIndex: action.plies.length - 1,
      };

    case 'PGN_PARSE_ERROR':
      return {
        ...state,
        pgn: action.pgn,
        parseError: action.error,
        plies: [],
      };

    case 'SELECT_PLY':
      return { ...state, selectedPlyIndex: action.index };

    case 'ADD_QUESTION_FROM_SELECTED': {
      const fen =
        state.selectedPlyIndex === -1
          ? state.startFen
          : state.plies[state.selectedPlyIndex]?.fen;
      if (!fen) return state;
      const moveNumber =
        state.selectedPlyIndex === -1
          ? 1
          : state.plies[state.selectedPlyIndex].moveNumber;
      // Avoid duplicate question for same position
      if (state.questions.some((q) => q.fen === fen)) {
        const idx = state.questions.findIndex((q) => q.fen === fen);
        return { ...state, editingIndex: idx };
      }
      const newQuestion: DraftQuestion = {
        order_index: state.questions.length,
        fen,
        side_to_move: sideToMoveFromFen(fen),
        move_number: moveNumber,
        prompt: '',
        coach_reference_answer: '',
        coach_explanation: '',
        hint: '',
        coach_notes: '',
        tags: [],
        calculation_depth: 'none',
        dirty: true,
      };
      const questions = [...state.questions, newQuestion];
      return { ...state, questions, editingIndex: questions.length - 1 };
    }

    case 'EDIT_QUESTION':
      return { ...state, editingIndex: action.index };

    case 'UPDATE_EDITING': {
      if (state.editingIndex === null) return state;
      const questions = state.questions.map((q, i) =>
        i === state.editingIndex ? { ...q, ...action.patch, dirty: true } : q,
      );
      return { ...state, questions };
    }

    case 'SAVE_QUESTION_DONE': {
      const questions = state.questions.map((q, i) =>
        i === action.index ? { ...q, id: action.id, dirty: false } : q,
      );
      return { ...state, questions, editingIndex: null };
    }

    case 'DELETE_QUESTION': {
      const questions = state.questions
        .filter((_, i) => i !== action.index)
        .map((q, i) => ({ ...q, order_index: i }));
      const nextEditingIndex =
        state.editingIndex === action.index
          ? null
          : state.editingIndex === null
            ? null
            : state.editingIndex > action.index
              ? state.editingIndex - 1
              : state.editingIndex >= questions.length
                ? questions.length > 0
                  ? questions.length - 1
                  : null
                : state.editingIndex;
      return {
        ...state,
        questions,
        editingIndex: nextEditingIndex,
      };
    }

    case 'LOAD':
      return { ...state, questions: action.questions };

    case 'SET_SAVING':
      return { ...state, saving: action.saving };

    case 'CLEAR_EDITING':
      return { ...state, editingIndex: null };

    default:
      return state;
  }
}

export function initialCreatorState(readOnly: boolean): CreatorState {
  return {
    pgn: '',
    parseError: null,
    plies: [],
    startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    selectedPlyIndex: -1,
    questions: [],
    editingIndex: null,
    readOnly,
    saving: false,
  };
}
