import { z } from 'zod';

export type TaskStatus = 
  | 'pending'
  | 'interpreting'
  | 'planning'
  | 'executing'
  | 'paused_approval'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'needs_review';

export interface WorkspaceRecord {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export type PermissionAction = 'read' | 'extract' | 'context' | 'modify' | 'export';

export interface FilePermissions {
  read: boolean;
  extract: boolean;
  context: boolean;
  modify: boolean;
  export: boolean;
}

export interface WorkspaceFileRecord {
  id: string;
  workspaceId: string;
  filename: string;
  relativePath: string;
  fileType: string;
  fileSize: number;
  extractedText: string;
  ingestionStatus: 'ready' | 'processing' | 'failed';
  ingestionError?: string | null;
  uploadedAt: string;
  permissions: FilePermissions;
}

export interface TaskRecord {
  id: string;
  workspaceId: string;
  userPrompt: string;
  status: TaskStatus;
  goal: string;
  constraints: string[];
  completionCriteria: string[];
  createdAt: string;
  updatedAt: string;
  error?: string | null;
  summary?: string | null;
}

export type ActionStatus = 
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'retrying'
  | 'skipped';

export interface PlannedAction {
  id: string;
  taskId: string;
  stepNumber: number;
  toolName: string;
  parameters: Record<string, unknown>;
  expectedOutcome: string;
  status: ActionStatus;
  retryCount: number;
  maxRetries: number;
  output?: Record<string, unknown> | null;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinanceRecord {
  id: string;
  invoiceNumber: string;
  vendorName: string;
  amount: number;
  currency: string;
  dueDate: string;
  invoiceDate: string;
  sourceFile: string;
  taskId: string;
  createdAt: string;
  status: 'recorded' | 'verified' | 'disputed';
}

export interface InvoiceSeed {
  id: string;
  filename: string;
  vendor: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  date: string;
  dueDate: string;
  rawText: string;
  status: 'valid' | 'missing_due_date' | 'duplicate_candidate' | 'ambiguous';
}

export interface ExecutionLog {
  id: string;
  taskId: string;
  actionId?: string | null;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'verify' | 'approval';
  phase: 'interpret' | 'plan' | 'execute' | 'recover' | 'verify' | 'report' | 'approval';
  message: string;
  metadata?: Record<string, unknown> | null;
}

export interface ApprovalRequest {
  id: string;
  taskId: string;
  actionId: string;
  toolName: string;
  parameters: Record<string, unknown>;
  prompt: string;
  status: 'pending' | 'approved' | 'rejected';
  reason?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
}

export interface VerificationResult {
  verified: boolean;
  fieldMatches: {
    field: string;
    sourceValue: unknown;
    persistedValue: unknown;
    matched: boolean;
  }[];
  notes: string;
}

// Zod schemas for structured LLM planner / interpreter outputs
export const TaskInterpretationSchema = z.object({
  goal: z.string().describe("Clear high-level business goal"),
  vendor: z.string().optional().describe("Target vendor if specified"),
  taskType: z.enum(['invoice_processing', 'policy_inquiry', 'vendor_comparison', 'report_generation', 'general']).default('general'),
  targetFiles: z.array(z.string()).optional().describe("Filenames or topics identified"),
  constraints: z.array(z.string()).describe("Operational or safety constraints"),
  completionCriteria: z.array(z.string()).describe("Observable criteria that define successful completion"),
});

export type TaskInterpretation = z.infer<typeof TaskInterpretationSchema>;

export const PlannedActionSchema = z.object({
  stepNumber: z.number(),
  toolName: z.string(),
  parameters: z.record(z.string(), z.unknown()),
  expectedOutcome: z.string(),
});

export const PlanOutputSchema = z.object({
  thoughtProcess: z.string().describe("Rationale for this sequence of tools"),
  actions: z.array(PlannedActionSchema),
});

export type PlanOutput = z.infer<typeof PlanOutputSchema>;
