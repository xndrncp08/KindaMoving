'use client';
import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapContainer, EmptyState } from '@km/ui';
import { useMap } from '@/lib/stores';
/** Geometry is rendered only when it exists; manual metadata never invents a GPS trace. */
export default function RouteMap({ geometry }: { geometry: unknown }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (
      !ref.current ||
      !geometry ||
      typeof geometry !== 'object' ||
      !('coordinates' in geometry)
    )
      return;
    const viewport = useMap.getState().viewport;
    const map = new maplibregl.Map({
      container: ref.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [viewport.longitude, viewport.latitude],
      zoom: viewport.zoom,
    });
    map.addControl(new maplibregl.NavigationControl());
    map.on('error', () =>
      setError('Map tiles could not be loaded. Check your connection.'),
    );
    map.on('moveend', () => {
      const c = map.getCenter();
      useMap.getState().setViewport({
        longitude: c.lng,
        latitude: c.lat,
        zoom: map.getZoom(),
      });
    });
    map.on('load', () => {
      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: geometry as {
            type: 'LineString';
            coordinates: [number, number][];
          },
        },
      });
      map.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        paint: { 'line-color': '#6d871b', 'line-width': 5 },
      });
      const coords = (geometry as { coordinates: number[][] }).coordinates;
      if (coords.length) {
        const bounds = new maplibregl.LngLatBounds();
        coords.forEach((p) => bounds.extend([p[0], p[1]]));
        map.fitBounds(bounds, { padding: 40, maxZoom: 15, animate: false });
      }
    });
    return () => map.remove();
  }, [geometry]);
  if (!geometry)
    return (
      <EmptyState title="No GPS geometry yet">
        This route stores metadata only. GPS route processing is reserved for
        Phase 2.
      </EmptyState>
    );
  return (
    <>
      <MapContainer>
        <div ref={ref} role="region" aria-label="Interactive route map" />
      </MapContainer>
      {error && <p role="alert">{error}</p>}
      <p className="muted">
        Map tiles provided by OpenFreeMap / OpenStreetMap. Use the notes below
        as a text alternative.
      </p>
    </>
  );
}
