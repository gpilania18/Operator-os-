import { getDb } from './db';
import { InvoiceSeed } from '../types';

export const SEEDED_INVOICES: InvoiceSeed[] = [
  {
    id: 'inv-acme-001',
    filename: 'acme_supplies_inv_10492_jan.txt',
    vendor: 'Acme Supplies',
    invoiceNumber: 'INV-10492',
    amount: 1450.00,
    currency: 'USD',
    date: '2025-01-15',
    dueDate: '2025-02-15',
    status: 'valid',
    rawText: `================================================
ACME SUPPLIES CORP - INVOICE
================================================
Invoice Number: INV-10492
Date: 2025-01-15
Due Date: 2025-02-15
Customer: Enterprise Solutions LLC

Items:
1. Industrial Cleaning Supplies (x10) - $450.00
2. Safety Equipment & Helmets (x20)  - $1,000.00
------------------------------------------------
Subtotal: $1,450.00
Tax: $0.00
Total Balance Due: $1,450.00 USD
Payment instructions: ACH to Acme Supplies Account #982312
================================================`
  },
  {
    id: 'inv-acme-002',
    filename: 'acme_supplies_inv_10588_mar.txt',
    vendor: 'Acme Supplies',
    invoiceNumber: 'INV-10588',
    amount: 3200.50,
    currency: 'USD',
    date: '2025-03-01',
    dueDate: '2025-03-31',
    status: 'valid',
    rawText: `================================================
ACME SUPPLIES CORP - INVOICE
================================================
Invoice Number: INV-10588
Date: 2025-03-01
Due Date: 2025-03-31
Customer: Enterprise Solutions LLC

Items:
1. High-Grade Warehouse Storage Shelving - $2,500.00
2. Pallet Jack Heavy Duty - $700.50
------------------------------------------------
Subtotal: $3,200.50
Tax: $0.00
Total Balance Due: $3,200.50 USD
Payment instructions: ACH to Acme Supplies Account #982312
================================================`
  },
  {
    id: 'inv-acme-003-ambiguous',
    filename: 'acme_supplies_inv_10601_missing_due.txt',
    vendor: 'Acme Supplies',
    invoiceNumber: 'INV-10601',
    amount: 890.00,
    currency: 'USD',
    date: '2025-02-10',
    dueDate: '', // Deliberately missing due date for ambiguity test scenario
    status: 'missing_due_date',
    rawText: `================================================
ACME SUPPLIES CORP - INVOICE (SPECIAL DRAFT)
================================================
Invoice Number: INV-10601
Date: 2025-03-10
Due Date: UPON_MUTUAL_AGREEMENT
Customer: Enterprise Solutions LLC

Items:
1. Specialty Ergonomic Chairs (x3) - $890.00
------------------------------------------------
Subtotal: $890.00
Tax: $0.00
Total Balance Due: $890.00 USD
Note: Net terms pending credit department verification.
================================================`
  },
  {
    id: 'inv-beta-001',
    filename: 'beta_tech_inv_8821.txt',
    vendor: 'Beta Technologies',
    invoiceNumber: 'BETA-8821',
    amount: 5400.00,
    currency: 'USD',
    date: '2025-02-20',
    dueDate: '2025-03-20',
    status: 'valid',
    rawText: `================================================
BETA TECHNOLOGIES INC. - OFFICIAL BILL
================================================
Invoice Number: BETA-8821
Date: 2025-02-20
Due Date: 2025-03-20
Customer: Enterprise Solutions LLC

Items:
1. Enterprise Cloud Subscription - Feb 2025 - $5,400.00
------------------------------------------------
Total Balance Due: $5,400.00 USD
Payment: Wire to Beta Tech Wells Fargo #112358
================================================`
  },
  {
    id: 'inv-beta-002',
    filename: 'beta_tech_inv_9100.txt',
    vendor: 'Beta Technologies',
    invoiceNumber: 'BETA-9100',
    amount: 7200.00,
    currency: 'USD',
    date: '2025-03-15',
    dueDate: '2025-04-15',
    status: 'valid',
    rawText: `================================================
BETA TECHNOLOGIES INC. - OFFICIAL BILL
================================================
Invoice Number: BETA-9100
Date: 2025-03-15
Due Date: 2025-04-15
Customer: Enterprise Solutions LLC

Items:
1. Enterprise Cloud Subscription - Mar 2025 - $5,400.00
2. Dedicated GPU Cluster Add-on             - $1,800.00
------------------------------------------------
Total Balance Due: $7,200.00 USD
Payment: Wire to Beta Tech Wells Fargo #112358
================================================`
  }
];

