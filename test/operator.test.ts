import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentRuntime } from '../src/lib/runtime';
import { seedInvoices, seedWorkspaceDocuments } from '../src/lib/seed';
import { getDb, closeDb } from '../src/lib/db';
import { ingestFile, ingestZipArchive } from '../src/lib/ingestion';
import { checkFilePermission, updateFilePermissions } from '../src/lib/permissions';
import AdmZip from 'adm-zip';

describe('OperatorOS Enterprise Platform & Permissions Suite', () => {
  let runtime: AgentRuntime;

  beforeEach(() => {
    process.env.OPERATOR_DB_PATH = ':memory:';
    closeDb();
    seedInvoices();
    seedWorkspaceDocuments('default');
    runtime = new AgentRuntime();
  });

  afterEach(() => {
    closeDb();
  });

  // Test 1: Uploading and indexing supported files
  it('1. uploads and indexes supported files (TXT, MD, CSV, JSON)', async () => {
    const csvContent = 'item,quantity,price\nwidget_a,10,15.50\nwidget_b,5,30.00';
    const file = await ingestFile(
      'default',
      'inventory.csv',
      'warehouse/inventory.csv',
      Buffer.from(csvContent, 'utf-8')
    );

    expect(file.id).toBeDefined();
    expect(file.filename).toBe('inventory.csv');
    expect(file.fileType).toBe('CSV');
    expect(file.extractedText).toContain('widget_a');
    expect(file.permissions.read).toBe(true);
  });

  // Test 2: Safe ZIP archive extraction and protection against unsupported files
  it('2. safely extracts ZIP archives and filters unsupported files', async () => {
    const zip = new AdmZip();
    zip.addFile('safe_doc.txt', Buffer.from('Safe document content', 'utf-8'));
    zip.addFile('malicious_script.exe', Buffer.from('Harmful binary payload', 'utf-8'));

    const zipBuffer = zip.toBuffer();
    const result = await ingestZipArchive('default', zipBuffer);

    expect(result.ingested.length).toBe(1);
    expect(result.ingested[0].filename).toBe('safe_doc.txt');
    expect(result.skipped.length).toBe(1);
    expect(result.skipped[0]).toContain('unsupported file type');
  });

  // Test 3: Reading a permitted file
  it('3. permits reading a file when read permission is active', () => {
    const check = checkFilePermission('default', 'doc-default-5', 'read'); // employee handbook
    expect(check.allowed).toBe(true);
    expect(check.file?.extractedText).toContain('Employee Handbook');
  });

  // Test 4: Denying file read when permission is revoked
  it('4. strictly denies reading when permission is revoked', () => {
    updateFilePermissions('default', 'doc-default-5', { read: false });
    const check = checkFilePermission('default', 'doc-default-5', 'read');
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('PERMISSION_DENIED');
  });

  // Test 5: Preventing cross-workspace access
  it('5. strictly prevents cross-workspace file access', () => {
    // Attempt to access default workspace file from 'ws-isolated-99'
    const check = checkFilePermission('ws-isolated-99', 'doc-default-5', 'read');
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('cross-workspace access');
  });

  // Test 6: Completing a general-purpose task using permitted files (Employee Handbook)
  it('6. executes policy inquiry task and grounds answer in permitted document', async () => {
    const prompt = 'Read the employee handbook and summarize the annual leave policy, citing the source file.';
    const taskId = await runtime.createTask(prompt, { workspaceId: 'default' });
    const result = await runtime.executeTask(taskId, { workspaceId: 'default' });

    expect(result.status).toBe('completed');
    expect(result.summary).toContain('Leave Policy');
    expect(result.summary).toContain('20 standard business days');
  });

  // Test 7: Handling a task that requires denied information
  it('7. halts with security policy explanation when target document read permission is revoked', async () => {
    // Revoke read permission on employee handbook
    updateFilePermissions('default', 'doc-default-5', { read: false });

    const prompt = 'Read the employee handbook and summarize the annual leave policy, citing the source file.';
    const taskId = await runtime.createTask(prompt, { workspaceId: 'default' });
    const result = await runtime.executeTask(taskId, { workspaceId: 'default' });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Access blocked by workspace security policy');
  });

  // Test 8: End-to-end verified invoice flow (Acme Supplies)
  it('8. processes invoice with independent database read-back verification', async () => {
    const prompt = 'Find the latest invoice from Acme Supplies, extract the invoice number, amount and due date, record it in our finance system, and confirm once completed.';
    const taskId = await runtime.createTask(prompt, { workspaceId: 'default' });
    const result = await runtime.executeTask(taskId, { workspaceId: 'default' });

    expect(result.status).toBe('completed');
    expect(result.summary).toContain('INV-10588');

    const db = getDb();
    const record = db.prepare('SELECT * FROM finance_records WHERE invoice_number = ?').get('INV-10588') as any;
    expect(record).toBeDefined();
    expect(record.status).toBe('verified');
  });

  // Test 9: Transient failure and automatic retry
  it('9. recovers from transient failure via automatic retry', async () => {
    const prompt = 'Find the latest invoice from Acme Supplies and record in finance';
    const taskId = await runtime.createTask(prompt, { workspaceId: 'default' });
    const result = await runtime.executeTask(taskId, {
      workspaceId: 'default',
      simulateTransientFailureStep: 2,
    });

    expect(result.status).toBe('completed');
    const db = getDb();
    const actions = db.prepare('SELECT * FROM planned_actions WHERE task_id = ? AND step_number = 2').all(taskId) as any[];
    expect(actions[0].retry_count).toBe(1);
  });

  // Test 10: Duplicate invoice detection & idempotency
  it('10. prevents duplicate finance records through unique constraints', async () => {
    const prompt = 'Find the latest invoice from Acme Supplies and record in finance';
    const t1 = await runtime.createTask(prompt);
    await runtime.executeTask(t1);

    const t2 = await runtime.createTask(prompt);
    await runtime.executeTask(t2);

    const db = getDb();
    const count = (db.prepare('SELECT COUNT(*) as cnt FROM finance_records WHERE invoice_number = ?').get('INV-10588') as any).cnt;
    expect(count).toBe(1);
  });

  // Test 11: Verification failure results in needs_review rather than false success
  it('11. flags needs_review when independent read-back detects field mismatch', async () => {
    const prompt = 'Find the latest invoice from Acme Supplies and record in finance';
    const taskId = await runtime.createTask(prompt, { forceVerificationMismatch: true });
    const result = await runtime.executeTask(taskId, { forceVerificationMismatch: true });

    expect(result.status).toBe('needs_review');
    expect(result.error).toContain('Verification discrepancy');
  });

  // Test 12: Contract comparison multi-document task
  it('12. executes multi-contract comparison task across permitted vendor contracts', async () => {
    const prompt = 'Compare the vendor contracts in this workspace and list differences in payment terms.';
    const taskId = await runtime.createTask(prompt, { workspaceId: 'default' });
    const result = await runtime.executeTask(taskId, { workspaceId: 'default' });

    expect(result.status).toBe('completed');
    expect(result.summary).toContain('Acme');
    expect(result.summary).toContain('Beta');
    expect(result.summary).toContain('Net 30');
    expect(result.summary).toContain('Net 45');
  });
});
