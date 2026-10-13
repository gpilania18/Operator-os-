# OperatorOS — Autonomous Enterprise AI Employee Platform
**CentrAlign AI Founding Engineer Challenge Prototype**

OperatorOS is an autonomous enterprise AI employee platform where users can create named workspaces, ingest company data folders or ZIP archives, govern granular file-level permissions, and execute natural-language business directives against that data with deterministic safety and independent verification.

---

## 🎨 Enterprise Design System

The visual design is built around an enterprise aesthetic:
- **Palette**: Warm off-white and ivory page backgrounds (`#fbfbfa`, `#ffffff`), charcoal and near-black typography (`#1c1d1a`, `#555650`), and a muted sage green accent (`#526658`, hover `#435448`, subtle `#edf1ee`).
- **Typography & Structure**: Clean sans-serif hierarchy, restrained status colors, crisp borders (`#e5e5e0`), and subtle shadows.
- **Persistent Enterprise Sidebar**:
  - **Overview**: Workspace introduction, metric highlights, and quick launch workflows.
  - **AI Tasks**: Natural-language directive console with action plan, tool invocations, observations, and verification outcomes.
  - **Company Data**: Multi-file, directory, and ZIP archive uploader; file tree and list view; document previewer; and deletion controls.
  - **Permissions**: Server-enforced access matrix across read, extract, context, modify, and export capabilities.
  - **Execution History**: Persistent audit trail and historical task records.
  - **Settings**: System configurations, SQLite status, and isolation modes.

---

## 📁 Company Data & Permission Architecture

### 1. Ingestion Engine
- **Supported Formats**: `.txt`, `.md`, `.csv`, `.json`, `.pdf`.
- **Directory Upload**: Native browser folder uploads via `webkitdirectory`.
- **ZIP Archives**: Safe ZIP unpacking using `adm-zip` with path traversal sanitization, file-type filtering, and decompression bomb protection.
- **Application-Controlled Storage**: Files are stored in `data/workspaces/<workspaceId>/`, completely isolated from user-supplied file paths.

### 2. File-Level Permissions Matrix
Permissions are persisted in SQLite and verified on every backend tool invocation:
- **Read**: Allows inspecting the document's content.
- **Extract**: Allows extracting structured data (e.g. invoice numbers, amounts, policy rules).
- **Context**: Allows including document snippets in model task planning.
- **Modify**: Modifying original files (denied by default).
- **Export**: Downloading or exporting documents.

> **Zero Leakage Security Rule**: If read or extract permission is revoked for a document, the AI runtime cannot inspect its contents. The tool call fails with `PERMISSION_DENIED`, and the runtime logs the policy enforcement event, explaining the restriction rather than hallucinating or speculating.

---

## 🤖 Permission-Aware Tools Suite

All actions pass through typed Zod parameter schemas and the server-side permission layer:
1. `list_permitted_files`: Lists all files in the active workspace with active read permissions.
2. `search_permitted_files`: Searches permitted documents by keyword and content relevance.
3. `read_permitted_file`: Reads full document text after verifying server-side read permission.
4. `extract_document_fields`: Extracts structured schemas (invoices, policies, contracts).
5. `lookup_finance_record`: Prevents duplicate writes by querying SQLite before inserting.
6. `create_finance_record`: Persists new records with database unique constraints (`invoice_number UNIQUE`).
7. `verify_finance_record`: Independently reads back persisted records from SQLite and verifies field parity.
8. `request_approval`: Pauses execution and alerts supervisors when ambiguous or consequential data is encountered.

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js v20+ / v22+
- npm v10+

### 2. Environment Configuration
Create `.env.local` using `.env.example`:
```bash
OPENROUTER_API_KEY=your_key_here  # Optional for live model; deterministic fallback included
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Run Automated Test Suite
```bash
npm run test
```
Runs the 12 automated platform tests covering:
- Uploading and indexing supported files.
- ZIP extraction and unsupported file filtering.
- Permitted vs. revoked file reading.
- Cross-workspace isolation.
- General-purpose tasks (leave policy inquiry, contract comparisons).
- Verified invoice processing, transient failure recovery, and idempotency.

### 5. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📋 Recommended Demo Walkthrough

1. **Explore the Workspace**: Open the browser to [http://localhost:3000](http://localhost:3000). The default workspace is loaded with synthetic sample documents:
   - Invoices from Acme Supplies & Beta Technologies.
   - An employee handbook (`employee_handbook_2025.md`).
   - Two vendor contracts (`vendor_contract_acme_corp.md`, `vendor_contract_beta_technologies.md`).
   - A payables ledger (`upcoming_payables_q1.csv`).
2. **Inspect Company Data**:
   - Navigate to **Company Data** in the sidebar.
   - Click on any document (e.g. `employee_handbook_2025.md`) to view metadata, extracted text preview, and granular permissions.
3. **Test Permission Governance**:
   - Navigate to **Permissions** or toggle the `Read` permission for `employee_handbook_2025.md` to **Denied**.
   - Navigate to **AI Tasks** and run:
     > *"Read the employee handbook and summarize the annual leave policy, citing the source file."*
   - Observe the agent attempt to read the file, encounter the server-side permission check, fail safely with an explanatory message, and log the security event.
   - Re-enable the `Read` permission and rerun the task to see it succeed with citations.
4. **Run Verified Finance Task**:
   - Submit:
     > *"Find the latest invoice from Acme Supplies, extract the invoice number, amount and due date, record it in our finance system, and confirm once completed."*
   - Watch the agent identify `INV-10588` ($3,200.50, due 2025-03-31), check for duplicates, persist the record into SQLite, and run independent read-back verification.

---

## 🔒 Security Model & Assumptions

- **Local Demo Identity**: Uses a local demo supervisor model. Multi-tenant production deployments would integrate OAuth2/OIDC.
- **Prompt Injection Defense**: Untrusted document content is treated strictly as data payloads and never interpreted as system policy or model instructions.
- **Zero Arbitrary Execution**: Neither the user nor the model can execute arbitrary bash, powershell, or raw SQL commands.
