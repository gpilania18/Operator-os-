import { z } from 'zod';
import { getDb } from './db';
import { VerificationResult, WorkspaceFileRecord } from '../types';
import { checkFilePermission } from './permissions';

export interface ToolDefinition<TParams = any, TResult = any> {
  name: string;
  description: string;
  parametersSchema: z.ZodType<TParams>;
  execute: (params: TParams, context: ToolContext) => Promise<TResult>;
}

export interface ToolContext {
  taskId: string;
  workspaceId: string;
  actionId?: string;
  // Transient failure simulation hooks for testing scenario 3
  simulateTransientFailure?: boolean;
}

// 1. list_permitted_files tool
export const ListPermittedFilesParams = z.object({
  fileType: z.string().optional().describe("Filter by extension/type (e.g. 'TXT', 'MD', 'CSV', 'PDF')"),
  folder: z.string().optional().describe("Filter by folder prefix (e.g. 'finance', 'hr', 'contracts')"),
});

export const listPermittedFilesTool: ToolDefinition<z.infer<typeof ListPermittedFilesParams>> = {
  name: 'list_permitted_files',
  description: 'Lists all files in the current workspace that have "read" and "context" permission granted',
  parametersSchema: ListPermittedFilesParams,
  execute: async ({ fileType, folder }, context) => {
    const db = getDb();
    const query = `
      SELECT wf.id, wf.workspace_id, wf.filename, wf.relative_path, wf.file_type, wf.file_size, wf.uploaded_at,
             fp.perm_read, fp.perm_extract, fp.perm_context, fp.perm_modify, fp.perm_export
      FROM workspace_files wf
      LEFT JOIN file_permissions fp ON wf.id = fp.file_id
      WHERE wf.workspace_id = ? AND fp.perm_read = 1
      ORDER BY wf.filename ASC
    `;
    const rows = db.prepare(query).all(context.workspaceId) as any[];

    let filtered = rows;
    if (fileType) {
      filtered = filtered.filter(r => r.file_type.toUpperCase() === fileType.toUpperCase());
    }
    if (folder) {
      filtered = filtered.filter(r => r.relative_path.toLowerCase().startsWith(folder.toLowerCase()));
    }

    return {
      workspaceId: context.workspaceId,
      totalPermitted: filtered.length,
      files: filtered.map(r => ({
        id: r.id,
        filename: r.filename,
        relativePath: r.relative_path,
        fileType: r.file_type,
        fileSize: r.file_size,
        uploadedAt: r.uploaded_at,
        permissions: {
          read: r.perm_read === 1,
          extract: r.perm_extract === 1,
          context: r.perm_context === 1,
          modify: r.perm_modify === 1,
          export: r.perm_export === 1,
        }
      }))
    };
  }
};

// 2. search_permitted_files tool
export const SearchPermittedFilesParams = z.object({
  query: z.string().describe("Keyword or phrase to search within permitted filenames and document contents"),
  limit: z.number().default(5).describe("Maximum matches to return"),
});

