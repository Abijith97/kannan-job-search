import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { jobs, profile } from '../.generated/data.mjs';
import { validateSelection, assembleResume, curateResume, resumeText } from '../src/curation.mjs';
import { makePdf } from '../src/pdf.mjs';
import worker, { JobWorkspace } from '../src/worker.mjs';
import { memoryState, sampleSelection, openAIResponse } from './helpers.mjs';

const origin = 'https://example.workers.dev';
const password = 'test-only-passphrase-for-local-checks';
function setup(overrides = {}) {
  const env = { APP_ACCESS_PASSWORD: password, OPENAI_API_KEY: 'test-only-key-never-valid', OPENAI_MODEL: 'gpt-4.1-mini', DAILY_GENERATION_LIMIT: '20', ...overrides };
  return { env, workspace: new JobWorkspace(memoryState(), env) };
}
function request(path, { data, cookie, originHeader = origin } = {}) {
  return new Request(origin + path, { method: data === undefined ? 'GET' : 'POST', headers: { ...(data === undefined ? {} : { 'content-type': 'application/json', origin: originHeader }), ...(cookie ? { cookie } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
}
async function login(workspace) {
  const response = await workspace.fetch(request('/api/login', { data: { password } }));
  assert.equal(response.status, 200); return response.headers.get('set-cookie').split(';')[0];
}

test('catalog deduplicates state listings and has researched details for every role', () => {
  assert.equal(jobs.length, 17); assert.equal(new Set(jobs.map(x => x.id)).size, 17);
  assert.equal(jobs.find(x => x.id === 'ZOLVE-BDA').locations.length, 5);
  assert.equal(jobs.reduce((n, x) => n + x.locations.length, 0), 26);
  for (const job of jobs) { assert.ok(job.brief.length > 50); assert.equal(new URL(job.url).protocol, 'https:'); }
});
test('public assets do not ship contact details, private profile, or API keys', async () => {
  for (const name of await readdir('dist')) {
    const text = await readFile(`dist/${name}`, 'utf8');
    for (const detail of profile.contact.filter(x => !x.startsWith('Location:'))) assert.ok(!text.includes(detail.split(': ').slice(1).join(': ')), name);
    assert.ok(!/sk-proj-[\w-]+/.test(text));
  }
});
test('curation rejects fabricated IDs, wrong-role facts, missing roles and duplicate skills', () => {
  let s = sampleSelection(); s.skill_ids.push('Salesforce'); assert.throws(() => validateSelection(s, profile));
  s = sampleSelection(); s.experiences[0].bullet_ids = [s.experiences[1].bullet_ids[0]]; assert.throws(() => validateSelection(s, profile));
  s = sampleSelection(); s.experiences.pop(); assert.throws(() => validateSelection(s, profile));
  s = sampleSelection(); s.skill_ids.push(s.skill_ids[0]); assert.throws(() => validateSelection(s, profile));
});
test('assembled resume preserves canonical names, dates, employers, education and selected wording', () => {
  const resume = assembleResume(profile, sampleSelection());
  assert.equal(resume.name, profile.name); assert.deepEqual(resume.education, profile.education);
  resume.experiences.forEach((role, i) => { assert.equal(role.dates, profile.experiences[i].dates); assert.equal(role.title, profile.experiences[i].title); assert.equal(role.employer, profile.experiences[i].employer); assert.ok(role.bullets.every(x => profile.experiences[i].bullets.some(b => b.text === x))); });
  assert.ok(resumeText(resume).includes('Research Analyst'));
});
test('OpenAI request uses structured Responses output, no contact details, and store:false', async () => {
  await curateResume({ profile, job: jobs[0], description: 'Untrusted job details', apiKey: 'test', model: 'gpt-4.1-mini', fetcher: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses'); const payload = JSON.parse(options.body);
    assert.equal(payload.store, false); assert.equal(payload.text.format.strict, true);
    assert.ok(!options.body.includes('8848048847')); assert.ok(!options.body.includes('arunkannan1999@gmail.com'));
    return openAIResponse();
  } });
});
test('upstream errors and refusals never return credentials or raw provider errors', async () => {
  const base = { profile, job: jobs[0], description: '', apiKey: 'test', model: 'gpt-4.1-mini' };
  await assert.rejects(curateResume({ ...base, fetcher: async () => new Response('sensitive upstream info', { status: 401 }) }), /credentials need attention/);
  await assert.rejects(curateResume({ ...base, fetcher: async () => new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'refusal' }] }] })) }), /could not use those job details/);
  await assert.rejects(curateResume({ ...base, fetcher: async () => new Response(JSON.stringify({ status: 'incomplete' })) }), /not completed/);
});
test('login, protected catalog, cross-origin rejection and logout', async () => {
  const { workspace } = setup();
  assert.equal((await workspace.fetch(request('/api/jobs'))).status, 401);
  assert.equal((await workspace.fetch(request('/api/jobs/SM-BDO/download'))).status, 401);
  assert.equal((await workspace.fetch(request('/api/login', { data: { password }, originHeader: 'https://evil.example' }))).status, 403);
  const response = await workspace.fetch(request('/api/login', { data: { password } }));
  assert.match(response.headers.get('set-cookie'), /HttpOnly.*SameSite=Strict.*Secure/);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  assert.equal((await workspace.fetch(request('/api/jobs', { cookie }))).status, 200);
  await workspace.fetch(request('/api/logout', { cookie, data: {} }));
  assert.equal((await workspace.fetch(request('/api/jobs', { cookie }))).status, 401);
});
test('password rotation invalidates existing sessions; missing secrets fail closed', async () => {
  const { workspace, env } = setup(); const cookie = await login(workspace); env.APP_ACCESS_PASSWORD = 'changed-passphrase-for-testing';
  assert.equal((await workspace.fetch(request('/api/jobs', { cookie }))).status, 401);
  const missing = setup({ APP_ACCESS_PASSWORD: '' }).workspace;
  assert.equal((await missing.fetch(request('/api/login', { data: { password } }))).status, 503);
});
test('login brute-force attempts are rate limited', async () => {
  const { workspace } = setup();
  for (let i = 0; i < 8; i++) assert.equal((await workspace.fetch(request('/api/login', { data: { password: 'wrong' } }))).status, 401);
  assert.equal((await workspace.fetch(request('/api/login', { data: { password } }))).status, 429);
});
test('skip and restore persist, unknown IDs cannot be written', async () => {
  const { workspace } = setup(); const cookie = await login(workspace);
  await workspace.fetch(request('/api/jobs/SM-BDO/decision', { cookie, data: { decision: 'skipped' } }));
  let catalog = await (await workspace.fetch(request('/api/jobs', { cookie }))).json();
  assert.equal(catalog.jobs.find(x => x.id === 'SM-BDO').status, 'skipped');
  await workspace.fetch(request('/api/jobs/SM-BDO/decision', { cookie, data: { decision: 'new' } }));
  catalog = await (await workspace.fetch(request('/api/jobs', { cookie }))).json();
  assert.equal(catalog.jobs.find(x => x.id === 'SM-BDO').status, 'new');
  assert.equal((await workspace.fetch(request('/api/jobs/FAKE/decision', { cookie, data: { decision: 'new' } }))).status, 404);
});
test('generation is cached, protected PDF is downloadable, and daily limit is enforced', async t => {
  let calls = 0; t.mock.method(globalThis, 'fetch', async () => { calls++; return openAIResponse(); });
  const { workspace } = setup({ DAILY_GENERATION_LIMIT: '1' }); const cookie = await login(workspace);
  const make = id => workspace.fetch(request(`/api/jobs/${id}/resume`, { cookie, data: { description: '' } }));
  assert.equal((await make('SM-BDO')).status, 200); assert.equal((await make('SM-BDO')).status, 200); assert.equal(calls, 1);
  assert.equal((await make('SM-SRO')).status, 429);
  const download = await workspace.fetch(request('/api/jobs/SM-BDO/download?format=pdf', { cookie }));
  assert.equal(download.headers.get('content-type'), 'application/pdf'); assert.equal(download.headers.get('cache-control'), 'no-store');
  const pdf = await PDFDocument.load(await download.arrayBuffer()); assert.ok(pdf.getPageCount() <= 3); assert.equal(pdf.getTitle(), 'Arun Kannan - Resume');
});
test('concurrent generation cannot duplicate API spending', async t => {
  let release, calls = 0; const waiting = new Promise(resolve => release = resolve);
  t.mock.method(globalThis, 'fetch', async () => { calls++; await waiting; return openAIResponse(); });
  const { workspace } = setup(); const cookie = await login(workspace);
  const make = id => workspace.fetch(request(`/api/jobs/${id}/resume`, { cookie, data: { description: '' } }));
  const first = make('SM-BDO');
  while (!calls) await new Promise(resolve => setTimeout(resolve, 1));
  const second = await make('SM-SRO'); assert.equal(second.status, 409); release(); assert.equal((await first).status, 200); assert.equal(calls, 1);
});
test('oversized and too-short job details are rejected before any API call', async () => {
  const { workspace } = setup(); const cookie = await login(workspace);
  assert.equal((await workspace.fetch(request('/api/jobs/SM-BDO/resume', { cookie, data: { description: 'x'.repeat(25000) } }))).status, 413);
  assert.equal((await workspace.fetch(request('/api/jobs/SM-BDO/resume', { cookie, data: { description: 'too short' } }))).status, 400);
});
test('full resume PDF handles long source bullets and pagination', async () => {
  const selection = sampleSelection(); selection.experiences = profile.experiences.map(x => ({ role_id: x.id, bullet_ids: x.bullets.map(b => b.id) }));
  const bytes = await makePdf(assembleResume(profile, selection));
  const doc = await PDFDocument.load(bytes); assert.ok(doc.getPageCount() >= 1 && doc.getPageCount() <= 3);
});
test('worker applies security headers to assets', async () => {
  const response = await worker.fetch(request('/'), { ASSETS: { fetch: async () => new Response('<html></html>') } });
  assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/); assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
});
