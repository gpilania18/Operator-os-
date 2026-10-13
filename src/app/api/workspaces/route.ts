import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { seedWorkspaceDocuments } from '@/lib/seed';

seedWorkspaceDocuments('default');

export async function GET() {
  const db = getDb();
  const workspaces = db.prepare('SELECT * FROM workspaces ORDER BY created_at ASC').all();
  return NextResponse.json({ workspaces });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, description } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Workspace name is required' }, { status: 400 });
    }

    const id = `ws-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const db = getDb();

    db.prepare(`
      INSERT INTO workspaces (id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name.trim(), description || 'Custom enterprise workspace', now, now);

    return NextResponse.json({
      workspace: {
        id,
        name: name.trim(),
        description: description || 'Custom enterprise workspace',
        created_at: now,
        updated_at: now,
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
