import OpenAI from 'openai';
import { TaskInterpretation, TaskInterpretationSchema, PlanOutput, PlanOutputSchema } from '../types';
import { listTools } from './tools';

export function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey.includes('your_openrouter_api_key')) {
    return null;
  }
  return new OpenAI({
    apiKey: apiKey,
    baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': 'https://centralign.ai',
      'X-Title': 'CentrAlign OperatorOS',
    }
  });
}

export function getModelName(): string {
  return process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';
}

/**
 * Task Interpreter: Converts raw prompt into structured goal, task type, constraints, criteria.
 */
export async function interpretTask(userPrompt: string): Promise<TaskInterpretation> {
  const client = getOpenAIClient();

  if (client) {
    try {
      const response = await client.chat.completions.create({
        model: getModelName(),
        messages: [
          {
            role: 'system',
            content: `You are the Task Interpreter for OperatorOS, an autonomous enterprise AI employee.
Analyze the user's business request and extract structured goals, task type, constraints, and completion criteria.
Always output pure JSON adhering to this schema:
{
  "goal": string,
  "vendor": string | optional,
  "taskType": "invoice_processing" | "policy_inquiry" | "vendor_comparison" | "report_generation" | "general",
  "targetFiles": string[],
  "constraints": string[],
  "completionCriteria": string[]
}`
          },
          {
            role: 'user',
            content: `Request: "${userPrompt}"`
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content);
        return TaskInterpretationSchema.parse(parsed);
      }
    } catch (err) {
      console.warn("OpenRouter interpretation failed, falling back to deterministic interpreter:", err);
    }
  }

  // Deterministic interpreter fallback
  const lower = userPrompt.toLowerCase();
  let vendor: string | undefined = undefined;
  let taskType: 'invoice_processing' | 'policy_inquiry' | 'vendor_comparison' | 'report_generation' | 'general' = 'general';
  let targetFiles: string[] = [];

  if (lower.includes('invoice') || lower.includes('bill') || lower.includes('record in finance')) {
    taskType = 'invoice_processing';
    if (lower.includes('acme')) {
      vendor = 'Acme Supplies';
      targetFiles = ['acme_supplies_inv_10588_mar.txt'];
    } else if (lower.includes('beta')) {
      vendor = 'Beta Technologies';
      targetFiles = ['beta_tech_inv_9100.txt'];
    }
  } else if (lower.includes('handbook') || lower.includes('policy') || lower.includes('leave') || lower.includes('vacation')) {
    taskType = 'policy_inquiry';
    targetFiles = ['employee_handbook_2025.md'];
  } else if (lower.includes('compare') || lower.includes('contract') || lower.includes('terms')) {
    taskType = 'vendor_comparison';
    targetFiles = ['vendor_contract_acme_corp.md', 'vendor_contract_beta_technologies.md'];
  } else if (lower.includes('csv') || lower.includes('report') || lower.includes('next 30 days') || lower.includes('due within')) {
    taskType = 'report_generation';
    targetFiles = ['upcoming_payables_q1.csv'];
  }

  const constraints: string[] = [
    'Enforce server-side file permissions on every document access',
    'Do not inspect or leak contents of permission-denied files',
    'Verify persistence and document parity independently before claiming completion',
    'Do not create duplicate finance records',
    'Require approval or halt on missing or ambiguous financial parameters',
  ];

  let goal = '';
  let completionCriteria: string[] = [];

  if (taskType === 'invoice_processing') {
    goal = `Locate and record invoice for ${vendor || 'target vendor'} into finance system with independent verification`;
    completionCriteria = [
      'Locate permitted invoice document in workspace',
      'Extract invoice number, total amount, and due date',
      'Check existing finance records to prevent duplicate creation',
      'Persist verified record into finance ledger',
      'Independently read back and assert field parity',
    ];
  } else if (taskType === 'policy_inquiry') {
    goal = 'Examine permitted employee handbook and extract verified annual leave policy details';
    completionCriteria = [
      'Confirm read permission for employee handbook document',
      'Extract annual leave entitlements and rollover rules',
      'Cite exact source filename and document section',
    ];
  } else if (taskType === 'vendor_comparison') {
    goal = 'Compare permitted vendor contracts and summarize differences in payment terms';
    completionCriteria = [
      'Confirm read and context permissions for all target contracts',
      'Extract payment terms, penalties, discounts, and payment methods',
      'Synthesize differences with source citations',
    ];
  } else if (taskType === 'report_generation') {
    goal = 'Query permitted payables records and synthesize 30-day obligations report';
    completionCriteria = [
      'Read permitted payables CSV or invoice records',
      'Filter for upcoming commitments',
      'Verify results against workspace records',
    ];
  } else {
    goal = `Execute enterprise task: ${userPrompt}`;
    completionCriteria = ['Execute permitted workspace tools', 'Verify outcome against criteria'];
  }

  return {
    goal,
    vendor,
    taskType,
    targetFiles,
    constraints,
    completionCriteria,
  };
}

/**
 * Planner: Produces an ordered sequence of typed actions with expected outcomes.
 */
export async function generatePlan(
  userPrompt: string,
  interpretation: TaskInterpretation,
  options?: { forceVerificationMismatch?: boolean; forceApprovalPrompt?: string; targetFilename?: string }
): Promise<PlanOutput> {
  const client = getOpenAIClient();
  const availableTools = listTools();

  if (client) {
    try {
      const response = await client.chat.completions.create({
        model: getModelName(),
        messages: [
          {
            role: 'system',
            content: `You are the Action Planner for OperatorOS.
Generate a strictly sequential list of executable tool actions.
Available tools:
${JSON.stringify(availableTools, null, 2)}

Rules:
1. Always start by checking permitted files with 'search_permitted_files' or 'list_permitted_files'.
2. For reading documents, call 'read_permitted_file'.
3. For structured extraction, use 'extract_document_fields'.
4. For finance tasks, call 'lookup_finance_record', then 'create_finance_record', then 'verify_finance_record'.
Output JSON only adhering to this schema:
{
  "thoughtProcess": string,
  "actions": [
    {
      "stepNumber": number,
      "toolName": string,
      "parameters": object,
      "expectedOutcome": string
    }
  ]
}`
          },
          {
            role: 'user',
            content: `Task Goal: ${interpretation.goal}\nVendor: ${interpretation.vendor || 'N/A'}\nTaskType: ${interpretation.taskType}\nUser Prompt: ${userPrompt}`
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content);
        return PlanOutputSchema.parse(parsed);
      }
    } catch (err) {
      console.warn("OpenRouter planner failed, using deterministic planner engine:", err);
    }
  }

  // Deterministic Plan Generation Engine
  const vendor = interpretation.vendor || 'Acme Supplies';

  if (interpretation.taskType === 'policy_inquiry') {
    return {
      thoughtProcess: 'To address employee policy inquiry, search permitted files for handbook, read document with permission check, and extract leave rules.',
      actions: [
        {
          stepNumber: 1,
          toolName: 'search_permitted_files',
          parameters: { query: 'handbook' },
          expectedOutcome: 'Locate permitted employee handbook in workspace',
        },
        {
          stepNumber: 2,
          toolName: 'read_permitted_file',
          parameters: { filename: options?.targetFilename || 'employee_handbook_2025.md' },
          expectedOutcome: 'Read employee handbook content after server-side read permission check',
        },
        {
          stepNumber: 3,
          toolName: 'extract_document_fields',
          parameters: { filename: options?.targetFilename || 'employee_handbook_2025.md', schemaType: 'policy' },
          expectedOutcome: 'Extract annual leave entitlements and section citations',
        }
      ]
    };
  }

  if (interpretation.taskType === 'vendor_comparison') {
    return {
      thoughtProcess: 'Compare vendor contracts by reading Acme and Beta agreements with permission enforcement and contrasting payment terms.',
      actions: [
        {
          stepNumber: 1,
          toolName: 'search_permitted_files',
          parameters: { query: 'contract' },
          expectedOutcome: 'Locate permitted vendor contracts in workspace',
        },
        {
          stepNumber: 2,
          toolName: 'read_permitted_file',
          parameters: { filename: 'vendor_contract_acme_corp.md' },
          expectedOutcome: 'Inspect Acme Supplies master services agreement terms',
        },
        {
          stepNumber: 3,
          toolName: 'read_permitted_file',
          parameters: { filename: 'vendor_contract_beta_technologies.md' },
          expectedOutcome: 'Inspect Beta Technologies master services agreement terms',
        },
        {
          stepNumber: 4,
          toolName: 'extract_document_fields',
          parameters: { filename: 'vendor_contract_acme_corp.md', schemaType: 'contract' },
          expectedOutcome: 'Extract Acme payment terms',
        },
        {
          stepNumber: 5,
          toolName: 'extract_document_fields',
          parameters: { filename: 'vendor_contract_beta_technologies.md', schemaType: 'contract' },
          expectedOutcome: 'Extract Beta payment terms and produce comparison table',
        }
      ]
    };
  }

  if (interpretation.taskType === 'report_generation') {
    return {
      thoughtProcess: 'Examine payables CSV to determine upcoming liabilities within the 30-day window.',
      actions: [
        {
          stepNumber: 1,
          toolName: 'search_permitted_files',
          parameters: { query: 'payables' },
          expectedOutcome: 'Locate payables ledger in workspace',
        },
        {
          stepNumber: 2,
          toolName: 'read_permitted_file',
          parameters: { filename: 'upcoming_payables_q1.csv' },
          expectedOutcome: 'Read payables CSV line items',
        }
      ]
    };
  }

  // Standard invoice flow (with backward compatibility)
  const isBeta = vendor.includes('Beta');
  const targetInvoiceFile = isBeta ? 'beta_tech_inv_9100.txt' : 'acme_supplies_inv_10588_mar.txt';
  const targetInvNumber = isBeta ? 'BETA-9100' : 'INV-10588';
  const targetAmount = isBeta ? 7200.00 : 3200.50;
  const targetDueDate = isBeta ? '2025-04-15' : '2025-03-31';
  const targetInvDate = isBeta ? '2025-03-15' : '2025-03-01';

  return {
    thoughtProcess: `Process latest invoice for ${vendor} by searching permitted files, extracting document fields, checking duplicate record status, creating SQLite finance entry, and verifying parity.`,
    actions: [
      {
        stepNumber: 1,
        toolName: 'search_invoices',
        parameters: { vendor, sortBy: 'date_desc', limit: 5 },
        expectedOutcome: `Find the most recent invoice issued by ${vendor}`,
      },
      {
        stepNumber: 2,
        toolName: 'read_invoice',
        parameters: { invoiceId: isBeta ? 'inv-beta-002' : 'inv-acme-002' },
        expectedOutcome: 'Extract invoice number, total amount, due date, and line items',
      },
      {
        stepNumber: 3,
        toolName: 'lookup_finance_record',
        parameters: { invoiceNumber: targetInvNumber },
        expectedOutcome: 'Ensure invoice has not already been processed (prevent duplicates)',
      },
      {
        stepNumber: 4,
        toolName: 'create_finance_record',
        parameters: {
          invoiceNumber: targetInvNumber,
          vendorName: vendor,
          amount: targetAmount,
          currency: 'USD',
          dueDate: targetDueDate,
          invoiceDate: targetInvDate,
          sourceFile: targetInvoiceFile,
        },
        expectedOutcome: 'Create new immutable record in SQLite finance system',
      },
      {
        stepNumber: 5,
        toolName: 'verify_finance_record',
        parameters: {
          recordId: 'DYNAMIC_RECORD_ID',
          expectedInvoiceNumber: targetInvNumber,
          expectedAmount: options?.forceVerificationMismatch ? 99999.99 : targetAmount,
          expectedDueDate: targetDueDate,
          expectedVendor: vendor,
        },
        expectedOutcome: 'Independently read back persisted SQLite finance record and confirm field parity',
      }
    ],
  };
}
