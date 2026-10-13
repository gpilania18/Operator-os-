import { getDb } from './db';
import { WorkspaceFileRecord, FilePermissions, PermissionAction } from '../types';

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  file?: WorkspaceFileRecord;
}

export function checkFilePermission(
  workspaceId: string,
  fileId: string,
  action: PermissionAction
): PermissionCheckResult {
  const db = getDb();

  // 1. Verify file exists in this exact workspace (prevent cross-workspace access)
  const fileRow = db.prepare(`
    SELECT wf.*, 
           fp.perm_read, fp.perm_extract, fp.perm_context, fp.perm_modify, fp.perm_export
    FROM workspace_files wf
    LEFT JOIN file_permissions fp ON wf.id = fp.file_id
    WHERE wf.id = ? AND wf.workspace_id = ?
  `).get(fileId, workspaceId) as any;

  if (!fileRow) {
    return {
      allowed: false,
      reason: `PERMISSION_DENIED: File '${fileId}' does not exist in workspace '${workspaceId}' or cross-workspace access was attempted.`,
    };
  }

  const permissions: FilePermissions = {
    read: fileRow.perm_read === 1,
    extract: fileRow.perm_extract === 1,
    context: fileRow.perm_context === 1,
    modify: fileRow.perm_modify === 1,
    export: fileRow.perm_export === 1,
  };

  const file: WorkspaceFileRecord = {
    id: fileRow.id,
    workspaceId: fileRow.workspace_id,
    filename: fileRow.filename,
    relativePath: fileRow.relative_path,
    fileType: fileRow.file_type,
    fileSize: fileRow.file_size,
    extractedText: fileRow.extracted_text,
    ingestionStatus: fileRow.ingestion_status,
    ingestionError: fileRow.ingestion_error,
    uploadedAt: fileRow.uploaded_at,
    permissions,
  };

  // Check specific permission
  const isPermitted = permissions[action];
  if (!isPermitted) {
    return {
      allowed: false,
      reason: `PERMISSION_DENIED: Action '${action}' is revoked for file '${file.filename}' (File ID: ${file.id}) under workspace security policy.`,
      file,
    };
  }

  return {
    allowed: true,
    file,
  };
}

export function updateFilePermissions(
  workspaceId: string,
  fileId: string,
  permissions: Partial<FilePermissions>
): FilePermissions {
  const db = getDb();

  // Verify file belongs to workspace
  const file = db.prepare('SELECT id FROM workspace_files WHERE id = ? AND workspace_id = ?').get(fileId, workspaceId);
  if (!file) {
    throw new Error(`File '${fileId}' not found in workspace '${workspaceId}'`);
  }

  const current = db.prepare('SELECT * FROM file_permissions WHERE file_id = ?').get(fileId) as any;
  const now = new Date().toISOString();

  const permRead = permissions.read !== undefined ? (permissions.read ? 1 : 0) : (current ? current.perm_read : 1);
  const permExtract = permissions.extract !== undefined ? (permissions.extract ? 1 : 0) : (current ? current.perm_extract : 1);
  const permContext = permissions.context !== undefined ? (permissions.context ? 1 : 0) : (current ? current.perm_context : 1);
  const permModify = permissions.modify !== undefined ? (permissions.modify ? 1 : 0) : (current ? current.perm_modify : 0);
  const permExport = permissions.export !== undefined ? (permissions.export ? 1 : 0) : (current ? current.perm_export : 1);

  db.prepare(`
    INSERT INTO file_permissions (file_id, workspace_id, perm_read, perm_extract, perm_context, perm_modify, perm_export, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_id) DO UPDATE SET
      perm_read = excluded.perm_read,
      perm_extract = excluded.perm_extract,
      perm_context = excluded.perm_context,
      perm_modify = excluded.perm_modify,
      perm_export = excluded.perm_export,
      updated_at = excluded.updated_at
  `).run(fileId, workspaceId, permRead, permExtract, permContext, permModify, permExport, now);

  return {
    read: permRead === 1,
    extract: permExtract === 1,
    context: permContext === 1,
    modify: permModify === 1,
    export: permExport === 1,
  };
}
