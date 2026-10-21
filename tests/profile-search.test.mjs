import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { profile as sourceProfile } from '../.generated/data.mjs';
import { discoveryProfile, searchTheme, searchState, validateCandidate, inspectCandidate, discoverProfileJobs, assessJobs, POLICY_VERSION, ASSESSMENT_VERSION } from '../scripts/profile-search.mjs';
import { publicIPv4, publicJobUrl } from '../scripts/public-web.mjs';
import { targetStates } from '../src/listings.mjs';

const profile = discoveryProfile(sourceProfile, await readFile('roles/suitable_roles.md', 'utf8'));
const now = '2026-10-20T12:00:00.000Z';
const url = 'https://careers.acme.com/jobs/12345';
const factId = sourceProfile.experiences[0].bullets[0].id;
const candidate = { title: 'Channel Partnerships Associate', company: 'Acme Software', url, location: 'Chennai, Tamil Nadu', fit_score: 85, fit_reason: 'Channel partner acquisition matches the documented partner onboarding and commercial relationship work.', matched_evidence_ids: [factId], requirements_to_check: ['Confirm territory travel requirements.'] };
const description = '<p>Build and onboard channel partners for business software products. Own partner acquisition, research new opportunities, manage commercial relationships and maintain the sales pipeline. Location: Chennai, Tamil Nadu.</p>';
const html = `<h1>Channel Partnerships Associate</h1><script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title: candidate.title, hiringOrganization: { name: candidate.company }, description, datePosted: '2026-10-18', jobLocation: { address: { addressLocality: 'Chennai', addressRegion: 'Tamil Nadu', addressCountry: 'IN' } } })}</script>`;
const completed = (value, extra = []) => new Response(JSON.stringify({ status: 'completed', output: [...extra, { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }], usage: { input_tokens: 100, output_tokens: 50 } }));
const searchResponse = (jobs = [candidate]) => completed({ jobs }, [{ type: 'web_search_call', status: 'completed', action: { type: 'search', sources: [{ url }] } }]);
const assessmentResponse = (ids, suitable = true, sector = 'technology') => completed({ assessments: Object.fromEntries(ids.map(id => [id, { suitable, sector, fit_score: suitable ? 85 : 30, reason: candidate.fit_reason, matched_evidence_ids: [factId], requirements_to_check: candidate.requirements_to_check }])) });

