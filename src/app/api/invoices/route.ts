import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { seedInvoices } from '@/lib/seed';

seedInvoices();

export async function GET() {
  const db = getDb();
  const invoices = db.prepare('SELECT id, filename, vendor, invoice_number, amount, currency, date, due_date, status, raw_text FROM invoices ORDER BY date DESC').all();
  return NextResponse.json({ invoices });
}
