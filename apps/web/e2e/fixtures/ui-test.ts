import { test as base, expect } from '@playwright/test';
import { overview } from '../../src/lib/analytics';
import { activities, date, responses, userId } from './ui-data';

export const test = base.extend({
  context: async ({ context }, provide) => {
    const encode = (v: unknown) =>
      Buffer.from(JSON.stringify(v)).toString('base64url');
    const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, aud: 'authenticated', exp: 4102444800 })}.synthetic`;
    await context.addCookies([
      {
        name: 'sb-127-auth-token',
        value:
          'base64-' +
          encode({
            access_token: token,
            refresh_token: 'synthetic',
            expires_at: 4102444800,
            user: { id: userId },
          }),
        url: 'http://127.0.0.1:3100',
      },
    ]);
    await context.route('**/api/**', async (route) => {
      if (!['GET', 'HEAD'].includes(route.request().method())) {
        await route.fulfill({
          status: 405,
          json: { error: 'Synthetic UI tests do not write data.' },
        });
        return;
      }
      const path = new URL(route.request().url()).pathname.replace('/api/', '');
      let data = responses[path];
      if (path === 'analytics/overview')
        data = overview(
          activities.map((a) => ({
            ...a,
            best_efforts: a.metrics.best_efforts,
            hr_histogram: null,
          })),
          date,
        );
      if (data === undefined) {
        const [resource, id] = path.split('/');
        const rows = responses[resource];
        if (Array.isArray(rows)) data = rows.find((r) => r.id === id);
      }
      await route.fulfill(
        data === undefined
          ? { status: 404, json: { error: `No synthetic fixture: ${path}` } }
          : { json: data },
      );
    });
    // Stable canvas for layout checks; map data/tiles and routing accuracy are separate gates.
    await context.route('https://tiles.openfreemap.org/styles/*', (route) =>
      route.fulfill({
        json: {
          version: 8,
          sources: {},
          layers: [
            {
              id: 'background',
              type: 'background',
              paint: { 'background-color': '#e5e3da' },
            },
          ],
        },
      }),
    );
    await provide(context);
  },
});
export { expect };
