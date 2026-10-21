// Runs inside GitHub Actions. Secrets stay in process memory and are never printed.
import assert from 'node:assert/strict';
import { jobs as expectedJobs } from '../.generated/data.mjs';
import { isOtherIndustry } from '../web/sectors.mjs';

const origin = new URL(process.env.SITE_URL).origin;
const password = process.env.APP_ACCESS_PASSWORD;
if (!password) throw new Error('APP_ACCESS_PASSWORD is required');
const call = (path, options = {}) => fetch(origin + path, { ...options, headers: { Origin: origin, 'Content-Type': 'application/json', ...options.headers }, signal: AbortSignal.timeout(100000) });
const home = await call('/'); assert.equal(home.status, 200, 'Home page failed');
assert.equal((await call('/api/jobs')).status, 401, 'Catalog must require sign-in');
const login = await call('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
if (!login.ok) throw new Error(`Deployed sign-in failed (${login.status}): ${(await login.json()).error}`);
const cookie = login.headers.get('set-cookie')?.split(';')[0]; assert.ok(cookie);
try {
  const response = await call('/api/jobs', { headers: { cookie } }); assert.equal(response.status, 200);
  const data = await response.json(); assert.ok(data.jobs.length >= 17); assert.equal(data.generationAvailable, true);
  assert.equal(new Set(data.jobs.flatMap(job => job.locations.map(location => location.state))).size, 5);
  assert.ok(data.jobs.every(job => new URL(job.url).protocol === 'https:'));
  const expectedOther = expectedJobs.filter(job => job.availability !== 'closed' && isOtherIndustry(job));
  for (const job of expectedOther) assert.ok(data.jobs.some(actual => actual.id === job.id && isOtherIndustry(actual)), `Missing other-industry vacancy: ${job.id}`);
  console.log(`Verified ${expectedOther.length} other-industry jobs in the live catalog.`);
  let last = Infinity, undated = false;
  for (const job of data.jobs) {
    if (!job.publishedAt) { undated = true; continue; }
    assert.equal(undated, false, 'Undated listings must appear last');
    const date = Date.parse(job.publishedAt); assert.ok(date <= last); last = date;
  }
  if (process.env.CHECK_RESUME === 'true') {
    const created = await call('/api/jobs/SM-BDO/resume', { method: 'POST', headers: { cookie }, body: JSON.stringify({ description: '' }) });
    assert.equal(created.status, 200, `Resume preparation failed: ${created.status}`);
    const record = await created.json(); assert.equal(record.resume.name, 'Arun Kannan');
    const file = await call('/api/jobs/SM-BDO/download', { headers: { cookie } });
    assert.equal(file.status, 200); assert.match(file.headers.get('content-type'), /wordprocessingml/);
    const bytes = new Uint8Array(await file.arrayBuffer()); assert.equal(bytes[0], 80); assert.equal(bytes[1], 75);
    console.log('Verified a real tailored resume and editable Word download. The generated resume is saved for reuse.');
  }
  console.log(`Verified live website: ${origin}`);
  console.log('Verified sign-in, protected catalog, five-state coverage, publication sorting and application links.');
} finally { await call('/api/logout', { method: 'POST', headers: { cookie }, body: '{}' }); }
