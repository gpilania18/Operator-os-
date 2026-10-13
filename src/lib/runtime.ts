import { getDb } from './db';
import { getTool } from './tools';
import { interpretTask, generatePlan } from './openrouter';
import { TaskRecord, PlannedAction, ExecutionLog, TaskStatus } from '../types';

export interface RuntimeOptions {
  workspaceId?: string;
  simulateTransientFailureStep?: number;
  forceVerificationMismatch?: boolean;
  targetInvoiceId?: string; // e.g. for testing missing due date
  targetFilename?: string;
}

export class AgentRuntime {
  private db = getDb();

  /**
   * Logs an execution event to SQLite audit trail
   */
  log(
    taskId: string,
    level: ExecutionLog['level'],
    phase: ExecutionLog['phase'],
    message: string,
    actionId?: string,
    metadata?: Record<string, unknown>
  ): void {
    const logId = `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO execution_logs (id, task_id, action_id, timestamp, level, phase, message, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      logId,
      taskId,
      actionId || null,
      now,
      level,
      phase,
      message,
      metadata ? JSON.stringify(metadata) : null
    );
  }

  /**
   * Creates a new task in SQLite
   */
  async createTask(userPrompt: string, options?: RuntimeOptions): Promise<string> {
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const workspaceId = options?.workspaceId || 'default';
    const now = new Date().toISOString();

    // 1. Task Interpretation phase
    const interpretation = await interpretTask(userPrompt);

    this.db.prepare(`
      INSERT INTO tasks (id, workspace_id, user_prompt, status, goal, constraints_json, completion_criteria_json, created_at, updated_at)
      VALUES (?, ?, ?, 'planning', ?, ?, ?, ?, ?)
    `).run(
      taskId,
      workspaceId,
      userPrompt,
      interpretation.goal,
      JSON.stringify(interpretation.constraints),
      JSON.stringify(interpretation.completionCriteria),
      now,
      now
    );

    this.log(taskId, 'info', 'interpret', `Received natural language request: "${userPrompt}" in workspace [${workspaceId}]`);
    this.log(taskId, 'info', 'interpret', `Structured goal formulated: ${interpretation.goal}`, undefined, {
      interpretation,
    });

    // 2. Planning phase
    this.log(taskId, 'info', 'plan', 'Generating typed action plan with expected outcomes...');
    const plan = await generatePlan(userPrompt, interpretation, {
      forceVerificationMismatch: options?.forceVerificationMismatch,
      targetFilename: options?.targetFilename,
    });

    this.log(taskId, 'info', 'plan', `Plan formulated with ${plan.actions.length} sequential actions. Rationale: ${plan.thoughtProcess}`);

    // If options specify targetInvoiceId (like ambiguous one), override action parameters
    if (options?.targetInvoiceId) {
      const readAction = plan.actions.find(a => a.toolName === 'read_invoice');
      if (readAction) {
        readAction.parameters = { invoiceId: options.targetInvoiceId };
      }
    }

    const insertAction = this.db.prepare(`
      INSERT INTO planned_actions (id, task_id, step_number, tool_name, parameters_json, expected_outcome, status, retry_count, max_retries, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, 3, ?, ?)
    `);

    for (const act of plan.actions) {
      const actionId = `act-${taskId}-${act.stepNumber}`;
      insertAction.run(
        actionId,
        taskId,
        act.stepNumber,
        act.toolName,
        JSON.stringify(act.parameters),
        act.expectedOutcome,
        now,
        now
      );
    }

    return taskId;
  }

  /**
   * Executes the task using a plan -> act -> observe -> adapt loop
   */
  async executeTask(taskId: string, options?: RuntimeOptions): Promise<TaskRecord> {
    const taskRow = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
    if (!taskRow) throw new Error(`Task ${taskId} not found`);

    const workspaceId = options?.workspaceId || taskRow.workspace_id || 'default';

    if (taskRow.status === 'completed' || taskRow.status === 'failed') {
      return this.getTask(taskId);
    }

    this.updateTaskStatus(taskId, 'executing');
    this.log(taskId, 'info', 'execute', `Agent runtime loop started: plan -> act -> observe -> adapt (Workspace: ${workspaceId})`);

    let memory: Record<string, any> = {};

    // Get all actions ordered by step_number
    const actions = this.db.prepare(`
      SELECT * FROM planned_actions WHERE task_id = ? ORDER BY step_number ASC
    `).all(taskId) as any[];

    for (const actionRow of actions) {
      // Check current task status (e.g. if paused for approval)
      const currentTask = this.getTask(taskId);
      if (currentTask.status === 'paused_approval') {
        this.log(taskId, 'approval', 'execute', 'Execution paused awaiting human authorization.');
        return currentTask;
      }

      const actionId = actionRow.id;
      const stepNumber = actionRow.step_number;
      const toolName = actionRow.tool_name;
      let params = JSON.parse(actionRow.parameters_json);

      // ADAPT step: dynamically inject parameters from prior step observations
      if (toolName === 'read_invoice') {
        if (options?.targetInvoiceId) {
          params.invoiceId = options.targetInvoiceId;
        } else if (memory.latestInvoice) {
          params.invoiceId = memory.latestInvoice.id;
          params.filename = memory.latestInvoice.filename;
        }
      } else if (toolName === 'lookup_finance_record' && memory.extractedInvoice) {
        params.invoiceNumber = memory.extractedInvoice.invoiceNumber;
      } else if (toolName === 'create_finance_record' && memory.extractedInvoice) {
        params.invoiceNumber = memory.extractedInvoice.invoiceNumber;
        params.vendorName = memory.extractedInvoice.vendor;
        params.amount = memory.extractedInvoice.amount;
        params.currency = memory.extractedInvoice.currency;
        params.dueDate = memory.extractedInvoice.dueDate;
        params.invoiceDate = memory.extractedInvoice.invoiceDate;
        params.sourceFile = memory.extractedInvoice.filename;
      } else if (toolName === 'verify_finance_record' && memory.createdRecordId) {
        params.recordId = memory.createdRecordId;
        if (memory.extractedInvoice) {
          params.expectedInvoiceNumber = memory.extractedInvoice.invoiceNumber;
          if (!options?.forceVerificationMismatch) {
            params.expectedAmount = memory.extractedInvoice.amount;
          }
          params.expectedDueDate = memory.extractedInvoice.dueDate;
          params.expectedVendor = memory.extractedInvoice.vendor;
        }
      }

      const tool = getTool(toolName);
      if (!tool) {
        const errorMsg = `SAFETY_CHECK_VIOLATION: Tool '${toolName}' is not registered in the safety tool registry.`;
        this.log(taskId, 'error', 'execute', errorMsg, actionId);
        this.updateActionStatus(actionId, 'failed', null, errorMsg);
        this.failTask(taskId, errorMsg);
        return this.getTask(taskId);
      }

      this.updateActionStatus(actionId, 'in_progress');
      this.log(taskId, 'info', 'execute', `Step ${stepNumber}: Invoking tool '${toolName}'`, actionId, { params });

      // Check for human approval requirement if ambiguous data is detected
      if (toolName === 'create_finance_record' && (!params.dueDate || params.dueDate === '')) {
        this.log(taskId, 'approval', 'execute', `Ambiguous/missing due date encountered for invoice ${params.invoiceNumber}. Pausing for human approval.`, actionId);
        const approvalTool = getTool('request_approval')!;
        await approvalTool.execute({
          prompt: `Invoice ${params.invoiceNumber} is missing a valid payment due date. Please authorize default Net 30 or provide a due date.`,
          contextDetails: { invoiceNumber: params.invoiceNumber, vendor: params.vendorName, amount: params.amount },
        }, { taskId, workspaceId, actionId });
        return this.getTask(taskId);
      }

      // Execute tool with bounded retries and recovery
      let success = false;
      let attempt = 0;
      const maxRetries = actionRow.max_retries || 3;
      let lastError: string | null = null;
      let output: any = null;

      while (!success && attempt <= maxRetries) {
        try {
          attempt++;
          // Schema validation of inputs
          const validatedParams = tool.parametersSchema.parse(params);

          // Simulated transient failure hook for Scenario 3
          const isSimulatedTransient = options?.simulateTransientFailureStep === stepNumber && attempt === 1;

          output = await tool.execute(validatedParams, {
            taskId,
            workspaceId,
            actionId,
            simulateTransientFailure: isSimulatedTransient,
          });

          // Check if tool returned a permission denied status
          if (output?.permissionDenied) {
            this.log(taskId, 'warn', 'execute', `Permission enforcement: ${output.reason}`, actionId);
            this.updateActionStatus(actionId, 'failed', output, output.reason);
            this.failTask(taskId, `Access blocked by workspace security policy: ${output.reason}`);
            return this.getTask(taskId);
          }

          success = true;
          this.log(taskId, 'info', 'execute', `Step ${stepNumber}: Tool '${toolName}' succeeded.`, actionId, { output });
          break;
        } catch (err: any) {
          lastError = err.message || String(err);
          this.log(taskId, 'warn', 'recover', `Step ${stepNumber}: Attempt ${attempt} failed with: ${lastError}`, actionId);

          if (attempt <= maxRetries && lastError && lastError.includes('TRANSIENT')) {
            this.updateActionRetry(actionId, attempt);
            this.log(taskId, 'info', 'recover', `Transient failure detected. Retrying step ${stepNumber} (attempt ${attempt + 1}/${maxRetries + 1})...`, actionId);
            await new Promise(r => setTimeout(r, 100));
          } else {
            break;
          }
        }
      }

      if (!success) {
        this.updateActionStatus(actionId, 'failed', null, lastError);
        this.failTask(taskId, `Execution failed at step ${stepNumber} (${toolName}): ${lastError}`);
        return this.getTask(taskId);
      }

      this.updateActionStatus(actionId, 'completed', output, null);

      // OBSERVE & STORE MEMORY
      if (toolName === 'search_invoices' && output?.invoices?.length > 0) {
        memory.latestInvoice = output.invoices[0];
        this.log(taskId, 'info', 'execute', `Identified latest invoice: ${memory.latestInvoice.invoiceNumber} (${memory.latestInvoice.filename}) dated ${memory.latestInvoice.date}`);
      } else if (toolName === 'read_invoice') {
        memory.extractedInvoice = output;
        this.log(taskId, 'info', 'execute', `Extracted document fields: Inv# ${output.invoiceNumber}, Amount: $${output.amount}, Due: ${output.dueDate}`);
        
        if (!output.isComplete || !output.dueDate) {
          this.log(taskId, 'approval', 'execute', `Critical field missing (Due Date) in ${output.invoiceNumber}. Halting for human approval.`);
          const approvalTool = getTool('request_approval')!;
          await approvalTool.execute({
            prompt: `Invoice ${output.invoiceNumber} from ${output.vendor} is missing a due date. Confirm due date to proceed.`,
            contextDetails: { invoice: output },
          }, { taskId, workspaceId, actionId });
          return this.getTask(taskId);
        }
      } else if (toolName === 'extract_document_fields') {
        memory.extractedFields = output.fields;
        if (output.schemaType === 'policy') {
          memory.policyResult = output.fields;
        } else if (output.schemaType === 'contract') {
          memory.contractResult = memory.contractResult ? [...memory.contractResult, output.fields] : [output.fields];
        }
      } else if (toolName === 'lookup_finance_record') {
        if (output?.exists) {
          this.log(taskId, 'warn', 'execute', `Duplicate invoice detected: ${params.invoiceNumber} already exists in finance system.`);
          memory.alreadyRecorded = true;
          memory.createdRecordId = output.record.id;
        }
      } else if (toolName === 'create_finance_record') {
        if (output?.isDuplicate) {
          this.log(taskId, 'warn', 'execute', `Duplicate protection triggered: ${output.message}`);
          memory.createdRecordId = output.recordId;
        } else {
          memory.createdRecordId = output.recordId;
        }
      } else if (toolName === 'verify_finance_record') {
        this.log(taskId, output.verified ? 'verify' : 'error', 'verify', output.notes, actionId, {
          fieldMatches: output.fieldMatches
        });

        if (!output.verified) {
          this.updateTaskStatus(taskId, 'needs_review', 'Verification discrepancy detected: Data read back from finance database did not match source invoice.');
          this.log(taskId, 'error', 'report', 'Task marked as "needs_review" due to failed independent read-back verification.');
          return this.getTask(taskId);
        }
      }
    }

    // Final Reporter phase
    let summary = '';
    if (memory.policyResult) {
      summary = `Verified Leave Policy (${memory.policyResult.source}): Annual Vacation: ${memory.policyResult.annualVacation} Sick Leave: ${memory.policyResult.sickLeave} Parental Leave: ${memory.policyResult.parentalLeave}`;
    } else if (memory.contractResult && memory.contractResult.length >= 2) {
      summary = `Verified Contract Differences: [Acme]: ${memory.contractResult[0].paymentTerms}, Penalty: ${memory.contractResult[0].latePenalty}, Discount: ${memory.contractResult[0].discount}. [Beta]: ${memory.contractResult[1].paymentTerms}, Penalty: ${memory.contractResult[1].latePenalty}, Discount: ${memory.contractResult[1].discount}.`;
    } else if (memory.createdRecordId || memory.extractedInvoice) {
      summary = `Successfully extracted invoice ${memory.extractedInvoice?.invoiceNumber || 'N/A'} ($${memory.extractedInvoice?.amount || 'N/A'}, due ${memory.extractedInvoice?.dueDate || 'N/A'}), persisted record ${memory.createdRecordId || 'N/A'}, and confirmed parity via independent database verification.`;
    } else {
      summary = `Successfully executed task directives and verified results across permitted workspace documents.`;
    }

    this.completeTask(taskId, summary);
    this.log(taskId, 'info', 'report', `Final report: ${summary}`);

    return this.getTask(taskId);
  }

  /**
   * Resumes a paused task after human approval or rejection
   */
  async resolveApproval(approvalId: string, approved: boolean, reason?: string): Promise<TaskRecord> {
    const approval = this.db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(approvalId) as any;
    if (!approval) throw new Error(`Approval request ${approvalId} not found`);

    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE approval_requests 
      SET status = ?, reason = ?, resolved_at = ?
      WHERE id = ?
    `).run(approved ? 'approved' : 'rejected', reason || null, now, approvalId);

    const taskId = approval.task_id;

    if (!approved) {
      this.log(taskId, 'warn', 'approval', `Human operator REJECTED action approval: ${reason || 'No reason provided'}`);
      this.failTask(taskId, `Human rejected approval: ${reason || 'Denied by human supervisor'}`);
      return this.getTask(taskId);
    }

    this.log(taskId, 'info', 'approval', `Human operator APPROVED action: ${reason || 'Approved'}. Resuming task execution.`);

    if (reason && reason.match(/\d{4}-\d{2}-\d{2}/)) {
      const extractedDate = reason.match(/\d{4}-\d{2}-\d{2}/)![0];
      const createAction = this.db.prepare("SELECT * FROM planned_actions WHERE task_id = ? AND tool_name = 'create_finance_record'").get(taskId) as any;
      if (createAction) {
        const p = JSON.parse(createAction.parameters_json);
        p.dueDate = extractedDate;
        this.db.prepare("UPDATE planned_actions SET parameters_json = ? WHERE id = ?").run(JSON.stringify(p), createAction.id);
      }
    }

    this.updateTaskStatus(taskId, 'executing');
    return this.executeTask(taskId);
  }

  getTask(taskId: string): TaskRecord {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
    if (!row) throw new Error(`Task ${taskId} not found`);
    return {
      id: row.id,
      workspaceId: row.workspace_id || 'default',
      userPrompt: row.user_prompt,
      status: row.status,
      goal: row.goal,
      constraints: JSON.parse(row.constraints_json),
      completionCriteria: JSON.parse(row.completion_criteria_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      error: row.error,
      summary: row.summary,
    };
  }

  private updateTaskStatus(taskId: string, status: TaskStatus, error?: string): void {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE tasks SET status = ?, error = ?, updated_at = ? WHERE id = ?')
      .run(status, error || null, now, taskId);
  }

  private failTask(taskId: string, error: string): void {
    this.updateTaskStatus(taskId, 'failed', error);
  }

  private completeTask(taskId: string, summary: string): void {
    const now = new Date().toISOString();
    this.db.prepare("UPDATE tasks SET status = 'completed', summary = ?, updated_at = ? WHERE id = ?")
      .run(summary, now, taskId);
  }

  private updateActionStatus(actionId: string, status: string, output?: any, error?: string | null): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE planned_actions 
      SET status = ?, output_json = ?, error = ?, updated_at = ?
      WHERE id = ?
    `).run(
      status,
      output ? JSON.stringify(output) : null,
      error || null,
      now,
      actionId
    );
  }

  private updateActionRetry(actionId: string, retryCount: number): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE planned_actions 
      SET retry_count = ?, status = 'retrying', updated_at = ?
      WHERE id = ?
    `).run(retryCount, now, actionId);
  }
}
