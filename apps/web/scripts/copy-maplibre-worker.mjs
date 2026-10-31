// MapLibre resolves its web worker relative to its own module URL, which bundlers relocate
// (the worker then 404s and no map renders). Serve the exact installed worker from /public.
import { copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const dist = dirname(require.resolve('maplibre-gl/dist/maplibre-gl.mjs'));
copyFileSync(join(dist, 'maplibre-gl-worker.mjs'), new URL('../public/maplibre-gl-worker.mjs', import.meta.url));
