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
  created_at: string;
  updated_at: string;
}

export interface QuestionWithAnswer extends Question {
  answers: Answer | null;
}
