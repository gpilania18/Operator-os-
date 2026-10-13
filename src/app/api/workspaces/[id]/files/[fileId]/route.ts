import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { updateFilePermissions } from '@/lib/permissions';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { id, fileId } = await params;
  const db = getDb();

  const file = db.prepare(`
    SELECT wf.*, 
           fp.perm_read, fp.perm_extract, fp.perm_context, fp.perm_modify, fp.perm_export
    FROM workspace_files wf
    LEFT JOIN file_permissions fp ON wf.id = fp.file_id
    WHERE wf.id = ? AND wf.workspace_id = ?
  `).get(fileId, id) as any;

  if (!file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  return NextResponse.json({
    file: {
      id: file.id,
      workspaceId: file.workspace_id,
      filename: file.filename,
      relativePath: file.relative_path,
      fileType: file.file_type,
      fileSize: file.file_size,
      extractedText: file.extracted_text,
      ingestionStatus: file.ingestion_status,
      ingestionError: file.ingestion_error,
      uploadedAt: file.uploaded_at,
      permissions: {
        read: file.perm_read === 1,
        extract: file.perm_extract === 1,
        context: file.perm_context === 1,
        modify: file.perm_modify === 1,
        export: file.perm_export === 1,
      }
    }
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { id, fileId } = await params;

  try {
    const body = await req.json();
    const { permissions } = body;

    if (!permissions) {
      return NextResponse.json({ error: 'Permissions object required' }, { status: 400 });
    }

    const updated = updateFilePermissions(id, fileId, permissions);

    return NextResponse.json({
      success: true,
      fileId,
      permissions: updated,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { id, fileId } = await params;
  const db = getDb();

  const result = db.prepare('DELETE FROM workspace_files WHERE id = ? AND workspace_id = ?').run(fileId, id);
  if (result.changes === 0) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, message: `File ${fileId} deleted from workspace` });
}
