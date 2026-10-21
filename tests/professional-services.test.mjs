import test from 'node:test';
import assert from 'node:assert/strict';
import { atsJob, atsDetails } from '../src/ats.mjs';
import { collectProfessionalJobs, htmlVacancies } from '../scripts/professional-services.mjs';
import { bigFourOf, matchesCompany } from '../web/big-four.mjs';

const now = '2026-10-22T12:00:00Z';
const description = '<p>Coordinate marketing campaigns, content calendars, client communications, research and project timelines. Work with account teams on commercial initiatives and maintain accurate CRM records.</p>';
const workday = { jobPostingInfo: { title: 'Marketing Coordinator', jobDescription: description, jobReqId: '123WD', location: 'Chennai', additionalLocations: ['Mumbai'], startDate: '2026-10-18', endDate: '2026-11-20', canApply: true } };

test('Workday vacancy details preserve actual dates, all supported locations and confirmed closures', () => {
  const job = atsJob(workday, 'workday', new Date(now));
  assert.equal(job.publishedAt, '2026-10-18');
  assert.deepEqual(job.locations.map(item => item.state), ['Tamil Nadu', 'Maharashtra']);
  assert.equal(atsJob({ jobPostingInfo: { ...workday.jobPostingInfo, canApply: false } }, 'workday', new Date(now)).availability, 'closed');
  assert.equal(atsJob({ jobPostingInfo: { ...workday.jobPostingInfo, endDate: '2026-10-01' } }, 'workday', new Date(now)).availability, 'closed');
  assert.throws(() => atsDetails(JSON.stringify(workday), { title: 'Different role', atsId: '123WD', detailFormat: 'workday' }), /different vacancy/);
});

test('Oracle combines responsibilities and qualifications, checks expiration, and retains secondary locations', () => {
  const data = { items: [{ Id: '123', Title: 'Client Account Coordinator', ExternalDescriptionStr: description, ExternalResponsibilitiesStr: '<p>Track client communications and pipeline updates.</p>', ExternalQualificationsStr: '<p>Any graduate. Excel skills required.</p>', PrimaryLocation: 'Gurgaon, Haryana, India', otherWorkLocations: [{ TownOrCity: 'Bengaluru', Region2: 'Karnataka', Country: 'IN' }], ExternalPostedStartDate: '2026-10-12T05:00:00Z', ExternalPostedEndDate: '2026-10-20T00:00:00Z' }] };
  const job = atsJob(data, 'oracle', new Date(now));
  assert.match(job.description, /Excel skills required/); assert.match(job.description, /pipeline updates/);
  assert.equal(job.locations[0].state, 'Karnataka'); assert.equal(job.publishedAt, '2026-10-12'); assert.equal(job.availability, 'closed');
  assert.throws(() => atsJob({ items: [] }, 'oracle'), /unavailable/);
});

test('employer HTML collector accepts individual official vacancies and rejects external links and senior unrelated roles', () => {
  const source = { id: 'ey', url: 'https://careers.ey.com/ey/search/' };
  const html = '<a href="/ey/job/Kochi-Account-Coordinator/1">Account Coordinator</a><a href="https://evil.example/job/2">Marketing Associate</a><a href="/ey/job/3">Marketing Director</a><a href="/ey/search/">Marketing roles</a>';
  assert.equal(htmlVacancies(html, source).length, 1);
});

test('direct EY collector verifies full role, location and dates; known closures are returned for hiding', async () => {
  const source = { id: 'ey', company: 'EY', url: 'https://careers.ey.com/ey/search/', queries: ['BMC'] };
  const url = 'https://careers.ey.com/ey/job/Kochi-Account-Coordinator/123';
  const search = `<a href="${url}">Account Coordinator</a>`;
  const page = `<h1>Account Coordinator</h1><main><p>Location: Kochi</p><p>Date: Oct 18, 2026</p>${description}</main>`;
  const fetcher = async address => new Response(String(address).includes('/search/') ? search : page);
  const found = await collectProfessionalJobs(source, { now, fetcher });
  assert.equal(found.jobs.length, 1); assert.equal(found.jobs[0].locations[0].state, 'Kerala'); assert.equal(found.jobs[0].publishedAt, '2026-10-18');
  const closed = await collectProfessionalJobs(source, { now, previousJobs: found.jobs, fetcher: async address => new Response(String(address).includes('/search/') ? '' : page.replace('Coordinate marketing', 'This position is closed. Coordinate marketing')) });
  assert.equal(closed.jobs.length, 0); assert.deepEqual(closed.closedIds, [found.jobs[0].id]);
});

test('Workday uses supported location facets and fetches real details rather than relative search dates', async () => {
  const source = { id: 'pwc', company: 'PwC', url: 'https://pwc.wd3.myworkdayjobs.com/Global_Experienced_Careers', queries: ['marketing'] };
  const result = await collectProfessionalJobs(source, { now, fetcher: async (url, options) => {
    assert.equal(new URL(url).hostname, 'pwc.wd3.myworkdayjobs.com');
    if (options.method === 'POST') {
      const body = JSON.parse(options.body);
      if (!body.searchText) return Response.json({ facets: [{ facetParameter: 'locations', values: [{ id: 'TN', descriptor: 'Chennai' }, { id: 'UK', descriptor: 'London' }] }] });
      assert.deepEqual(body.appliedFacets.locations, ['TN']);
      return Response.json({ jobPostings: [{ title: 'Marketing Coordinator', externalPath: '/job/Chennai/Marketing-Coordinator_123WD', postedOn: 'Posted Today' }] });
    }
    return Response.json(workday);
  } });
  assert.equal(result.jobs.length, 1); assert.equal(result.jobs[0].publishedAt, '2026-10-18'); assert.equal(result.jobs[0].detailFormat, 'workday');
});

test('company filters recognise the four firms without matching unrelated employer names', () => {
  assert.equal(bigFourOf({ sourceId: 'ey' }), 'ey'); assert.equal(bigFourOf({ company: 'Deloitte USI' }), 'deloitte');
  assert.equal(bigFourOf({ company: 'Monkey Marketing' }), null);
  assert.ok(matchesCompany({ company: 'PwC India' }, 'big-four')); assert.equal(matchesCompany({ company: 'PwC India' }, 'kpmg'), false);
});

test('Oracle collector deduplicates the same requisition across career sites and queries', async () => {
  const source = { id: 'kpmg', company: 'KPMG', url: 'https://ejgk.fa.em2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_3', queries: ['marketing', 'communications'] };
  let detailCalls = 0;
  const result = await collectProfessionalJobs(source, { now, fetcher: async url => {
    if (new URL(url).pathname.endsWith('recruitingCEJobRequisitions')) return Response.json({ items: [{ requisitionList: [{ Id: '123', Title: 'Marketing Coordinator', PrimaryLocation: 'Bengaluru', PostedDate: '2026-10-18' }] }] });
    detailCalls++;
    return Response.json({ items: [{ Id: '123', Title: 'Marketing Coordinator', ExternalDescriptionStr: description, ExternalQualificationsStr: '<p>Any graduate, one year of relevant experience.</p>', PrimaryLocation: 'Bengaluru', ExternalPostedStartDate: '2026-10-18' }] });
  } });
  assert.equal(detailCalls, 1); assert.equal(result.jobs.length, 1); assert.equal(result.jobs[0].companyGroup, 'big-four');
});
