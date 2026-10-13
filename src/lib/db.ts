import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let dbInstance: Database.Database | null = null;

export function getDatabasePath(): string {
  if (process.env.OPERATOR_DB_PATH) {
    return process.env.OPERATOR_DB_PATH;
  }
  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, 'operator.db');
}

export function getWorkspacesDir(): string {
  const dir = path.resolve(process.cwd(), 'data', 'workspaces');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getDb(): Database.Database {
  if (!dbInstance) {
    const dbPath = getDatabasePath();
    dbInstance = new Database(dbPath);
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('foreign_keys = ON');
    initSchema(dbInstance);
  }
  return dbInstance;
}

export function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_files (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      extracted_text TEXT NOT NULL,
      ingestion_status TEXT NOT NULL DEFAULT 'ready',
      ingestion_error TEXT,
      uploaded_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS file_permissions (
      file_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      perm_read INTEGER NOT NULL DEFAULT 1,
      perm_extract INTEGER NOT NULL DEFAULT 1,
      perm_context INTEGER NOT NULL DEFAULT 1,
      perm_modify INTEGER NOT NULL DEFAULT 0,
      perm_export INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (file_id) REFERENCES workspace_files(id) ON DELETE CASCADE,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      workspace_id TEXT DEFAULT 'default',
      user_prompt TEXT NOT NULL,
      status TEXT NOT NULL,
      goal TEXT NOT NULL,
      constraints_json TEXT NOT NULL,
      completion_criteria_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      error TEXT,
      summary TEXT
    );

    CREATE TABLE IF NOT EXISTS planned_actions (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      step_number INTEGER NOT NULL,
      tool_name TEXT NOT NULL,
      parameters_json TEXT NOT NULL,
      expected_outcome TEXT NOT NULL,
      status TEXT NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      output_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS finance_records (
      id TEXT PRIMARY KEY,
      invoice_number TEXT NOT NULL UNIQUE,
      vendor_name TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      due_date TEXT NOT NULL,
      invoice_date TEXT NOT NULL,
      source_file TEXT NOT NULL,
      task_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'recorded'
    );

    CREATE TABLE IF NOT EXISTS execution_logs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      action_id TEXT,
      timestamp TEXT NOT NULL,
      level TEXT NOT NULL,
      phase TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata_json TEXT,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS approval_requests (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      action_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      parameters_json TEXT NOT NULL,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      reason TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      vendor TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'valid'
    );
  `);

  // Create default workspace if not present
  const defaultWs = db.prepare('SELECT id FROM workspaces WHERE id = ?').get('default');
  if (!defaultWs) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO workspaces (id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      'default',
      'Corporate Headquarters (Main)',
      'Primary workspace containing enterprise company data, financial documents, and operational policies.',
      now,
      now
    );
  }
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
