'use client';
import { useState } from 'react';
import { Card, Button, Input, ErrorState } from '@km/ui';
import { MAX_FILE_BYTES } from '@/lib/ingestion';
export function UploadForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  return (
    <Card>
      <h2>Bring your file.</h2>
      <p className="muted">
        Secure GPX / FIT storage, up to 5 MB. Files remain pending; importing
        activity metrics and GPS geometry is reserved for Phase 2.
      </p>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const body = new FormData(form);
          const file = body.get('file');
          setError('');
          setMessage('');
          if (!(file instanceof File) || file.size > MAX_FILE_BYTES) {
            setError('Choose a GPX or FIT file up to 5 MB.');
            return;
          }
          setBusy(true);
          try {
            const response = await fetch('/api/uploads', {
              method: 'POST',
              body,
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Upload failed.');
            setMessage(result.message);
            form.reset();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Upload failed.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Activity file
          <Input name="file" type="file" accept=".gpx,.fit" required />
        </label>
        {error && <ErrorState message={error} />}
        <Button variant="outline" disabled={busy}>
          {busy ? 'Uploading…' : 'Store file for future processing'}
        </Button>
        {message && <p role="status">{message}</p>}
      </form>
    </Card>
  );
}
