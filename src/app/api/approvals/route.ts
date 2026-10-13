import { NextResponse } from 'next/server';
import { AgentRuntime } from '@/lib/runtime';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = getDb();
  const approvals = db.prepare('SELECT * FROM approval_requests ORDER BY created_at DESC').all();
  return NextResponse.json({
    approvals: approvals.map((a: any) => ({
      ...a,
      parameters: JSON.parse(a.parameters_json),
    }))
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { approvalId, approved, reason } = body;

    if (!approvalId || typeof approved !== 'boolean') {
      return NextResponse.json({ error: 'approvalId and approved flag are required' }, { status: 400 });
    }

    const runtime = new AgentRuntime();
    const task = await runtime.resolveApproval(approvalId, approved, reason);

    return NextResponse.json({ success: true, task });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
