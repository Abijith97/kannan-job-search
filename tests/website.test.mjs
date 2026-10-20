import test from 'node:test';
import assert from 'node:assert/strict';
import { jobs } from '../.generated/data.mjs';
import worker, { JobWorkspace } from '../src/worker.mjs';
import { memoryState } from './helpers.mjs';

const origin = 'https://website.example';
const password = 'private-website-test-passphrase';
function request(path, { cookie, data, from = origin } = {}) {
  return new Request(origin + path, { method: data === undefined ? 'GET' : 'POST', headers: { ...(cookie ? { cookie } : {}), ...(data === undefined ? {} : { 'content-type': 'application/json', origin: from }) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
}
function setup() { return new JobWorkspace(memoryState(), { APP_ACCESS_PASSWORD: password, RESUME_GENERATION_ENABLED: 'false' }); }
async function login(workspace) {
  const response = await workspace.fetch(request('/api/login', { data: { password } }));
  assert.equal(response.status, 200); return response.headers.get('set-cookie').split(';')[0];
}
test('catalog contains unique roles across the five requested states', () => {
  assert.ok(jobs.length >= 17);
  assert.equal(new Set(jobs.flatMap(job => job.locations.map(x => x.state))).size, 5);
  assert.equal(new Set(jobs.map(job => job.id)).size, jobs.length);
  assert.ok(jobs.every(job => new URL(job.url).protocol === 'https:'));
});
test('catalog requires authentication and generation is disabled', async () => {
  const workspace = setup();
  assert.equal((await workspace.fetch(request('/api/jobs'))).status, 401);
  const cookie = await login(workspace);
  const data = await (await workspace.fetch(request('/api/jobs', { cookie }))).json();
  assert.equal(data.jobs.length, jobs.filter(job => job.availability !== 'closed').length); assert.equal(data.generationAvailable, false);
});
test('saved interest, skip and restore persist', async () => {
  const workspace = setup(); const cookie = await login(workspace);
  for (const [decision, expected] of [['interested', 'interested'], ['skipped', 'skipped'], ['new', 'new']]) {
    const response = await workspace.fetch(request('/api/jobs/SM-BDO/decision', { cookie, data: { decision } }));
    assert.equal(response.status, 200);
    const catalog = await (await workspace.fetch(request('/api/jobs', { cookie }))).json();
    assert.equal(catalog.jobs.find(x => x.id === 'SM-BDO').status, expected);
  }
});
test('cross-origin writes, invalid decisions and unknown jobs are rejected', async () => {
  const workspace = setup(); const cookie = await login(workspace);
  assert.equal((await workspace.fetch(request('/api/jobs/SM-BDO/decision', { cookie, from: 'https://other.example', data: { decision: 'new' } }))).status, 403);
  assert.equal((await workspace.fetch(request('/api/jobs/SM-BDO/decision', { cookie, data: { decision: 'invalid' } }))).status, 400);
  assert.equal((await workspace.fetch(request('/api/jobs/UNKNOWN/decision', { cookie, data: { decision: 'new' } }))).status, 404);
});
test('logout revokes the session', async () => {
  const workspace = setup(); const cookie = await login(workspace);
  await workspace.fetch(request('/api/logout', { cookie, data: {} }));
  assert.equal((await workspace.fetch(request('/api/jobs', { cookie }))).status, 401);
});
test('public assets use security headers', async () => {
  const response = await worker.fetch(request('/'), { ASSETS: { fetch: async () => new Response('<html></html>') } });
  assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
});
