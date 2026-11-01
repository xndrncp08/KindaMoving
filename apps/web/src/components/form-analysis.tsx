'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Button,
  Card,
  DataTable,
  ErrorState,
  Input,
  Skeleton,
  ConfirmButton,
} from '@km/ui';
import { api, keys } from '@/lib/queries';
import { browserSupabase } from '@/lib/supabase/client';
type Stat = { median: number; p10: number; p90: number; n: number } | null;
interface Analysis {
  id: string;
  label: string;
  status: 'queued' | 'processing' | 'complete' | 'failed';
  error: string | null;
  annotated_path: string | null;
  expires_at: string;
  created_at: string;
  result: {
    usable: boolean;
    metrics: Record<
      string,
      Stat | { steps_per_min: number; confidence: number } | null
    >;
    quality: {
      detection_rate: number;
      mean_visibility: number;
      fps: number;
      duration_s: number;
      view: string;
      resolution: number[];
    };
    warnings: string[];
    disclaimer: string;
  } | null;
}
const ROWS: [string, string, string][] = [
  ['cadence', 'Cadence', 'spm'],
  ['step_time_s', 'Step time', 's'],
  ['knee_at_contact', 'Knee angle at foot contact', '°'],
  ['trunk_lean', 'Forward trunk lean', '°'],
  ['knee_l', 'Knee angle (left, all frames)', '°'],
  ['knee_r', 'Knee angle (right, all frames)', '°'],
  ['elbow_l', 'Elbow angle (left)', '°'],
  ['elbow_r', 'Elbow angle (right)', '°'],
];
function cell(a: Analysis, key: string, unit: string) {
  const v = a.result?.metrics[key];
  if (!v) return '—';
  if ('steps_per_min' in v)
    return `${v.steps_per_min} ${unit} (confidence ${v.confidence})`;
  return `${v.median} ${unit} (${v.p10}–${v.p90})`;
}
function Video({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ['form-video', id],
    queryFn: () => api<{ url: string }>('form/' + id),
    staleTime: 300000,
    retry: false,
  });
  if (q.error) return <p className="muted">{q.error.message}</p>;
  return q.data ? (
    <video
      src={q.data.url}
      controls
      playsInline
      muted
      style={{ width: '100%', borderRadius: 8 }}
    />
  ) : (
    <Skeleton />
  );
}
export function FormAnalysis({ userId }: { userId: string }) {
  const client = useQueryClient();
  const [label, setLabel] = useState('');
  const [progress, setProgress] = useState('');
  const [compare, setCompare] = useState<string[]>([]);
  const list = useQuery({
    queryKey: keys.resource(userId, 'form'),
    queryFn: () => api<Analysis[]>('form'),
    refetchInterval: (q) =>
      q.state.data?.some(
        (a) => a.status === 'queued' || a.status === 'processing',
      )
        ? 4000
        : false,
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!['mp4', 'mov', 'm4v'].includes(ext ?? ''))
        throw new Error('Use an MP4 or MOV video.');
      if (file.size > 50 * 1024 * 1024)
        throw new Error('Videos are limited to 50 MB; trim to 10–20 seconds.');
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      setProgress('Uploading…');
      // Direct to private storage under the user's own folder (storage RLS enforces it).
      const { error } = await browserSupabase()
        .storage.from('form-videos')
        .upload(path, file, { contentType: file.type || 'video/mp4' });
      if (error) throw new Error('Upload failed: ' + error.message);
      setProgress('Queued for analysis…');
      return api<{ id: string }>('form', {
        method: 'POST',
        body: JSON.stringify({ path, label }),
      });
    },
    onSuccess: () => {
      setLabel('');
      void client.invalidateQueries({
        queryKey: keys.resource(userId, 'form'),
      });
    },
    onSettled: () => setProgress(''),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api('form/' + id, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Deleted, including the video.');
      void client.invalidateQueries({
        queryKey: keys.resource(userId, 'form'),
      });
    },
  });
  const pair = (list.data ?? []).filter(
    (a) => compare.includes(a.id) && a.result?.usable,
  );
  return (
    <div className="stack">
      <Card>
        <h2>Analyse a short clip</h2>
        <ul className="muted">
          <li>
            Film from the side, camera at hip height and level, 3–5 m away, the
            whole body in frame.
          </li>
          <li>
            10–20 seconds of steady running (a treadmill works well). 30 fps
            minimum; 60 fps or more is better.
          </li>
          <li>
            Your original video is deleted as soon as analysis finishes. The
            annotated copy has faces blurred and is deleted after 7 days.
          </li>
        </ul>
        <div className="row">
          <label>
            Label
            <Input
              value={label}
              maxLength={120}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Treadmill, easy pace"
            />
          </label>
          <label>
            Video
            <Input
              type="file"
              accept="video/mp4,video/quicktime,.mp4,.mov,.m4v"
              disabled={upload.isPending}
              onChange={(e) =>
                e.target.files?.[0] && upload.mutate(e.target.files[0])
              }
            />
          </label>
        </div>
        {progress && <p role="status">{progress}</p>}
        {upload.error && <ErrorState message={upload.error.message} />}
      </Card>
      {list.isPending && <Skeleton />}
      {pair.length === 2 && (
        <Card>
          <h2>Side by side</h2>
          <div className="grid two">
            {pair.map((a) =>
              a.annotated_path ? (
                <Video key={a.id} id={a.id} />
              ) : (
                <p key={a.id} className="muted">
                  Video expired.
                </p>
              ),
            )}
          </div>
          <DataTable
            headers={[
              '',
              pair[0].label || pair[0].created_at.slice(0, 10),
              pair[1].label || pair[1].created_at.slice(0, 10),
            ]}
          >
            {ROWS.map(([k, name, unit]) => (
              <tr key={k}>
                <td>{name}</td>
                <td>{cell(pair[0], k, unit)}</td>
                <td>{cell(pair[1], k, unit)}</td>
              </tr>
            ))}
          </DataTable>
          <p className="muted">
            Compare only clips filmed the same way; camera angle and distance
            change the numbers.
          </p>
        </Card>
      )}
      {list.data?.map((a) => (
        <Card key={a.id}>
          <p className="eyebrow">
            {a.label || 'Untitled'} · {new Date(a.created_at).toLocaleString()}{' '}
            · {a.status}
          </p>
          {a.status === 'failed' && (
            <ErrorState message={a.error ?? 'Analysis failed.'} />
          )}
          {a.result && (
            <>
              <p className="muted">
                {a.result.quality.duration_s}s at {a.result.quality.fps} fps,{' '}
                {a.result.quality.resolution.join('×')} · view:{' '}
                {a.result.quality.view.replace(/_/g, ' ')} · runner detected in{' '}
                {Math.round(a.result.quality.detection_rate * 100)}% of frames
              </p>
              {a.result.warnings.map((w) => (
                <p key={w} className="notice">
                  {w}
                </p>
              ))}
              {a.result.usable ? (
                <DataTable
                  headers={['Measure', 'Median (10th–90th percentile)']}
                >
                  {ROWS.map(([k, name, unit]) => (
                    <tr key={k}>
                      <td>{name}</td>
                      <td>{cell(a, k, unit)}</td>
                    </tr>
                  ))}
                </DataTable>
              ) : (
                <p>Not enough reliable pose data to report measurements.</p>
              )}
              <p className="muted">{a.result.disclaimer}</p>
              {a.annotated_path && <Video id={a.id} />}
            </>
          )}
          <div className="row">
            {a.result?.usable && (
              <label>
                <input
                  type="checkbox"
                  checked={compare.includes(a.id)}
                  onChange={() =>
                    setCompare((c) =>
                      c.includes(a.id)
                        ? c.filter((x) => x !== a.id)
                        : [...c.slice(-1), a.id],
                    )
                  }
                />{' '}
                Compare
              </label>
            )}
            <ConfirmButton
              disabled={remove.isPending}
              title="Delete this analysis?"
              description="The analysis and its annotated video are removed permanently."
              confirmLabel="Delete Analysis"
              onConfirm={() => remove.mutate(a.id)}
            >
              Delete
            </ConfirmButton>
          </div>
        </Card>
      ))}
    </div>
  );
}
