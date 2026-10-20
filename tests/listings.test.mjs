import test from 'node:test';
import assert from 'node:assert/strict';
import { publishedDate, inferLocations, jobDescription, fetchOfficial, listingKey, htmlText } from '../src/listings.mjs';
import { discoverCards, detailLocation, mergeSnapshot } from '../scripts/discovery.mjs';
import { sortJobs, isNewListing } from '../web/jobs.mjs';

const now = new Date('2026-10-20T12:00:00Z');
test('publication dates are real dates, never guessed from discovery or ambiguous text', () => {
  assert.equal(publishedDate('24 Sept 2026', now), '2026-09-24');
  assert.equal(publishedDate('2026-09-25T10:30:00Z', now), '2026-09-25');
  for (const value of ['recently', '10/09/26', '2026-02-30', '2027-01-01', null]) assert.equal(publishedDate(value, now), null);
});
test('publication sorting keeps unknown dates last in either direction and New expires after seven days', () => {
  const jobs = [{ id: 'A', company: 'A', publishedAt: null }, { id: 'B', company: 'B', publishedAt: '2026-09-25' }, { id: 'C', company: 'C', publishedAt: '2026-09-24' }];
  assert.deepEqual(sortJobs(jobs).map(x => x.id), ['B', 'C', 'A']);
  assert.deepEqual(sortJobs(jobs, 'oldest').map(x => x.id), ['C', 'B', 'A']);
  assert.equal(isNewListing({ firstSeenAt: '2026-10-19T00:00:00Z' }, now.getTime()), true);
  assert.equal(isNewListing({ firstSeenAt: '2026-10-12T00:00:00Z' }, now.getTime()), false);
  assert.equal(isNewListing({ firstSeenAt: '2026-10-19T00:00:00Z', isSeed: true }, now.getTime()), false);
});
test('structured role descriptions decode employer HTML and prefer explicit multi-state location', () => {
  const description = '&lt;p&gt;Location: Chennai, Kochi, Bangalore, Hyderabad, Pune&lt;/p&gt;&lt;p&gt;Develop education partnerships and build customer relationships.&lt;/p&gt;';
  const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title: 'Business Development Associate', description, datePosted: '2026-09-25', jobLocation: { address: { addressLocality: 'Bangalore' } } })}</script>`;
  assert.equal(inferLocations(detailLocation(html)).length, 5);
  const result = jobDescription(html, { title: 'Business Development Associate' }, now);
  assert.equal(result.publishedAt, '2026-09-25'); assert.ok(!result.description.includes('<p>'));
  assert.ok(htmlText(description).includes('Develop education partnerships'));
});
test('generic employer pages isolate the selected role and reject missing roles', () => {
  const html = '<h3>Student Counsellor</h3><p>Guide students through course selection and admissions at our Chennai office.</p><h3>Business Development Executive</h3><p>Develop partnerships with educational institutions in Bangalore.</p>';
  const job = { title: 'Student Counsellor', url: 'https://employer.example/careers' };
  const result = jobDescription(html, job, now);
  assert.ok(result.description.includes('Guide students')); assert.ok(!result.description.includes('Develop partnerships'));
  assert.throws(() => jobDescription(html, { ...job, title: 'Admissions Advisor' }, now));
  assert.equal(jobDescription(html + '<p>This position is closed</p>', job, now).availability, 'open', 'A different role being closed must not hide this one');
  assert.equal(jobDescription(html.replace('Guide students', 'This position is closed. Guide students'), job, now).availability, 'closed');
});
test('discovery accepts relevant roles in supported states from employer cards', () => {
  const source = { id: 'idp', company: 'IDP', type: 'idp', url: 'https://jobs.example/go/India/' };
  const html = '<table><tr class="data-row"><td><a class="jobTitle-link" href="/job/123">Student Counsellor</a></td><td class="jobLocation">Chennai, Tamil Nadu</td><td class="jobDate">25 Sep 2026</td></tr><tr class="data-row"><td><a class="jobTitle-link" href="/job/456">Software Architect</a></td></tr></table>';
  const cards = discoverCards(source, html, now);
  assert.equal(cards.length, 1); assert.equal(cards[0].publishedAt, '2026-09-25'); assert.equal(cards[0].locations[0].state, 'Tamil Nadu');
});
test('refresh preserves IDs and first-seen dates, prevents ATS duplicates and retains records on source failures', () => {
  const seed = { id: 'SEED', title: 'Business Development Associate', url: 'https://zolve.freshteam.com/jobs/ABC/applicants', isSeed: true, firstSeenAt: '2026-10-18T00:00:00Z', sourceId: 'zolve' };
  const found = { ...seed, id: 'AUTO-NEW', url: 'https://zolve.freshteam.com/jobs/ABC/business-development-associate', isSeed: undefined, firstSeenAt: undefined };
  assert.equal(listingKey(seed), listingKey(found));
  const merged = mergeSnapshot({ jobs: [seed] }, [seed], [found], new Set(['zolve']), now.toISOString());
  assert.equal(merged.length, 1); assert.equal(merged[0].id, 'SEED'); assert.equal(merged[0].isSeed, true); assert.equal(merged[0].firstSeenAt, seed.firstSeenAt);
  assert.deepEqual(mergeSnapshot({ jobs: merged }, [seed], [], new Set(), now.toISOString()), merged);
});
test('official-page fetch rejects unapproved hosts and redirects before following them', async () => {
  let calls = 0;
  const redirect = async () => { calls++; return new Response(null, { status: 302, headers: { location: 'https://evil.example/private' } }); };
  await assert.rejects(fetchOfficial('https://employer.example/job', ['employer.example'], redirect), /Unapproved/);
  assert.equal(calls, 1);
  await assert.rejects(fetchOfficial('http://employer.example/job', ['employer.example'], redirect), /Unapproved/);
  assert.equal(calls, 1);
});
