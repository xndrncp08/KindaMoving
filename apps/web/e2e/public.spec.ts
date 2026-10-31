import { test, expect } from '@playwright/test';
test('marketing is responsive, honest and links to signup', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Run smarter. Suffer better.' }),
  ).toBeVisible();
  await expect(
    page.getByText('Integration planned', { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path:
      '../../output/playwright/landing-' + test.info().project.name + '.png',
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Start your running story' }).click();
  await expect(
    page.getByRole('heading', { name: 'Find your stride.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Supabase is not configured' }),
  ).toContainText('Supabase is not configured');
});
test('protected app redirects to login without credentials', async ({
  page,
}) => {
  await page.goto('/app/activities');
  await expect(page).toHaveURL(/\/login/);
});
test('legal pages and reduced motion render', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/privacy');
  await expect(
    page.getByRole('heading', { name: 'Privacy', exact: true }),
  ).toBeVisible();
  await page.goto('/terms');
  await expect(
    page.getByRole('heading', { name: 'Terms', exact: true }),
  ).toBeVisible();
});
