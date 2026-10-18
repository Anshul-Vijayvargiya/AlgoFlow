import { Schema, model, Document } from 'mongoose';

export interface IProblemTestCase {
  input: string;
  expected: string;
  isHidden?: boolean;
}

export interface IProblemExample {
  input: string;
  output: string;
  explanation?: string;
}

export interface IProblem extends Document {
  problemId: string;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  category: string;
  tags: string[];
  description: string;
  constraints: string[];
  examples: IProblemExample[];
  starterCode: {
    cpp: string;
    c: string;
    java: string;
    python: string;
  };
  testCases: IProblemTestCase[];
  publicationStatus: 'published' | 'draft' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

const ProblemSchema = new Schema<IProblem>(
  {
    problemId: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], required: true, index: true },
    category: { type: String, required: true, trim: true, index: true },
    tags: [{ type: String, trim: true }],
    description: { type: String, required: true },
    constraints: [{ type: String }],
    examples: [
      {
        input: { type: String, required: true },
        output: { type: String, required: true },
        explanation: { type: String },
      },
    ],
    starterCode: {
      cpp: { type: String, default: '' },
      c: { type: String, default: '' },
      java: { type: String, default: '' },
      python: { type: String, default: '' },
    },
    testCases: [
      {
        input: { type: String, required: true },
        expected: { type: String, required: true },
        isHidden: { type: Boolean, default: false },
      },
    ],
    publicationStatus: {
      type: String,
      enum: ['published', 'draft', 'archived'],
      default: 'published',
      index: true,
    },
  },
  { timestamps: true }
);

ProblemSchema.index({ category: 1, difficulty: 1 });
ProblemSchema.index({ publicationStatus: 1, createdAt: -1 });

export const Problem = model<IProblem>('Problem', ProblemSchema);

