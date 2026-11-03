'use client';
// Copy into a disposable checkout's app/chart-lab/page.tsx only. Never deployed.
import { useState } from 'react';
import dynamic from 'next/dynamic';
const Charts = dynamic(() => import('@/components/activity-charts'), {
  ssr: false,
});
const points = Array.from({ length: 600 }, (_, i) => ({
  km: i / 60,
  pace: 330 + Math.sin(i / 20) * 20,
  hr: 145 + Math.sin(i / 30) * 10,
  ele: 1050 + Math.cos(i / 40) * 10,
  lat: null,
  lon: null,
}));
export default function ChartLab() {
  const [show, setShow] = useState(false);
  return (
    <main style={{ maxWidth: 361, margin: 16 }}>
      <h1>Synthetic chart performance fixture</h1>
      <button className="button" onClick={() => setShow(true)}>
        Reveal charts
      </button>
      {show && <Charts points={points} />}
    </main>
  );
}
