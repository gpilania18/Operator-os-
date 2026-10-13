import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';
import { getDb, getWorkspacesDir } from './db';
import { WorkspaceFileRecord, FilePermissions } from '../types';

export const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.csv', '.json', '.pdf'];
export const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB limit

export function sanitizePath(targetPath: string): string {
  // Prevent directory traversal attacks like ../ or \..\
  const normalized = path.normalize(targetPath).replace(/^(\.\.[\/\\])+/, '');
  return normalized.replace(/^[a-zA-Z]:[/\\]/, '').replace(/^[\/\\]+/, '');
}

export function extractTextContent(filename: string, buffer: Buffer): string {
  const ext = path.extname(filename).toLowerCase();

  if (ext === '.txt' || ext === '.md' || ext === '.csv') {
    return buffer.toString('utf-8');
  }

  if (ext === '.json') {
    try {
      const parsed = JSON.parse(buffer.toString('utf-8'));
      return JSON.stringify(parsed, null, 2);
    } catch {
      return buffer.toString('utf-8');
    }
  }

  if (ext === '.pdf') {
    // Basic text extraction for text-stream based PDFs
    const raw = buffer.toString('latin1');
    const textMatches: string[] = [];
    const regex = /\(([^)]+)\)\s*Tj/g;
    let match;
    while ((match = regex.exec(raw)) !== null) {
      textMatches.push(match[1]);
    }
    if (textMatches.length > 0) {
      return textMatches.join(' ');
    }
    // Fallback printable ASCII extraction
    const printable = raw.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ');
    return printable.slice(0, 10000);
  }

  return buffer.toString('utf-8');
}

export async function ingestFile(
  workspaceId: string,
  filename: string,
  relativePath: string,
  buffer: Buffer,
  initialPermissions?: Partial<FilePermissions>
): Promise<WorkspaceFileRecord> {
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File size ${buffer.length} exceeds max allowed limit of ${MAX_FILE_SIZE} bytes`);
  }

  const ext = path.extname(filename).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported file extension '${ext}'. Supported formats: ${SUPPORTED_EXTENSIONS.join(', ')}`);
  }

  const sanitizedRelative = sanitizePath(relativePath || filename);
  const fileId = `file-${workspaceId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  // Save to application-controlled storage directory
  const wsStorageDir = path.join(getWorkspacesDir(), workspaceId);
  if (!fs.existsSync(wsStorageDir)) {
    fs.mkdirSync(wsStorageDir, { recursive: true });
  }

  const destinationPath = path.join(wsStorageDir, `${fileId}_${path.basename(filename)}`);
  fs.writeFileSync(destinationPath, buffer);

  // Extract structured / readable text
  let extractedText = '';
  let ingestionStatus: 'ready' | 'failed' = 'ready';
  let ingestionError: string | null = null;

  try {
    extractedText = extractTextContent(filename, buffer);
  } catch (err: any) {
    ingestionStatus = 'failed';
    ingestionError = err.message || 'Failed to extract text';
  }

  const db = getDb();
  db.prepare(`
    INSERT INTO workspace_files (id, workspace_id, filename, relative_path, file_type, file_size, extracted_text, ingestion_status, ingestion_error, uploaded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    fileId,
    workspaceId,
    path.basename(filename),
    sanitizedRelative,
    ext.replace('.', '').toUpperCase(),
    buffer.length,
    extractedText,
    ingestionStatus,
    ingestionError,
    now
  );

  // Default permissions: read, extract, context, export = true; modify = false
  const defaultPerms: FilePermissions = {
    read: initialPermissions?.read !== undefined ? initialPermissions.read : true,
    extract: initialPermissions?.extract !== undefined ? initialPermissions.extract : true,
    context: initialPermissions?.context !== undefined ? initialPermissions.context : true,
    modify: initialPermissions?.modify !== undefined ? initialPermissions.modify : false,
    export: initialPermissions?.export !== undefined ? initialPermissions.export : true,
  };

  db.prepare(`
    INSERT INTO file_permissions (file_id, workspace_id, perm_read, perm_extract, perm_context, perm_modify, perm_export, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    fileId,
    workspaceId,
    defaultPerms.read ? 1 : 0,
    defaultPerms.extract ? 1 : 0,
    defaultPerms.context ? 1 : 0,
    defaultPerms.modify ? 1 : 0,
    defaultPerms.export ? 1 : 0,
    now
  );

  return {
    id: fileId,
    workspaceId,
    filename: path.basename(filename),
    relativePath: sanitizedRelative,
    fileType: ext.replace('.', '').toUpperCase(),
    fileSize: buffer.length,
    extractedText,
    ingestionStatus,
    ingestionError,
    uploadedAt: now,
    permissions: defaultPerms,
  };
}

export async function ingestZipArchive(
  workspaceId: string,
  zipBuffer: Buffer
): Promise<{ ingested: WorkspaceFileRecord[]; skipped: string[] }> {
  const zip = new AdmZip(zipBuffer);
  const zipEntries = zip.getEntries();
  const ingested: WorkspaceFileRecord[] = [];
  const skipped: string[] = [];

  for (const entry of zipEntries) {
    if (entry.isDirectory) continue;

    const entryName = entry.entryName;
    // Security: Check path traversal
    if (entryName.includes('..') || path.isAbsolute(entryName)) {
      skipped.push(`${entryName} (invalid path traversal attempt)`);
      continue;
    }

    const ext = path.extname(entryName).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      skipped.push(`${entryName} (unsupported file type ${ext})`);
      continue;
    }

    const data = entry.getData();
    if (data.length > MAX_FILE_SIZE) {
      skipped.push(`${entryName} (exceeds max size)`);
      continue;
    }

    try {
      const record = await ingestFile(workspaceId, path.basename(entryName), entryName, data);
      ingested.push(record);
    } catch (err: any) {
      skipped.push(`${entryName} (${err.message})`);
    }
  }

  return { ingested, skipped };
}
