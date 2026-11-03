import type { Page } from '@playwright/test';

/** The viewport matrix from docs/design/MOBILE.md (portrait phones first). */
export const VIEWPORTS = [
  ['small-phone', 320, 568],
  ['compact-android', 360, 800],
  ['small-iphone', 375, 667],
  ['modern-iphone', 390, 844],
  ['modern-mobile', 393, 852],
  ['large-phone', 414, 896],
  ['large-iphone', 430, 932],
  ['small-phone-landscape', 568, 320],
  ['large-iphone-landscape', 932, 430],
  ['tablet-portrait', 768, 1024],
  ['tablet-landscape', 1024, 768],
  ['laptop', 1280, 800],
  ['desktop', 1440, 900],
  ['large-desktop', 1920, 1080],
] as const;

export interface Finding {
  kind: 'overflow' | 'clipped' | 'small-target' | 'obscured';
  detail: string;
}

/**
 * Layout checks run inside the page. Containers that scroll on purpose
 * (tables, the calendar, maps) are allowed to hold wider content.
 */
export async function audit(page: Page): Promise<Finding[]> {
  return page.evaluate(() => {
    const out: { kind: string; detail: string }[] = [];
    const vw = document.documentElement.clientWidth;
    const label = (el: Element) => {
      const h = el as HTMLElement;
      const text = (
        h.getAttribute('aria-label') ||
        h.innerText ||
        h.getAttribute('name') ||
        ''
      )
        .trim()
        .slice(0, 40);
      return `${el.tagName.toLowerCase()}${h.className && typeof h.className === 'string' ? '.' + h.className.split(' ')[0] : ''} "${text}"`;
    };
    const visible = (el: Element) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (
        s.visibility !== 'hidden' &&
        s.display !== 'none' &&
        r.width > 0 &&
        r.height > 0 &&
        !el.closest('[hidden],[aria-hidden="true"],.sr-only')
      );
    };
    const scroller = (el: Element) =>
      el.closest(
        '.table-scroll, .calendar, .map-container, .maplibregl-map, .recharts-wrapper, .segmented, [data-scroll-x]',
      );
    // 1. Page-level horizontal overflow.
    if (document.documentElement.scrollWidth > vw + 1) {
      const wide = [...document.querySelectorAll('body *')]
        .filter(
          (el) =>
            visible(el) &&
            !scroller(el) &&
            el.getBoundingClientRect().right > vw + 1,
        )
        .slice(0, 3)
        .map(label);
      out.push({
        kind: 'overflow',
        detail: `page ${document.documentElement.scrollWidth}px > ${vw}px: ${wide.join(', ')}`,
      });
    }
    // 2. Text clipped without an ellipsis.
    for (const el of document.querySelectorAll(
      'button, a, label, h1, h2, h3, p, dd, dt, th, td, span.badge',
    )) {
      if (!visible(el) || scroller(el)?.matches('.maplibregl-map')) continue;
      const s = getComputedStyle(el);
      const clipsX =
        el.scrollWidth > el.clientWidth + 1 &&
        s.overflowX !== 'visible' &&
        s.textOverflow !== 'ellipsis' &&
        !scroller(el);
      if (clipsX) out.push({ kind: 'clipped', detail: label(el) });
    }
    // 3. Touch targets: controls must be ≥44×44 (inline text links excepted, WCAG 2.5.8).
    for (const el of document.querySelectorAll(
      'button, [role="button"], a.button, .nav-link, .tab, select, input:not([type="hidden"]), summary',
    )) {
      if (!visible(el) || el.closest('.maplibregl-ctrl, .recharts-wrapper'))
        continue;
      const r = el.getBoundingClientRect();
      const t = el as HTMLInputElement;
      // Checkboxes/radios are measured by their label, which is the hit target.
      const box =
        (t.type === 'checkbox' || t.type === 'radio') && t.closest('label')
          ? t.closest('label')!.getBoundingClientRect()
          : r;
      if (box.height < 43.5 || box.width < 43.5)
        out.push({
          kind: 'small-target',
          detail: `${label(el)} ${Math.round(box.width)}×${Math.round(box.height)}`,
        });
    }
    // 4. Fixed/sticky bars must not cover the last control when scrolled to the end.
    const bars = [...document.querySelectorAll('.tabbar, .mobile-header')]
      .filter(visible)
      .map((b) => b.getBoundingClientRect());
    window.scrollTo(0, document.documentElement.scrollHeight);
    // Inner scroll areas (sheets, panels) too: their last control must also be
    // reachable once scrolled to its end.
    for (const el of document.querySelectorAll('main *')) {
      const oy = getComputedStyle(el).overflowY;
      if (
        (oy === 'auto' || oy === 'scroll') &&
        el.scrollHeight > el.clientHeight
      )
        el.scrollTop = el.scrollHeight;
    }
    const controls = [
      ...document.querySelectorAll(
        'main button, main a, main input, main select',
      ),
    ].filter(visible);
    const last = controls.at(-1);
    if (last && bars.length) {
      const r = last.getBoundingClientRect();
      for (const b of bars)
        if (r.bottom > b.top + 1 && r.top < b.bottom - 1 && b.top > 0)
          out.push({ kind: 'obscured', detail: label(last) });
    }
    window.scrollTo(0, 0);
    return out as {
      kind: 'overflow' | 'clipped' | 'small-target' | 'obscured';
      detail: string;
    }[];
  });
}
