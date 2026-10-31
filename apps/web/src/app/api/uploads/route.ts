import { NextResponse } from 'next/server';
import { ApiError, context, failure, check } from '@/lib/api';
import { validateUpload, MAX_FILE_BYTES } from '@/lib/ingestion';
export async function POST(request: Request) {
  try {
    const { db, user } = await context(request);
    const reader = request.body?.getReader();
    if (!reader) throw new ApiError(400, 'Missing file.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_FILE_BYTES + 65536) {
        await reader.cancel();
        throw new ApiError(413, 'Upload exceeds 5 MB.');
      }
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }
    const form = await new Response(body, {
      headers: { 'Content-Type': request.headers.get('Content-Type') || '' },
    }).formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new ApiError(400, 'Choose a file.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    let format: 'gpx' | 'fit';
    try {
      format = validateUpload(file.name, bytes);
    } catch (e) {
      throw new ApiError(400, e instanceof Error ? e.message : 'Invalid file.');
    }
    const path = user.id + '/' + crypto.randomUUID() + '.' + format;
    const { error } = await db.storage
      .from('activity-files')
      .upload(path, bytes, {
        contentType:
          format === 'gpx' ? 'application/gpx+xml' : 'application/octet-stream',
        upsert: false,
      });
    check(error);
    const { data, error: registrationError } = await db.rpc('register_upload', {
      filename: file.name,
      format,
      size_bytes: bytes.length,
      object_path: path,
    });
    if (registrationError) {
      await db.storage.from('activity-files').remove([path]);
      check(registrationError);
    }
    return NextResponse.json(
      {
        id: data,
        status: 'pending',
        message:
          'Stored securely. Activity extraction is not available in Phase 1.',
      },
      { status: 202 },
    );
  } catch (e) {
    return failure(e);
  }
}
