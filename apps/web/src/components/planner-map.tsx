'use client';
import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapContainer } from '@km/ui';
import { useMap } from '@/lib/stores';
import { bounds } from '@/lib/geo';

export interface MapPoint {
  lat: number;
  lon: number;
  kind:
    | 'start'
    | 'waypoint'
    | 'major'
    | 'minor'
    | 'hazard'
    | 'ghost'
    | 'runner';
  label?: string;
}
interface Props {
  lines?: { coordinates: number[][]; selected?: boolean }[];
  highlight?: number[][] | null;
  points?: MapPoint[];
  onPick?: (lat: number, lon: number) => void;
  fitKey?: string;
  label?: string;
}
const color: Record<MapPoint['kind'], string> = {
  start: '#111827',
  waypoint: '#2563eb',
  major: '#dc2626',
  minor: '#f59e0b',
  hazard: '#7c3aed',
  ghost: '#94a3b8',
  runner: '#16a34a',
};
const empty = { type: 'FeatureCollection' as const, features: [] };

/**
 * One MapLibre instance whose GeoJSON sources are updated in place, so typing
 * in a form or stepping a replay never re-creates the map. Map tiles:
 * OpenFreeMap / OpenStreetMap contributors.
 */
export default function PlannerMap({
  lines = [],
  highlight,
  points = [],
  onPick,
  fitKey,
  label = 'Route map',
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const pick = useRef(onPick);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    pick.current = onPick; // latest handler without re-binding map events
  });

  useEffect(() => {
    if (!ref.current) return;
    const v = useMap.getState().viewport;
    const m = new maplibregl.Map({
      container: ref.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [v.longitude, v.latitude],
      zoom: v.zoom,
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl());
    m.on('error', () =>
      setError('Map tiles could not be loaded. Routes and lists still work.'),
    );
    m.on('moveend', () => {
      const c = m.getCenter();
      useMap
        .getState()
        .setViewport({ longitude: c.lng, latitude: c.lat, zoom: m.getZoom() });
    });
    m.on('click', (e) => pick.current?.(e.lngLat.lat, e.lngLat.lng));
    m.on('load', () => {
      for (const id of ['others', 'selected', 'highlight', 'points'])
        m.addSource(id, { type: 'geojson', data: empty });
      m.addLayer({
        id: 'others',
        type: 'line',
        source: 'others',
        paint: {
          'line-color': '#94a3b8',
          'line-width': 3,
          'line-opacity': 0.7,
        },
      });
      m.addLayer({
        id: 'selected',
        type: 'line',
        source: 'selected',
        paint: { 'line-color': '#4d7c0f', 'line-width': 5 },
      });
      m.addLayer({
        id: 'highlight',
        type: 'line',
        source: 'highlight',
        paint: {
          'line-color': '#ea580c',
          'line-width': 7,
          'line-opacity': 0.85,
        },
      });
      m.addLayer({
        id: 'points',
        type: 'circle',
        source: 'points',
        paint: {
          'circle-radius': 6,
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2,
        },
      });
      setReady(true);
    });
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const feature = (c: number[][]) => ({
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: c },
    });
    (m.getSource('others') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: lines
        .filter((l) => !l.selected)
        .map((l) => feature(l.coordinates)),
    });
    (m.getSource('selected') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: lines
        .filter((l) => l.selected)
        .map((l) => feature(l.coordinates)),
    });
    (m.getSource('highlight') as maplibregl.GeoJSONSource).setData(
      highlight?.length ? feature(highlight) : empty,
    );
    (m.getSource('points') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: points.map((p) => ({
        type: 'Feature',
        properties: { color: color[p.kind] },
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      })),
    });
  }, [ready, lines, highlight, points]);

  useEffect(() => {
    const m = map.current;
    const target = lines.find((l) => l.selected) ?? lines[0];
    if (!ready || !m || !fitKey) return;
    if (target?.coordinates.length) {
      const [w, s, e, n] = bounds(target.coordinates);
      m.fitBounds([w, s, e, n], { padding: 40, maxZoom: 16, animate: false });
    } else if (points[0])
      m.jumpTo({
        center: [points[0].lon, points[0].lat],
        zoom: Math.max(m.getZoom(), 13),
      });
    // Fit only when the caller changes fitKey (selection), not on every point update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fitKey]);

  return (
    <>
      <MapContainer>
        <div ref={ref} role="region" aria-label={label} />
      </MapContainer>
      {error && <p role="alert">{error}</p>}
      <p className="legend">
        <span>
          <i style={{ background: '#4d7c0f' }} />
          Route
        </span>
        <span>
          <i style={{ background: '#ea580c' }} />
          Tempo / highlight
        </span>
        <span>
          <i style={{ background: color.major }} />
          Major crossing
        </span>
        <span>
          <i style={{ background: color.minor }} />
          Minor crossing
        </span>
        <span>
          <i style={{ background: color.hazard }} />
          Reported condition
        </span>
        <span>Map © OpenStreetMap contributors (ODbL) · tiles OpenFreeMap</span>
      </p>
    </>
  );
}
