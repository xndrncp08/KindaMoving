import { mkdirSync, writeFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { VIEWPORTS, audit, axeViolations } from './mobile-audit';
import { userId } from './fixtures/ui-data';

// Signed-out journeys against the loopback upstream. Auth API calls are answered per test, so
// this proves UI states and routing, not hosted Supabase email delivery or Google OAuth.
const AUTH = 'http://127.0.0.1:54329/auth/v1/';
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
};
async function answer(
  page: Page,
  path: string,
  status: number,
  json: object,
  seen: string[] = [],
) {
  await page.route(AUTH + path + '*', (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: cors });
    seen.push(route.request().postData() ?? '');
    return route.fulfill({ status, json, headers: cors });
  });
  return seen;
}
const fail = (code: string) => ({
  code,
  error_code: code,
  msg: 'raw provider text ' + code,
});

const screens = {
  login: '/login',
  signup: '/login?mode=signup',
  forgot: '/login?mode=reset',
  expired: '/login?error=expired',
  reset: '/auth/reset',
};
const phase = process.env.KM_UI_PHASE ?? 'after';
const matrix =
  process.env.KM_UI_MATRIX === '1'
    ? VIEWPORTS
    : VIEWPORTS.filter(([n]) => n === 'small-phone' || n === 'desktop');
for (const theme of ['light', 'dark'] as const)
  for (const [vp, width, height] of matrix)
    test.describe(`${theme} ${vp}`, () => {
      test.use({
        viewport: { width, height },
        hasTouch: width < 1024,
        isMobile: width < 768,
        colorScheme: theme,
      });
      for (const [name, path] of Object.entries(screens))
        test(`${name} renders cleanly ${theme} ${vp}`, async ({ page }) => {
          const errors: string[] = [];
          page.on('pageerror', (e) => errors.push(e.message));
          await page.emulateMedia({
            colorScheme: theme,
            reducedMotion: 'reduce',
          });
          await page.goto(path);
          await expect(page.locator('main h1')).toBeVisible();
          const dir = `../../output/playwright/ui-auth/${phase}`;
          mkdirSync(dir, { recursive: true });
          await page.screenshot({
            path: `${dir}/${name}-${theme}-${vp}.png`,
            fullPage: true,
          });
          const findings = await audit(page);
          const accessibility =
            vp === 'small-phone' || vp === 'modern-iphone' || vp === 'desktop'
              ? await axeViolations(page)
              : [];
          writeFileSync(
            `${dir}/${name}-${theme}-${vp}.json`,
            JSON.stringify({ findings, errors, accessibility }, null, 2),
          );
          expect.soft(findings).toEqual([]);
          expect.soft(errors).toEqual([]);
          expect.soft(accessibility).toEqual([]);
        });
    });

