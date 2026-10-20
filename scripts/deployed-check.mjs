// Runs inside GitHub Actions. Secrets stay in process memory and are never printed.
import assert from 'node:assert/strict';

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
  const data = await response.json(); assert.equal(data.jobs.length, 17); assert.equal(data.generationAvailable, false);
  assert.equal(new Set(data.jobs.flatMap(job => job.locations.map(location => location.state))).size, 5);
  assert.ok(data.jobs.every(job => new URL(job.url).protocol === 'https:'));
  console.log(`Verified live website: ${origin}`);
  console.log('Verified sign-in, protected catalog, five-state coverage and application links. Resume generation is disabled; no OpenAI calls were made.');
} finally { await call('/api/logout', { method: 'POST', headers: { cookie }, body: '{}' }); }
