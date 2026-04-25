import type { AssignmentStatus, CalculationDepth, QuestionTag } from '@/lib/types';

export const STATUS_LABEL: Record<AssignmentStatus, string> = {
  not_opened: 'Not opened',
  in_progress: 'In progress',
  submitted: 'Completed',
  reviewed: 'Completed',
};

export const STATUS_VARIANT: Record<
  AssignmentStatus,
  'default' | 'muted' | 'info' | 'warning' | 'success'
> = {
  not_opened: 'muted',
  in_progress: 'info',
  submitted: 'success',
  reviewed: 'success',
};

export const QUESTION_TAGS = [
  'Opening',
  'Attack',
  'Defense',
  'Calculation',
  'Endgame',
  'Strategy',
  'Middlegame',
] as const satisfies readonly QuestionTag[];

export const CALCULATION_DEPTH_OPTIONS = [
  'none',
  'short',
  'long',
] as const satisfies readonly CalculationDepth[];

export const CALCULATION_DEPTH_LABEL: Record<CalculationDepth, string> = {
  none: 'None',
  short: 'Short',
  long: 'Long',
};

export const EVALUATION_OPTIONS = [
  'blunder',
  'mistake',
  'dubious',
  'interesting',
  'correct',
] as const;

export type Evaluation = (typeof EVALUATION_OPTIONS)[number];

export const EVALUATION_LABEL: Record<Evaluation, string> = {
  blunder: 'Blunder',
  mistake: 'Mistake',
  dubious: 'Dubious',
  interesting: 'Interesting',
  correct: 'Correct',
};

// Tailwind classes — kept stable so JIT doesn't purge them.
export const EVALUATION_CLASSES: Record<Evaluation, string> = {
  blunder: 'bg-red-100 text-red-800 border-red-200',
  mistake: 'bg-orange-100 text-orange-800 border-orange-200',
  dubious: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  interesting: 'bg-blue-100 text-blue-800 border-blue-200',
  correct: 'bg-green-100 text-green-800 border-green-200',
};
