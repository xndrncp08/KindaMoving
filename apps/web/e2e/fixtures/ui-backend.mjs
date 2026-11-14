import { createServer } from 'node:http';
import {
  profile,
  activities,
  shoes,
  workouts,
  routes,
  userId,
} from './ui-data.ts';

// Loopback-only, read-only upstream for rendered UI tests. No app auth bypass.
const tables = { profiles: [profile], activities, shoes, workouts, routes };
createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') {
    res
      .writeHead(405)
      .end(JSON.stringify({ error: 'Synthetic upstream is read-only' }));
    return;
  }
  const url = new URL(req.url, 'http://127.0.0.1:54329');
  if (url.pathname === '/auth/v1/user') {
    res.end(
      JSON.stringify({
        id: userId,
        email: 'synthetic@example.test',
        role: 'authenticated',
        aud: 'authenticated',
        app_metadata: {},
        user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      }),
    );
    return;
  }
  let rows = tables[url.pathname.split('/').at(-1)] ?? [];
  const id = url.searchParams.get('id')?.replace(/^eq\./, '');
  if (id) rows = rows.filter((r) => r.id === id);
  const single = req.headers.accept?.includes(
    'application/vnd.pgrst.object+json',
  );
  res.end(JSON.stringify(single ? (rows[0] ?? null) : rows));
}).listen(54329, '127.0.0.1');
