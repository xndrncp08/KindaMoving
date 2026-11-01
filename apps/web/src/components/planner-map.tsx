'use client';
import { useEffect, useRef, useState } from 'react';
import { maplibregl } from '@/lib/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapContainer } from '@km/ui';
import { useMap } from '@/lib/stores';
import { bounds } from '@/lib/geo';
import { MapLegend, mapColor, type LegendKey } from './map-legend';

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
  /** Legend entries relevant to this map; false when a workspace renders its own. */
  legend?: false | LegendKey[];
  /** Keeps fitted routes clear of panels floating over the map. */
  fitPadding?: maplibregl.PaddingOptions | number;
}
const color: Record<MapPoint['kind'], string> = mapColor;
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
  legend,
  fitPadding = 40,
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
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': mapColor.other,
          'line-width': 3,
          'line-opacity': 0.75,
          'line-dasharray': [2, 1.5],
        },
      });
      m.addLayer({
        id: 'selected-casing',
        type: 'line',
        source: 'selected',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': mapColor.casing, 'line-width': 8 },
      });
      m.addLayer({
        id: 'selected',
        type: 'line',
        source: 'selected',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': mapColor.route, 'line-width': 4 },
      });
      m.addLayer({
        id: 'highlight',
        type: 'line',
        source: 'highlight',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': mapColor.highlight,
          'line-width': 4,
        },
      });
      m.addLayer({
        id: 'points',
        type: 'circle',
        source: 'points',
        paint: {
          'circle-radius': ['case', ['==', ['get', 'kind'], 'start'], 8, 6],
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
        properties: { color: color[p.kind], kind: p.kind },
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
      m.fitBounds([w, s, e, n], {
        padding: fitPadding,
        maxZoom: 16,
        animate: false,
      });
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
      {error && (
        <p role="alert" className="map-error">
          {error}
        </p>
      )}
      {legend !== false && <MapLegend keys={legend} />}
    </>
  );
}
