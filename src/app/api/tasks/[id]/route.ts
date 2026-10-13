import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { AgentRuntime } from '@/lib/runtime';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  const actions = db.prepare('SELECT * FROM planned_actions WHERE task_id = ? ORDER BY step_number ASC').all(id);
  const logs = db.prepare('SELECT * FROM execution_logs WHERE task_id = ? ORDER BY timestamp ASC').all(id);
  const approvals = db.prepare('SELECT * FROM approval_requests WHERE task_id = ? ORDER BY created_at DESC').all(id);

  // If there's a recorded finance record from this task
  const financeRecord = db.prepare('SELECT * FROM finance_records WHERE task_id = ?').get(id);

  return NextResponse.json({
    task: {
      ...task,
      constraints: JSON.parse(task.constraints_json),
      completionCriteria: JSON.parse(task.completion_criteria_json),
    },
    actions: actions.map((a: any) => ({
      ...a,
      parameters: JSON.parse(a.parameters_json),
      output: a.output_json ? JSON.parse(a.output_json) : null,
    })),
    logs: logs.map((l: any) => ({
      ...l,
      metadata: l.metadata_json ? JSON.parse(l.metadata_json) : null,
    })),
    approvals: approvals.map((app: any) => ({
      ...app,
      parameters: JSON.parse(app.parameters_json),
    })),
    financeRecord,
  });
}