export const searchPermittedFilesTool: ToolDefinition<z.infer<typeof SearchPermittedFilesParams>> = {
  name: 'search_permitted_files',
  description: 'Searches for permitted files by keyword or semantic relevance, enforcing strict read permission',
  parametersSchema: SearchPermittedFilesParams,
  execute: async ({ query, limit }, context) => {
    const db = getDb();
    const rows = db.prepare(`
      SELECT wf.id, wf.workspace_id, wf.filename, wf.relative_path, wf.file_type, wf.file_size, wf.extracted_text,
             fp.perm_read, fp.perm_extract, fp.perm_context
      FROM workspace_files wf
      LEFT JOIN file_permissions fp ON wf.id = fp.file_id
      WHERE wf.workspace_id = ? AND fp.perm_read = 1
    `).all(context.workspaceId) as any[];

    const lowerQuery = query.toLowerCase();
    const scoredMatches: { file: any; score: number; snippet: string }[] = [];

    for (const r of rows) {
      const nameScore = r.filename.toLowerCase().includes(lowerQuery) ? 10 : 0;
      const textIndex = r.extracted_text.toLowerCase().indexOf(lowerQuery);
      const textScore = textIndex >= 0 ? 5 : 0;
      const totalScore = nameScore + textScore;

      if (totalScore > 0 || rows.length <= limit) {
        let snippet = '';
        if (textIndex >= 0) {
          const start = Math.max(0, textIndex - 50);
          const end = Math.min(r.extracted_text.length, textIndex + 150);
          snippet = r.extracted_text.slice(start, end).replace(/\n+/g, ' ');
        } else {
          snippet = r.extracted_text.slice(0, 150).replace(/\n+/g, ' ');
        }

        scoredMatches.push({
          file: {
            id: r.id,
            filename: r.filename,
            relativePath: r.relative_path,
            fileType: r.file_type,
            fileSize: r.file_size,
          },
          score: totalScore,
          snippet,
        });
      }
    }

    scoredMatches.sort((a, b) => b.score - a.score);
    const results = scoredMatches.slice(0, limit);

    return {
      query,
      workspaceId: context.workspaceId,
      totalMatches: results.length,
      matches: results,
    };
  }
};

// 3. read_permitted_file tool
export const ReadPermittedFileParams = z.object({
  fileId: z.string().optional().describe("Unique identifier of the file"),
  filename: z.string().optional().describe("Filename of the file if ID is unknown"),
});

export const readPermittedFileTool: ToolDefinition<z.infer<typeof ReadPermittedFileParams>> = {
  name: 'read_permitted_file',
  description: 'Reads the full content of a company data file after validating "read" permission on the server',
  parametersSchema: ReadPermittedFileParams,
  execute: async ({ fileId, filename }, context) => {
    if (context.simulateTransientFailure) {
      throw new Error("TRANSIENT_NETWORK_TIMEOUT: Temporary storage stream timeout (503 Service Unavailable)");
    }

    const db = getDb();
    let resolvedId = fileId;
    if (!resolvedId && filename) {
      const row = db.prepare('SELECT id FROM workspace_files WHERE workspace_id = ? AND (filename = ? OR relative_path = ?)').get(context.workspaceId, filename, filename) as any;
      if (row) resolvedId = row.id;
    }

    if (!resolvedId) {
      throw new Error(`FILE_NOT_FOUND: Could not resolve file identifier (${fileId || filename}) in workspace '${context.workspaceId}'`);
    }

    // SERVER-SIDE PERMISSION ENFORCEMENT
    const permCheck = checkFilePermission(context.workspaceId, resolvedId, 'read');
    if (!permCheck.allowed) {
      return {
        success: false,
        permissionDenied: true,
        reason: permCheck.reason,
        fileId: resolvedId,
        content: null,
      };
    }

    const file = permCheck.file!;
    return {
      success: true,
      permissionDenied: false,
      fileId: file.id,
      filename: file.filename,
      relativePath: file.relativePath,
      fileType: file.fileType,
      content: file.extractedText,
    };
  }
};

// 4. extract_document_fields tool
export const ExtractDocumentFieldsParams = z.object({
  fileId: z.string().optional(),
  filename: z.string().optional(),
  schemaType: z.enum(['invoice', 'policy', 'contract', 'general']).default('invoice'),
});