export const SAMPLE_COMPANY_DOCUMENTS = [
  {
    filename: 'acme_supplies_inv_10492_jan.txt',
    relativePath: 'finance/invoices/acme_supplies_inv_10492_jan.txt',
    content: SEEDED_INVOICES[0].rawText,
    fileType: 'TXT',
  },
  {
    filename: 'acme_supplies_inv_10588_mar.txt',
    relativePath: 'finance/invoices/acme_supplies_inv_10588_mar.txt',
    content: SEEDED_INVOICES[1].rawText,
    fileType: 'TXT',
  },
  {
    filename: 'acme_supplies_inv_10601_missing_due.txt',
    relativePath: 'finance/invoices/acme_supplies_inv_10601_missing_due.txt',
    content: SEEDED_INVOICES[2].rawText,
    fileType: 'TXT',
  },
  {
    filename: 'beta_tech_inv_9100.txt',
    relativePath: 'finance/invoices/beta_tech_inv_9100.txt',
    content: SEEDED_INVOICES[4].rawText,
    fileType: 'TXT',
  },
  {
    filename: 'employee_handbook_2025.md',
    relativePath: 'hr/employee_handbook_2025.md',
    content: `# GlobalTech Enterprises - Employee Handbook (2025 Edition)
*Synthetic Demo Document - For AI Employee Testing*

## Section 4: Paid Time Off and Leave Policies
### 4.1 Annual Vacation Leave
All full-time permanent employees accrue annual vacation leave based on tenure:
- Years 1 through 3: 20 standard business days per calendar year.
- Years 4 through 7: 25 standard business days per calendar year.
- Years 8+: 30 standard business days per calendar year.

Leave must be requested at least 14 days in advance through the HR portal. A maximum of 5 unused leave days can be rolled over into Q1 of the following calendar year.

### 4.2 Sick and Medical Leave
Employees receive 10 paid medical leave days per year. Consecutive absences exceeding 3 business days require a medical certificate.

### 4.3 Parental Leave
Primary caregivers are entitled to 16 weeks of fully paid parental leave, taken within the first 12 months following birth or adoption.
`,
    fileType: 'MD',
  },
  {
    filename: 'vendor_contract_acme_corp.md',
    relativePath: 'contracts/vendor_contract_acme_corp.md',
    content: `# MASTER SERVICES AGREEMENT: ACME SUPPLIES CORP
*Executed on: 2024-11-01*
*Synthetic Demo Document*

## Article 5: Invoicing and Payment Terms
- **Payment Terms**: Net 30 days from date of valid invoice receipt.
- **Late Payment Penalty**: 1.5% interest per month on overdue balances.
- **Currency**: United States Dollars (USD).
- **Early Settlement Discount**: 2% discount if settled within 10 calendar days (2/10 Net 30).
- **Payment Method**: Corporate ACH transfer to Acme designated account.
`,
    fileType: 'MD',
  },
  {
    filename: 'vendor_contract_beta_technologies.md',
    relativePath: 'contracts/vendor_contract_beta_technologies.md',
    content: `# MASTER SERVICES AGREEMENT: BETA TECHNOLOGIES INC
*Executed on: 2024-12-15*
*Synthetic Demo Document*

## Article 4: Billing Schedule & Remittance
- **Payment Terms**: Net 45 days upon receipt of electronic billing statement.
- **Late Payment Penalty**: Fixed $150 late administration fee plus statutory 1.0% per 30-day period.
- **Currency**: United States Dollars (USD).
- **Early Settlement Discount**: No early discount offered.
- **Payment Method**: Bank Wire transfer only to Wells Fargo routing #112358.
`,
    fileType: 'MD',
  },
  {
    filename: 'upcoming_payables_q1.csv',
    relativePath: 'finance/reports/upcoming_payables_q1.csv',
    content: `invoice_number,vendor,amount,currency,due_date,status
INV-10492,Acme Supplies,1450.00,USD,2025-02-15,settled
INV-10588,Acme Supplies,3200.50,USD,2025-03-31,pending
BETA-8821,Beta Technologies,5400.00,USD,2025-03-20,pending
BETA-9100,Beta Technologies,7200.00,USD,2025-04-15,pending
`,
    fileType: 'CSV',
  }
];

export function seedInvoices(): void {
  const db = getDb();
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO invoices (id, filename, vendor, invoice_number, amount, currency, date, due_date, raw_text, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const inv of SEEDED_INVOICES) {
      insertStmt.run(
        inv.id,
        inv.filename,
        inv.vendor,
        inv.invoiceNumber,
        inv.amount,
        inv.currency,
        inv.date,
        inv.dueDate,
        inv.rawText,
        inv.status
      );
    }
  });

  tx();
}

export function seedWorkspaceDocuments(workspaceId: string = 'default'): void {
  const db = getDb();
  const now = new Date().toISOString();

  // Check if workspace already has files
  const existingFiles = db.prepare('SELECT COUNT(*) as cnt FROM workspace_files WHERE workspace_id = ?').get(workspaceId) as any;
  if (existingFiles && existingFiles.cnt > 0) {
    return; // Do not overwrite user-uploaded files
  }

  const insertFile = db.prepare(`
    INSERT INTO workspace_files (id, workspace_id, filename, relative_path, file_type, file_size, extracted_text, ingestion_status, uploaded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'ready', ?)
  `);

  const insertPerms = db.prepare(`
    INSERT INTO file_permissions (file_id, workspace_id, perm_read, perm_extract, perm_context, perm_modify, perm_export, updated_at)
    VALUES (?, ?, 1, 1, 1, 0, 1, ?)
  `);

  const tx = db.transaction(() => {
    for (let i = 0; i < SAMPLE_COMPANY_DOCUMENTS.length; i++) {
      const doc = SAMPLE_COMPANY_DOCUMENTS[i];
      const fileId = `doc-${workspaceId}-${i + 1}`;
      insertFile.run(
        fileId,
        workspaceId,
        doc.filename,
        doc.relativePath,
        doc.fileType,
        Buffer.byteLength(doc.content, 'utf-8'),
        doc.content,
        now
      );
      insertPerms.run(fileId, workspaceId, now);
    }
  });

  tx();
}