test('search reads the real resume and researched role families but excludes contact details', () => {
  const serialized = JSON.stringify(profile.facts);
  assert.equal(profile.facts.roleFamilies.length, 8);
  assert.ok(serialized.includes(sourceProfile.experiences[0].bullets[0].text));
  assert.ok(!serialized.includes(sourceProfile.name));
  for (const contact of sourceProfile.contact) assert.ok(!serialized.includes(contact));
  const edited = structuredClone(sourceProfile); edited.skills[0].text += ' (confirmed new skill)';
  assert.notEqual(discoveryProfile(edited, '| 1 / R1 | Partnerships | High | Evidence | Check scope |').version, profile.version);
});
test('state search forces live web search, limits calls, uses current profile and requests sourced structured jobs', async () => {
  const result = await searchState({ state: 'Tamil Nadu', profile, existingJobs: [], now, apiKey: 'fake-local-test-key', fetcher: async (address, options) => {
    assert.equal(address, 'https://api.openai.com/v1/responses');
    const data = JSON.parse(options.body);
    assert.equal(data.max_tool_calls, 1); assert.equal(data.tools[0].external_web_access, true);
    assert.deepEqual(data.tool_choice, { type: 'web_search' }); assert.equal(data.store, false);
    assert.equal(data.text.format.strict, true); assert.ok(data.include.includes('web_search_call.action.sources'));
    assert.equal(JSON.parse(data.input).state, 'Tamil Nadu'); assert.ok(!options.body.includes('arunkannan1999@gmail.com'));
    assert.match(data.instructions, /OUTSIDE education/);
    assert.deepEqual(JSON.parse(data.input).search_theme, searchTheme('Tamil Nadu', now));
    return searchResponse();
  } });
  assert.equal(result.jobs.length, 1); assert.ok(result.sourceUrls.has(url));
});
test('a response without a completed real search or with too many results is rejected', async () => {
  const base = { state: 'Tamil Nadu', profile, existingJobs: [], now, apiKey: 'fake' };
  await assert.rejects(searchState({ ...base, fetcher: async () => completed({ jobs: [candidate] }) }), /required live web search/);
  await assert.rejects(searchState({ ...base, fetcher: async () => searchResponse(Array(7).fill(candidate)) }), /result limit/);
});
test('hallucinated URLs, invented evidence, unsuitable scores and wrong states cannot enter the catalog', () => {
  assert.equal(validateCandidate(candidate, 'Tamil Nadu', profile, new Set([url])).company, candidate.company);
  for (const bad of [{ ...candidate, url: 'https://careers.acme.com/jobs/invented' }, { ...candidate, matched_evidence_ids: ['invented-skill'] }, { ...candidate, fit_score: 30 }, { ...candidate, location: 'Delhi' }]) assert.throws(() => validateCandidate(bad, 'Tamil Nadu', profile, new Set([url])));
});
test('page verification confirms an exact vacancy, state, actual publication date and closure', () => {
  const job = validateCandidate(candidate, 'Tamil Nadu', profile, new Set([url]));
  const verified = inspectCandidate({ html, url }, job, 'Tamil Nadu', now);
  assert.equal(verified.publishedAt, '2026-10-18'); assert.equal(verified.locations[0].state, 'Tamil Nadu');
  assert.throws(() => inspectCandidate({ html: '<h1>All jobs</h1><p>Browse our vacancies.</p>', url }, job, 'Tamil Nadu', now));
  assert.throws(() => inspectCandidate({ html: html.replaceAll('Chennai', 'Delhi').replaceAll('Tamil Nadu', 'Delhi'), url }, job, 'Tamil Nadu', now), /state/);
  assert.throws(() => inspectCandidate({ html: html.replace('Build and onboard', 'This position is closed. Build and onboard'), url }, job, 'Tamil Nadu', now), error => error.closed === true);
});
test('full job assessment rejects hallucinated evidence, omissions and duplicate decisions', async () => {
  const job = { ...candidate, id: 'WEB-1', searchState: 'Tamil Nadu', locations: [{ state: 'Tamil Nadu', label: candidate.location }], description };
  const base = { jobs: [job], profile, now, apiKey: 'fake' };
  const good = await assessJobs({ ...base, fetcher: async (_, options) => {
    const request = JSON.parse(options.body); assert.equal(request.tools, undefined); assert.ok(request.input.includes('Own partner acquisition'));
    assert.deepEqual(request.text.format.schema.properties.assessments.required, ['WEB-1']);
    return assessmentResponse(['WEB-1']);
  } });
  assert.equal(good.jobs[0].profileMatch.score, 85);
  assert.equal((await assessJobs({ ...base, fetcher: async () => assessmentResponse(['WEB-1'], false) })).jobs.length, 0);
  await assert.rejects(assessJobs({ ...base, fetcher: async () => assessmentResponse([]) }), /exactly once/);
  await assert.rejects(assessJobs({ ...base, fetcher: async () => completed({ assessments: { 'WEB-1': { suitable: true, sector: 'technology', fit_score: 85, reason: 'Invented fit', matched_evidence_ids: ['fabricated'], requirements_to_check: [] } } }) }), /evidence/);
});

test('all five themes are covered daily and each state rotates through them over five days', () => {
  assert.equal(new Set(targetStates.map(state => searchTheme(state, now).id)).size, 5);
  for (const state of targetStates) {
    const days = Array.from({ length: 5 }, (_, day) => new Date(Date.parse(now) + day * 86400000).toISOString());
    assert.equal(new Set(days.map(date => searchTheme(state, date).id)).size, 5);
  }
});

