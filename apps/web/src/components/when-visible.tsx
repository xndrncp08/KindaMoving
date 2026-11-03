'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@km/ui';
/** Mount secondary visualizations once visible; keep their space and a keyboard alternative. */
export function WhenVisible({
  children,
  label,
  className,
  height,
}: {
  children: React.ReactNode;
  label: string;
  className?: string;
  height?: number;
}) {
  const supported = useSyncExternalStore(
    () => () => {},
    () => typeof window.IntersectionObserver === 'function',
    () => true,
  );
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (visible || !supported) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible, supported]);
  return (
    <div ref={ref}>
      {visible || !supported ? (
        children
      ) : (
        <div
          className={className}
          style={{ height, display: 'grid', placeItems: 'center' }}
        >
          <Button variant="outline" onClick={() => setVisible(true)}>
            Load {label}
          </Button>
        </div>
      )}
    </div>
  );
}