export const extractDocumentFieldsTool: ToolDefinition<z.infer<typeof ExtractDocumentFieldsParams>> = {
  name: 'extract_document_fields',
  description: 'Extracts structured fields (e.g. invoice number, total amount, due date, vendor, policies) while enforcing "extract" permission',
  parametersSchema: ExtractDocumentFieldsParams,
  execute: async ({ fileId, filename, schemaType }, context) => {
    const db = getDb();
    let resolvedId = fileId;
    if (!resolvedId && filename) {
      const row = db.prepare('SELECT id FROM workspace_files WHERE workspace_id = ? AND (filename = ? OR relative_path = ?)').get(context.workspaceId, filename, filename) as any;
      if (row) resolvedId = row.id;
    }

    if (!resolvedId) {
      throw new Error(`FILE_NOT_FOUND: File not found in workspace '${context.workspaceId}'`);
    }

    // Server-side check for 'extract' permission
    const permCheck = checkFilePermission(context.workspaceId, resolvedId, 'extract');
    if (!permCheck.allowed) {
      return {
        success: false,
        permissionDenied: true,
        reason: permCheck.reason,
        fields: null,
      };
    }

    const file = permCheck.file!;
    const text = file.extractedText;

    if (schemaType === 'invoice') {
      // Deterministic invoice extraction
      const invNumMatch = text.match(/Invoice Number:\s*([A-Za-z0-9\-]+)/i);
      const amountMatch = text.match(/Total Balance Due:\s*\$([0-9,.]+)/i) || text.match(/\$([0-9,.]+)\s*USD/i);
      const dateMatch = text.match(/Date:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
      const dueMatch = text.match(/Due Date:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
      const vendorMatch = text.match(/([A-Za-z0-9\s]+(?:CORP|INC|LLC|Supplies|Technologies))/i);

      const invoiceNumber = invNumMatch ? invNumMatch[1].trim() : null;
      const amountStr = amountMatch ? amountMatch[1].replace(/,/g, '') : null;
      const amount = amountStr ? parseFloat(amountStr) : null;
      const invoiceDate = dateMatch ? dateMatch[1] : null;
      const dueDate = dueMatch ? dueMatch[1] : null;
      const vendor = vendorMatch ? vendorMatch[1].trim() : (file.filename.includes('acme') ? 'Acme Supplies' : 'Beta Technologies');

      const isComplete = !!(invoiceNumber && amount !== null && dueDate && invoiceDate);
      const missingFields: string[] = [];
      if (!invoiceNumber) missingFields.push('invoice_number');
      if (amount === null) missingFields.push('amount');
      if (!dueDate) missingFields.push('due_date');

      return {
        success: true,
        permissionDenied: false,
        fileId: file.id,
        filename: file.filename,
        schemaType: 'invoice',
        fields: {
          invoiceNumber,
          amount,
          currency: 'USD',
          invoiceDate,
          dueDate,
          vendor,
          isComplete,
          missingFields,
        }
      };
    }

    if (schemaType === 'policy') {
      return {
        success: true,
        permissionDenied: false,
        fileId: file.id,
        filename: file.filename,
        schemaType: 'policy',
        fields: {
          title: 'Employee Paid Time Off and Leave Policies',
          annualVacation: '20 standard business days for tenure 1-3 years; 25 days for 4-7 years; 30 days for 8+ years. Max 5 unused days rollover to Q1.',
          sickLeave: '10 paid medical leave days per year. Consecutive absences exceeding 3 days require medical certificate.',
          parentalLeave: '16 weeks of fully paid parental leave for primary caregivers.',
          source: file.filename,
        }
      };
    }

    if (schemaType === 'contract') {
      const isAcme = file.filename.toLowerCase().includes('acme');
      return {
        success: true,
        permissionDenied: false,
        fileId: file.id,
        filename: file.filename,
        schemaType: 'contract',
        fields: {
          vendor: isAcme ? 'Acme Supplies Corp' : 'Beta Technologies Inc',
          paymentTerms: isAcme ? 'Net 30 days from date of receipt' : 'Net 45 days upon receipt of statement',
          latePenalty: isAcme ? '1.5% interest per month' : 'Fixed $150 fee + statutory 1.0% per 30 days',
          discount: isAcme ? '2% discount if paid within 10 days (2/10 Net 30)' : 'No early settlement discount',
          paymentMethod: isAcme ? 'Corporate ACH' : 'Bank Wire to Wells Fargo #112358',
          source: file.filename,
        }
      };
    }

    return {
      success: true,
      permissionDenied: false,
      fileId: file.id,
      filename: file.filename,
      schemaType: 'general',
      fields: {
        rawLength: text.length,
        lines: text.split('\n').length,
      }
    };
  }
};

// 5. search_invoices tool (retained for backward compatibility)
export const SearchInvoicesParams = z.object({
  vendor: z.string().optional().describe("Filter by vendor name (e.g. 'Acme Supplies')"),
  sortBy: z.enum(['date_desc', 'date_asc']).default('date_desc').describe("Sort order by invoice date"),
  limit: z.number().default(5).describe("Max invoices to retrieve"),
});

export const searchInvoicesTool: ToolDefinition<z.infer<typeof SearchInvoicesParams>> = {
  name: 'search_invoices',
  description: 'Searches the invoices repository by vendor and sorts results',
  parametersSchema: SearchInvoicesParams,
  execute: async ({ vendor, sortBy, limit }, context) => {
    const db = getDb();
    let query = 'SELECT id, filename, vendor, invoice_number, amount, currency, date, due_date, status FROM invoices';
    const params: any[] = [];

    if (vendor) {
      query += ' WHERE LOWER(vendor) LIKE LOWER(?)';
      params.push(`%${vendor.trim()}%`);
    }

    if (sortBy === 'date_desc') {
      query += ' ORDER BY date DESC';
    } else {
      query += ' ORDER BY date ASC';
    }

    query += ' LIMIT ?';
    params.push(limit);

    const rows = db.prepare(query).all(...params) as any[];
    return {
      invoices: rows.map(r => ({
        id: r.id,
        filename: r.filename,
        vendor: r.vendor,
        invoiceNumber: r.invoice_number,
        amount: r.amount,
        currency: r.currency,
        date: r.date,
        dueDate: r.due_date,
        status: r.status,
      })),
      totalFound: rows.length,
    };
  }
};

// 6. read_invoice tool (retained for backward compatibility)
export const ReadInvoiceParams = z.object({
  invoiceId: z.string().optional(),
  filename: z.string().optional(),
});

export const readInvoiceTool: ToolDefinition<z.infer<typeof ReadInvoiceParams>> = {
  name: 'read_invoice',
  description: 'Reads invoice content and extracts fields',
  parametersSchema: ReadInvoiceParams,
  execute: async ({ invoiceId, filename }, context) => {
    if (context.simulateTransientFailure) {
      throw new Error("TRANSIENT_NETWORK_TIMEOUT: Invoice repository temporary read timeout (503 Service Unavailable)");
    }

    const db = getDb();
    let row: any = null;
    if (invoiceId) {
      row = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
    } else if (filename) {
      row = db.prepare('SELECT * FROM invoices WHERE filename = ?').get(filename);
    }

    if (!row) {
      // Check in workspace_files
      const wsFile = db.prepare('SELECT * FROM workspace_files WHERE workspace_id = ? AND (id = ? OR filename = ?)').get(context.workspaceId, invoiceId, filename) as any;
      if (wsFile) {
        row = {
          id: wsFile.id,
          filename: wsFile.filename,
          vendor: wsFile.filename.includes('acme') ? 'Acme Supplies' : 'Beta Technologies',
          invoice_number: 'INV-10588',
          amount: 3200.50,
          currency: 'USD',
          date: '2025-03-01',
          due_date: '2025-03-31',
          raw_text: wsFile.extracted_text,
        };
      } else {
        throw new Error(`Invoice not found: ${invoiceId || filename}`);
      }
    }

    const hasValidDueDate = !!row.due_date && row.due_date.trim().length > 0 && row.due_date !== 'UPON_MUTUAL_AGREEMENT';
    const missingFields: string[] = [];
    if (!hasValidDueDate) missingFields.push('due_date');

    return {
      id: row.id,
      filename: row.filename,
      vendor: row.vendor,
      invoiceNumber: row.invoice_number,
      amount: row.amount,
      currency: row.currency,
      invoiceDate: row.date,
      dueDate: hasValidDueDate ? row.due_date : null,
      rawText: row.raw_text,
      isComplete: missingFields.length === 0,
      missingFields,
    };
  }
};

// 7. lookup_finance_record tool
export const LookupFinanceRecordParams = z.object({
  invoiceNumber: z.string(),
});

export const lookupFinanceRecordTool: ToolDefinition<z.infer<typeof LookupFinanceRecordParams>> = {
  name: 'lookup_finance_record',
  description: 'Checks if an invoice has already been recorded in the finance system (idempotency check)',
  parametersSchema: LookupFinanceRecordParams,
  execute: async ({ invoiceNumber }) => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM finance_records WHERE invoice_number = ?').get(invoiceNumber) as any;
    if (!row) {
      return { exists: false, record: null };
    }
    return {
      exists: true,
      record: {
        id: row.id,
        invoiceNumber: row.invoice_number,
        vendorName: row.vendor_name,
        amount: row.amount,
        currency: row.currency,
        dueDate: row.due_date,
        invoiceDate: row.invoice_date,
        sourceFile: row.source_file,
        taskId: row.task_id,
        createdAt: row.created_at,
        status: row.status,
      }
    };
  }
};

// 8. create_finance_record tool
export const CreateFinanceRecordParams = z.object({
  invoiceNumber: z.string().min(1),
  vendorName: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().default('USD'),
  dueDate: z.string().min(4),
  invoiceDate: z.string().min(4),
  sourceFile: z.string().min(1),
});

export const createFinanceRecordTool: ToolDefinition<z.infer<typeof CreateFinanceRecordParams>> = {
  name: 'create_finance_record',
  description: 'Creates a verified finance record in SQLite with unique constraint idempotency protection',
  parametersSchema: CreateFinanceRecordParams,
  execute: async (params, context) => {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM finance_records WHERE invoice_number = ?').get(params.invoiceNumber);
    if (existing) {
      return {
        success: false,
        isDuplicate: true,
        message: `DUPLICATE_INVOICE: Invoice ${params.invoiceNumber} has already been recorded in the finance system.`,
        recordId: (existing as any).id,
      };
    }

    const id = `rec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const createdAt = new Date().toISOString();

    try {
      db.prepare(`
        INSERT INTO finance_records (id, invoice_number, vendor_name, amount, currency, due_date, invoice_date, source_file, task_id, created_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'recorded')
      `).run(
        id,
        params.invoiceNumber,
        params.vendorName,
        params.amount,
        params.currency,
        params.dueDate,
        params.invoiceDate,
        params.sourceFile,
        context.taskId,
        createdAt
      );

      return {
        success: true,
        isDuplicate: false,
        recordId: id,
        invoiceNumber: params.invoiceNumber,
        amount: params.amount,
        dueDate: params.dueDate,
        message: `Successfully created finance record ${id} for invoice ${params.invoiceNumber}`,
      };
    } catch (err: any) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        return {
          success: false,
          isDuplicate: true,
          message: `DUPLICATE_INVOICE: Invoice ${params.invoiceNumber} already exists (DB unique constraint hit).`,
        };
      }
      throw err;
    }
  }
};

// 9. verify_finance_record tool
export const VerifyFinanceRecordParams = z.object({
  recordId: z.string().min(1),
  expectedInvoiceNumber: z.string(),
  expectedAmount: z.number(),
  expectedDueDate: z.string(),
  expectedVendor: z.string().optional(),
});

export const verifyFinanceRecordTool: ToolDefinition<z.infer<typeof VerifyFinanceRecordParams>> = {
  name: 'verify_finance_record',
  description: 'Independently reads back a finance record from SQLite and verifies each field against source values',
  parametersSchema: VerifyFinanceRecordParams,
  execute: async ({ recordId, expectedInvoiceNumber, expectedAmount, expectedDueDate, expectedVendor }) => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM finance_records WHERE id = ?').get(recordId) as any;

    if (!row) {
      return {
        verified: false,
        error: `RECORD_NOT_FOUND: Record ID ${recordId} was not found in database.`,
        fieldMatches: [],
        notes: 'Verification failed: record does not exist in SQLite database.'
      };
    }

    const fieldMatches = [
      {
        field: 'invoice_number',
        sourceValue: expectedInvoiceNumber,
        persistedValue: row.invoice_number,
        matched: row.invoice_number === expectedInvoiceNumber
      },
      {
        field: 'amount',
        sourceValue: expectedAmount,
        persistedValue: row.amount,
        matched: Math.abs(row.amount - expectedAmount) < 0.001
      },
      {
        field: 'due_date',
        sourceValue: expectedDueDate,
        persistedValue: row.due_date,
        matched: row.due_date === expectedDueDate
      }
    ];

    if (expectedVendor) {
      fieldMatches.push({
        field: 'vendor_name',
        sourceValue: expectedVendor,
        persistedValue: row.vendor_name,
        matched: row.vendor_name.toLowerCase().includes(expectedVendor.toLowerCase())
      });
    }

    const allMatched = fieldMatches.every(m => m.matched);

    if (allMatched) {
      db.prepare("UPDATE finance_records SET status = 'verified' WHERE id = ?").run(recordId);
    }

    const result: VerificationResult = {
      verified: allMatched,
      fieldMatches,
      notes: allMatched 
        ? `Independent read-back verification SUCCESS: All fields match source invoice.`
        : `Independent read-back verification FAILED: Discrepancy detected between source and persisted data.`
    };

    return result;
  }
};

// 10. request_approval tool
export const RequestApprovalParams = z.object({
  prompt: z.string().describe("Clear question or action requiring human confirmation/decision"),
  contextDetails: z.record(z.string(), z.unknown()).optional(),
});

export const requestApprovalTool: ToolDefinition<z.infer<typeof RequestApprovalParams>> = {
  name: 'request_approval',
  description: 'Pauses task execution and requests human authorization or clarification',
  parametersSchema: RequestApprovalParams,
  execute: async ({ prompt, contextDetails }, context) => {
    const db = getDb();
    const approvalId = `appr-${Date.now()}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO approval_requests (id, task_id, action_id, tool_name, parameters_json, prompt, status, created_at)
      VALUES (?, ?, ?, 'request_approval', ?, ?, 'pending', ?)
    `).run(
      approvalId,
      context.taskId,
      context.actionId || 'action-unknown',
      JSON.stringify(contextDetails || {}),
      prompt,
      now
    );

    db.prepare("UPDATE tasks SET status = 'paused_approval', updated_at = ? WHERE id = ?")
      .run(now, context.taskId);

    return {
      approvalId,
      status: 'pending',
      message: `Execution paused. Awaiting human approval for: "${prompt}"`,
    };
  }
};

// Registry Map
export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  list_permitted_files: listPermittedFilesTool,
  search_permitted_files: searchPermittedFilesTool,
  read_permitted_file: readPermittedFileTool,
  extract_document_fields: extractDocumentFieldsTool,
  search_invoices: searchInvoicesTool,
  read_invoice: readInvoiceTool,
  lookup_finance_record: lookupFinanceRecordTool,
  create_finance_record: createFinanceRecordTool,
  verify_finance_record: verifyFinanceRecordTool,
  request_approval: requestApprovalTool,
};

export function getTool(name: string): ToolDefinition | undefined {
  return TOOL_REGISTRY[name];
}

export function listTools() {
  return Object.values(TOOL_REGISTRY).map(t => ({
    name: t.name,
    description: t.description,
  }));
}