test('cross-industry searches cannot publish education, consulting or unconfirmed sectors', async () => {
  const job = { ...candidate, id: 'WEB-1', searchScope: 'cross-industry', searchState: 'Tamil Nadu', locations: [{ state: 'Tamil Nadu', label: candidate.location }], description };
  for (const sector of ['education', 'consulting', 'unknown', 'technology']) {
    const result = await assessJobs({ jobs: [job], profile, now, apiKey: 'fake', fetcher: async () => assessmentResponse(['WEB-1'], true, sector) });
    assert.equal(result.jobs.length, sector === 'technology' ? 1 : 0);
  }
  const existing = await assessJobs({ jobs: [{ ...job, searchScope: undefined }], profile, now, apiKey: 'fake', fetcher: async () => assessmentResponse(['WEB-1'], true, 'education') });
  assert.equal(existing.jobs.length, 1, 'Existing education employers remain eligible');
});

test('active Big Four support roles remain eligible in consulting even with an older publication date', async () => {
  const job = { ...candidate, id: 'BIG4-1', company: 'EY', searchScope: 'big-four', publishedAt: '2026-08-01', searchState: 'Tamil Nadu', locations: [{ state: 'Tamil Nadu', label: candidate.location }], description };
  const result = await assessJobs({ jobs: [job], profile, now, apiKey: 'fake', fetcher: async () => assessmentResponse(['BIG4-1'], true, 'consulting') });
  assert.equal(result.jobs.length, 1); assert.equal(result.jobs[0].sector, 'consulting');
  const regular = await assessJobs({ jobs: [{ ...job, searchScope: 'cross-industry' }], profile, now, apiKey: 'fake', fetcher: async () => assessmentResponse(['BIG4-1'], true, 'consulting') });
  assert.equal(regular.jobs.length, 0);
});
test('nightly pipeline covers all five states, verifies pages, then assesses before publishing', async () => {
  let searches = 0, assessments = 0, checked = 0; const progress = [];
  const result = await discoverProfileJobs({ profile, previous: null, existingJobs: [], now, apiKey: 'fake',
    fetcher: async (_, options) => {
      const data = JSON.parse(options.body);
      if (data.tools) { searches++; return searchResponse(JSON.parse(data.input).state === 'Tamil Nadu' ? [candidate] : []); }
      assessments++; return assessmentResponse(JSON.parse(data.input).vacancies.map(job => job.id));
    }, pageFetcher: async address => { checked++; assert.equal(address, url); return { html, url }; },
    onProgress: async (info, pending) => progress.push(structuredClone({ info, pending }))
  });
  assert.equal(searches, 5); assert.equal(assessments, 1); assert.equal(checked, 1);
  assert.deepEqual(result.info.states.map(item => item.state), targetStates);
  assert.equal(result.info.phase, 'complete'); assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].discoveryMethod, 'profile-web-search'); assert.equal(result.jobs[0].verification, 'page-verified');
  assert.ok(progress.some(item => item.info.phase === 'assessing' && item.pending.length === 1));
  assert.equal(progress[0].info.states[0].attemptedAt, now, 'Daily ledger is persisted before the first paid request');
  assert.deepEqual(result.info.pendingJobs, []);
});
test('manual reruns reuse daily search ledger without API spending and preserve unprocessed states in checkpoints', async () => {
  const previous = { policyVersion: POLICY_VERSION, profileVersion: profile.version, states: targetStates.map(state => ({ state, attemptedAt: now, status: 'ok', acceptedCount: 1 })), acceptedCount: 5, pendingJobs: [] };
  const result = await discoverProfileJobs({ profile, previous, existingJobs: [], now, apiKey: 'fake', fetcher: async () => { throw new Error('Must not call OpenAI'); } });
  assert.equal(result.info.acceptedCount, 5); assert.equal(result.jobs.length, 0);
  let first;
  await discoverProfileJobs({ profile, previous: { ...previous, states: previous.states.slice(1) }, existingJobs: [], now, apiKey: 'fake', fetcher: async () => searchResponse([]), onProgress: async info => { first ||= structuredClone(info); } });
  assert.equal(first.states.length, 5, 'Checkpoint must retain already completed later states if interrupted');
});
test('new roles on configured employer career pages pass the same assessment rather than publishing by keywords', async () => {
  const known = { id: 'AUTO-NEW', title: candidate.title, company: candidate.company, url: 'https://careers.acme.com/careers', locations: [{ state: 'Tamil Nadu', label: 'Chennai' }], description, searchState: 'Tamil Nadu', discoveryMethod: 'profile-assessed-employer', verification: 'page-verified', discoverySourceUrl: 'https://careers.acme.com/careers' };
  let assessed = 0;
  const run = suitable => discoverProfileJobs({ profile, previous: null, existingJobs: [], verifiedJobs: [known], now, apiKey: 'fake', fetcher: async (_, options) => {
    const data = JSON.parse(options.body);
    if (data.tools) return searchResponse([]);
    assessed++; return assessmentResponse(['AUTO-NEW'], suitable);
  } });
  const accepted = await run(true); assert.equal(accepted.jobs.length, 1); assert.equal(accepted.jobs[0].profileMatch.score, 85);
  const rejected = await run(false); assert.equal(rejected.jobs.length, 0); assert.equal(assessed, 2);
});
test('authentication failure stops further paid requests and preserves existing jobs', async () => {
  let calls = 0;
  const result = await discoverProfileJobs({ profile, previous: null, existingJobs: [], now, apiKey: 'fake', fetcher: async () => { calls++; return new Response(JSON.stringify({ error: { message: 'Do not expose a secret here' } }), { status: 401 }); } });
  assert.equal(calls, 1); assert.equal(result.jobs.length, 0); assert.ok(result.info.states.every(item => item.status === 'failed'));
  assert.ok(!JSON.stringify(result.info).includes('Do not expose a secret'));
});
test('failed final assessment stages results for recovery, without publishing preliminary matches', async () => {
  const result = await discoverProfileJobs({ profile, previous: null, existingJobs: [], now, apiKey: 'fake', fetcher: async (_, options) => {
    const data = JSON.parse(options.body);
    return data.tools ? searchResponse(JSON.parse(data.input).state === 'Tamil Nadu' ? [candidate] : []) : new Response('Unavailable', { status: 503 });
  }, pageFetcher: async () => ({ html, url }) });
  assert.equal(result.info.phase, 'failed'); assert.equal(result.jobs.length, 0); assert.equal(result.info.pendingJobs.length, 1);
  const second = await discoverProfileJobs({ profile, previous: result.info, existingJobs: [], now, apiKey: 'fake', fetcher: async () => { throw new Error('Must not repeat a failed batch in the same day'); } });
  assert.equal(second.info.phase, 'pending'); assert.equal(second.info.pendingJobs.length, 1);
  let calls = 0;
  const repaired = await discoverProfileJobs({ profile, previous: { ...result.info, assessment: { ...result.info.assessment, version: 'older-broken-format' } }, existingJobs: [], now, apiKey: 'fake', fetcher: async (_, options) => {
    const input = JSON.parse(options.body); assert.equal(input.tools, undefined); calls++;
    return assessmentResponse(JSON.parse(input.input).vacancies.map(job => job.id));
  } });
  assert.equal(calls, 1, 'A format repair should recover the staged jobs without repeating the five paid searches');
  assert.equal(repaired.info.phase, 'complete'); assert.equal(repaired.jobs.length, 1); assert.equal(repaired.info.assessment.version, ASSESSMENT_VERSION);
});
test('public job fetch guard rejects metadata, local, private and reserved addresses', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '172.16.1.1', '192.168.1.1', '169.254.169.254', '100.64.1.1', '198.18.1.1', '224.0.0.1', '::1']) assert.equal(publicIPv4(address), false, address);
  assert.equal(publicIPv4('8.8.8.8'), true);
  for (const address of ['http://careers.acme.com/jobs/1', 'https://localhost/jobs', 'https://127.0.0.1/jobs', 'https://[::1]/jobs', 'https://user:pass@careers.acme.com/jobs', 'https://careers.acme.com:8443/jobs']) assert.throws(() => publicJobUrl(address));
});