test.describe('journeys', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test('a protected link survives login and lands where it pointed', async ({
    page,
  }) => {
    await page.goto('/app/routes');
    await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Froutes$/);
    const encode = (v: object | string) =>
      Buffer.from(JSON.stringify(v)).toString('base64url');
    await answer(page, 'token', 200, {
      access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, aud: 'authenticated', exp: 4102444800 })}.${encode('synthetic')}`,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: 4102444800,
      refresh_token: 'synthetic',
      user: {
        id: userId,
        email: 'synthetic@example.test',
        aud: 'authenticated',
      },
    });
    await page.getByLabel('Email').fill('synthetic@example.test');
    await page.getByLabel('Password', { exact: true }).fill('any-password');
    // The keyboard's Go key submits; no need to find the button.
    await page.getByLabel('Password', { exact: true }).press('Enter');
    await expect(page).toHaveURL(/\/app\/routes$/);
    // Signed in, /login now steps aside instead of showing the form again.
    await page.goto('/login');
    await expect(page).toHaveURL(/\/app$/);
  });

  test('wrong password, rate limit and offline each explain what to do', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('runner@example.test');
    await page.getByLabel('Password', { exact: true }).fill('wrong');
    await answer(page, 'token', 400, fail('invalid_credentials'));
    await page.getByRole('button', { name: 'Log In' }).click();
    await expect(page.locator('main').getByRole('alert')).toContainText(
      'That email and password don’t match',
    );
    await expect(page.getByText(/raw provider text/)).toHaveCount(0);
    await page.unrouteAll();
    await answer(page, 'token', 429, fail('over_request_rate_limit'));
    await page.getByRole('button', { name: 'Log In' }).click();
    await expect(page.locator('main').getByRole('alert')).toContainText(
      'Too many attempts',
    );
    await page.unrouteAll();
    await page.route(AUTH + 'token*', (r) => r.abort('internetdisconnected'));
    await page.getByRole('button', { name: 'Log In' }).click();
    await expect(page.locator('main').getByRole('alert')).toContainText(
      'couldn’t reach',
    );
    // Nothing the runner typed is lost across failures.
    await expect(page.getByLabel('Email')).toHaveValue('runner@example.test');
  });

  test('inline validation appears on leaving a field and is announced', async ({
    page,
  }) => {
    await page.goto('/login?mode=signup');
    const email = page.getByLabel('Email');
    await email.fill('not-an-email');
    await email.blur();
    await expect(page.getByText('Enter an email address')).toBeVisible();
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(email).toHaveAttribute('aria-describedby', 'email-error');
    await page.getByLabel('Password', { exact: true }).fill('twelve chars');
    const rule = (name: string) =>
      page.locator('#password-rules li', { hasText: name });
    await expect(rule('12 or more characters')).toHaveClass(/met/);
    await expect(rule('A number')).not.toHaveClass(/met/);
    await page.getByLabel('Password', { exact: true }).fill('twelve chars 1');
    await page.getByLabel('Confirm password').fill('twelve chars 1');
    await expect(rule('A number')).toHaveClass(/met/);
    await expect(rule('Passwords match')).toHaveClass(/met/);
  });

  test('signup confirmation offers resend after a cooldown, and Back works', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Create an account' }).click();
    await expect(page).toHaveURL(/mode=signup/);
    const sent = await answer(page, 'signup', 200, {
      id: 'new',
      aud: 'authenticated',
      email: 'new@example.test',
    });
    await page.getByLabel('Email').fill('new@example.test');
    await page
      .getByLabel('Password', { exact: true })
      .fill('a long enough phrase 7');
    await page.getByLabel('Confirm password').fill('a long enough phrase 7');
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(
      page.getByRole('heading', { name: 'Check your inbox.' }),
    ).toBeVisible();
    await expect(page.getByText('new@example.test')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Resend in/ }),
    ).toBeDisabled();
    expect(sent).toHaveLength(1);
    await page.goBack();
    await expect(
      page.getByRole('heading', { name: 'Welcome back.' }),
    ).toBeVisible();
  });

  test('forgot password → inbox → spent link → request again', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    const sent = await answer(page, 'recover', 200, {});
    await page.getByLabel('Email').fill('runner@example.test');
    await page.getByRole('button', { name: 'Send Reset Link' }).click();
    await expect(
      page.getByRole('heading', { name: 'Check your inbox.' }),
    ).toBeVisible();
    expect(JSON.parse(sent[0]).email).toBe('runner@example.test');
    // A spent or foreign-device link lands on /auth/reset without a session.
    await page.goto('/auth/reset');
    await expect(
      page.getByRole('heading', { name: 'This link has expired.' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Request a New Link' }).click();
    await expect(
      page.getByRole('heading', { name: 'Reset your password.' }),
    ).toBeVisible();
  });

  test('keyboard reaches every control in order with a visible focus ring', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Email').focus();
    const order: string[] = [];
    for (let i = 0; i < 5; i++) {
      order.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement;
          return (
            el.getAttribute('aria-label') ||
            el.textContent?.trim() ||
            el.tagName
          );
        }),
      );
      const ring = await page.evaluate(
        () => getComputedStyle(document.activeElement!).outlineStyle,
      );
      expect(ring).not.toBe('none');
      await page.keyboard.press('Tab');
    }
    expect(order).toEqual([
      'INPUT',
      'INPUT',
      'Show password',
      'Forgot password?',
      'Log In',
    ]);
  });
});
