import { NextResponse } from 'next/server';
import { AgentRuntime } from '@/lib/runtime';
import { seedInvoices, seedWorkspaceDocuments } from '@/lib/seed';
import { getDb } from '@/lib/db';

seedInvoices();
seedWorkspaceDocuments('default');

export async function GET(req: Request) {
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get('workspaceId');

  const db = getDb();
  let query = 'SELECT * FROM tasks';
  const params: any[] = [];

  if (workspaceId) {
    query += ' WHERE workspace_id = ?';
    params.push(workspaceId);
  }

  query += ' ORDER BY created_at DESC';

  const tasks = db.prepare(query).all(...params);
  return NextResponse.json({
    tasks: tasks.map((t: any) => ({
      ...t,
      constraints: JSON.parse(t.constraints_json),
      completionCriteria: JSON.parse(t.completion_criteria_json),
    }))
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { prompt, options, workspaceId } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const effectiveOptions = {
      ...options,
      workspaceId: workspaceId || options?.workspaceId || 'default',
    };

    const runtime = new AgentRuntime();
    const taskId = await runtime.createTask(prompt, effectiveOptions);
    const taskResult = await runtime.executeTask(taskId, effectiveOptions);

    return NextResponse.json({
      taskId,
      task: taskResult,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
