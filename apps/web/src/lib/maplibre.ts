import * as maplibregl from 'maplibre-gl';
// Worker served from /public (see scripts/copy-maplibre-worker.mjs); versioned to bust caches on upgrades.
maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs?v=' + maplibregl.getVersion());
export { maplibregl };
