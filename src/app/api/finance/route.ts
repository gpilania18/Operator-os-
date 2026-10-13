import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = getDb();
  const records = db.prepare('SELECT * FROM finance_records ORDER BY created_at DESC').all();
  return NextResponse.json({ records });
}

export async function DELETE() {
  const db = getDb();
  db.prepare('DELETE FROM finance_records').run();
  return NextResponse.json({ success: true, message: 'Finance records cleared' });
}
