import { after, NextResponse } from 'next/server';
import { ApiError, context, failure, check } from '@/lib/api';
import { validateUpload, MAX_FILE_BYTES } from '@/lib/ingestion';
import { timeZone } from '@/lib/jobs/activity-import';
import { kickJobs } from '@/lib/jobs/kick';
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
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const sha256 = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    const tz = timeZone.safeParse(form.get('tz'));
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
      sha256,
    });
    const registered = data as { id: string; duplicate: boolean } | null;
    // A duplicate hash keeps the original object; remove the copy just stored.
    if (registrationError || registered?.duplicate)
      await db.storage.from('activity-files').remove([path]);
    check(registrationError);
    if (!registered) throw new ApiError(500, 'Upload was not registered.');
    // The upload ID is the idempotency key, so a repeated file never creates a second job.
    const { data: jobId, error: jobError } = await db.rpc('enqueue_job', {
      p_kind: 'activity_import',
      p_payload: {
        upload_id: registered.id,
        ...(tz.success ? { tz: tz.data } : {}),
      },
      p_key: registered.id,
    });
    check(jobError);
    after(() => kickJobs(['activity_import']));
    return NextResponse.json(
      {
        id: registered.id,
        job_id: jobId,
        duplicate: registered.duplicate,
        status: 'queued',
        message: registered.duplicate
          ? 'This exact file was uploaded before; showing its existing import.'
          : 'Uploaded. Processing has started; the activity appears when it finishes.',
      },
      { status: 202 },
    );
  } catch (e) {
    return failure(e);
  }
}
