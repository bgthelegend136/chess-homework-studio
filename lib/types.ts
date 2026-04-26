export type AssignmentStatus = 'not_opened' | 'in_progress' | 'submitted' | 'reviewed';

export type QuestionTag =
  | 'Opening'
  | 'Attack'
  | 'Defense'
  | 'Calculation'
  | 'Endgame'
  | 'Strategy'
  | 'Middlegame';

export type CalculationDepth = 'none' | 'short' | 'long';

export interface Student {
  id: string;
  coach_id: string;
  name: string;
  email: string | null;
  notes: string | null;
  created_at: string;
}

export interface StudentGroup {
  id: string;
  coach_id: string;
  name: string;
  created_at: string;
}

export interface StudentGroupMember {
  group_id: string;
  student_id: string;
}

export interface StudentGroupWithCount extends StudentGroup {
  student_count: number;
}

export interface Assignment {
  id: string;
  coach_id: string;
  student_id: string;
  batch_id: string | null;
  title: string;
  pgn: string;
  status: AssignmentStatus;
  due_date: string | null;
  student_token: string;
  overall_feedback: string | null;
  grade: string | null;
  created_at: string;
  first_opened_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  source_assignment_id: string | null;
}

export interface AssignmentWithStudent extends Assignment {
  students: Pick<Student, 'id' | 'name' | 'email'>;
}

export interface AssignmentBatch {
  id: string;
  coach_id: string;
  group_id: string | null;
  title: string;
  due_date: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  coach_id: string;
  assignment_id: string | null;
  type: 'assignment_submitted' | string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export type OpeningSide = 'white' | 'black';
export type OpeningMasteryLevel = 'new' | 'learning' | 'weak' | 'mastered';
export type OpeningAnnotation = '!' | '!!';

export interface OpeningRepertoire {
  id: string;
  coach_id: string;
  name: string;
  side_to_train: OpeningSide;
  pgn: string;
  import_report: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface OpeningPosition {
  id: string;
  repertoire_id: string;
  fen: string;
  expected_move_san: string;
  expected_move_uci: string;
  parent_position_id: string | null;
  line_path: string;
  ply_index: number;
  opponent_move_san: string | null;
  opponent_move_uci: string | null;
  is_mainline: boolean;
  annotation: OpeningAnnotation | null;
  comment: string | null;
  priority_weight: number;
  created_at: string;
}

export interface OpeningAttempt {
  id: string;
  repertoire_id: string;
  position_id: string;
  coach_id: string;
  attempted_move: string;
  was_correct: boolean;
  created_at: string;
}

export interface OpeningPositionProgress {
  id: string;
  coach_id: string;
  repertoire_id: string;
  position_id: string;
  times_seen: number;
  correct_count: number;
  wrong_count: number;
  current_streak: number;
  mastery_level: OpeningMasteryLevel;
  last_seen_at: string | null;
  priority_score: number;
  created_at: string;
  updated_at: string;
}

export interface Question {
  id: string;
  assignment_id: string;
  order_index: number;
  fen: string;
  side_to_move: 'w' | 'b';
  move_number: number;
  prompt: string;
  coach_reference_answer: string | null;
  coach_explanation: string | null;
  hint: string | null;
  coach_notes: string | null;
  tags: string[];
  calculation_depth: CalculationDepth;
}

export type Evaluation =
  | 'blunder'
  | 'mistake'
  | 'dubious'
  | 'interesting'
  | 'correct';

export interface Answer {
  id: string;
  question_id: string;
  student_move: string | null;
  explanation: string | null;
  feedback: string | null;
  evaluation: Evaluation | null;
  is_correct: boolean | null;
  hint_used: boolean;
  attempt_count: number;
  created_at: string;
  updated_at: string;
}

export interface QuestionWithAnswer extends Question {
  answers: Answer | null;
}
