import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ingestFile, ingestZipArchive } from '@/lib/ingestion';
import { seedWorkspaceDocuments } from '@/lib/seed';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  // If loading default workspace and empty, seed it
  if (id === 'default') {
    seedWorkspaceDocuments('default');
  }

  const files = db.prepare(`
    SELECT wf.*, 
           fp.perm_read, fp.perm_extract, fp.perm_context, fp.perm_modify, fp.perm_export
    FROM workspace_files wf
    LEFT JOIN file_permissions fp ON wf.id = fp.file_id
    WHERE wf.workspace_id = ?
    ORDER BY wf.uploaded_at DESC
  `).all(id) as any[];

  return NextResponse.json({
    workspaceId: id,
    files: files.map(f => ({
      id: f.id,
      workspaceId: f.workspace_id,
      filename: f.filename,
      relativePath: f.relative_path,
      fileType: f.file_type,
      fileSize: f.file_size,
      extractedText: f.extracted_text,
      ingestionStatus: f.ingestion_status,
      ingestionError: f.ingestion_error,
      uploadedAt: f.uploaded_at,
      permissions: {
        read: f.perm_read === 1,
        extract: f.perm_extract === 1,
        context: f.perm_context === 1,
        modify: f.perm_modify === 1,
        export: f.perm_export === 1,
      }
    }))
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    const isZip = formData.get('isZip') === 'true';

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const ingested = [];
    const errors = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const filename = file.name;
      const relativePath = (file as any).webkitRelativePath || filename;

      if (isZip || filename.toLowerCase().endsWith('.zip')) {
        const result = await ingestZipArchive(id, buffer);
        ingested.push(...result.ingested);
        if (result.skipped.length > 0) {
          errors.push(...result.skipped);
        }
      } else {
        try {
          const rec = await ingestFile(id, filename, relativePath, buffer);
          ingested.push(rec);
        } catch (err: any) {
          errors.push(`${filename}: ${err.message}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      ingestedCount: ingested.length,
      ingested,
      errors,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
