import { chromium } from '@playwright/test';
import { access, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { startPreview } from './preview.mjs';

const preview = await startPreview();
let browser;
try {
  const launch = { headless: true };
  if (process.platform === 'win32') {
    const executable = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    try { await access(executable); launch.executablePath = executable; } catch {}
  }
  browser = await chromium.launch(launch);
  const page = await browser.newPage({ viewport: { width: 1365, height: 1000 }, acceptDownloads: true });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(preview.url);
  await page.getByLabel('Access passphrase').fill('wrong');
  await page.getByRole('button', { name: 'Open my shortlist' }).click();
  await page.getByText('That passphrase is not correct.').waitFor();
  await page.getByLabel('Access passphrase').fill(preview.password);
  await page.getByRole('button', { name: 'Open my shortlist' }).click();
  await page.locator('#job-rows tr').first().waitFor();
  assert.equal(await page.locator('#job-rows tr').count(), 17);
  await page.getByRole('button', { name: 'Tamil Nadu', exact: true }).click();
  assert.equal(await page.locator('#job-rows tr').count(), 8);
  const row = page.locator('tr[data-job-id="SM-BDO"]');
  await row.getByRole('button', { name: /^Skip / }).click();
  await row.getByRole('button', { name: 'Restore' }).waitFor();
  await page.reload(); await row.getByRole('button', { name: 'Restore' }).waitFor();
  await row.getByRole('button', { name: 'Restore' }).click();
  await row.getByRole('button', { name: 'Apply' }).waitFor();
  await page.getByRole('button', { name: 'All states', exact: true }).click();
  await mkdir('tmp/screenshots', { recursive: true });
  await page.screenshot({ path: 'tmp/screenshots/desktop.png', fullPage: true });
  await row.getByRole('button', { name: 'Apply' }).click();
  await page.getByText('Interest saved to your shortlist', { exact: false }).waitFor();
  assert.ok(await page.getByRole('link', { name: 'Apply on employer site' }).getAttribute('href'));
  assert.equal(await page.getByRole('button', { name: 'Prepare my resume' }).count(), 0);
  await page.screenshot({ path: 'tmp/screenshots/job-details.png' });
  await page.getByRole('button', { name: 'Close role details' }).click();
  await page.reload(); await row.getByText('Interested', { exact: true }).waitFor();
  await page.locator('#status-filter').selectOption('interested');
  assert.equal(await page.locator('#job-rows tr').count(), 1);
  await page.locator('#status-filter').selectOption('all');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'tmp/screenshots/mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile page overflows horizontally');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('heading', { name: 'Welcome, Arun.' }).waitFor();
  assert.deepEqual(errors, []);
  console.log('Website checks passed: sign-in, state filters, saved skip/restore, saved interest, employer application links, mobile layout and logout. No AI calls were made.');
} finally { await browser?.close(); await preview.close(); }
