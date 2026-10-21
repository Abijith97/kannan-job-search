import { load } from 'cheerio/slim';
import { createHash } from 'node:crypto';
import { fetchOfficial, canonicalUrl, cleanText, inferLocations, jobDescription, normalizedTitle, publishedDate, structuredJobs } from '../src/listings.mjs';
import { atsJob, atsDetails } from '../src/ats.mjs';

export function professionalTitle(title) {
  return /brand|marketing|communications?|content|client (?:account|program|portfolio)|sales|business development|proposal|pursuit|markets|coordinat|business support|research|community|engagement|account support|^analyst$|^senior analyst$/i.test(title)
    && !/manager|director|\bhead\b|vice president|\bVP\b|developer|engineer|architect|salesforce|\bSAP\b|cyber|MarTech|\bUX\b|\bUAT\b/i.test(title);
}
const apiHosts = new Set(['pwc.wd3.myworkdayjobs.com', 'ejgk.fa.em2.oraclecloud.com']);
async function json(url, fetcher, body) {
  const target = new URL(url);
  if (target.protocol !== 'https:' || !apiHosts.has(target.host) || target.username || target.password) throw new Error('Unapproved vacancy API.');
  const response = await fetcher(target.href, { method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) { const error = new Error(`Vacancy API returned HTTP ${response.status}.`); error.status = response.status; throw error; }
  const raw = await response.text(); if (raw.length > 4000000) throw new Error('Vacancy API result too large.');
  return JSON.parse(raw);
}
function locationsFacet(facets) {
  for (const facet of facets || []) {
    if (facet.facetParameter === 'locations') return facet.values.filter(value => inferLocations(value.descriptor).length).map(value => value.id);
    const nested = locationsFacet(facet.values); if (nested.length) return nested;
  }
  return [];
}
export function htmlVacancies(html, source) {
  const $ = load(html), jobs = [];
  $('a[href]').each((_, node) => {
    const title = cleanText($(node).text());
    if (!professionalTitle(title)) return;
    let url; try { url = canonicalUrl($(node).attr('href'), source.url); } catch { return; }
    if (new URL(url).hostname !== new URL(source.url).hostname || !/\/job\/|\/JobDetail\//.test(new URL(url).pathname)) return;
    const area = $(node).closest('tr,article,.article,.job-listing');
    jobs.push({ title, url, locations: inferLocations(area.text() || title) });
  });
  return jobs;
}
export async function collectProfessionalJobs(source, { previousJobs = [], now = new Date().toISOString(), fetcher = fetch } = {}) {
  const leads = [], warnings = [], closedIds = [], jobs = [];
  async function attempt(action) { try { await action(); } catch { warnings.push('A career search or vacancy page could not be read.'); } }
  if (source.id === 'ey' || source.id === 'deloitte') {
    for (const term of source.queries) await attempt(async () => {
      const url = new URL(source.url);
      url.searchParams.set(source.id === 'ey' ? 'q' : 'search', term);
      if (source.id === 'ey') url.searchParams.set('optionsFacetsDD_country', 'IN');
      for (const offset of [0, source.id === 'ey' ? 25 : 10]) {
        url.searchParams.set(source.id === 'ey' ? 'startrow' : 'jobOffset', String(offset));
        leads.push(...htmlVacancies(await fetchOfficial(url.href, [url.hostname], fetcher), source));
      }
    });
  } else if (source.id === 'pwc') {
    const base = 'https://pwc.wd3.myworkdayjobs.com/wday/cxs/pwc/Global_Experienced_Careers';
    const facets = await json(base + '/jobs', fetcher, { limit: 1, offset: 0, searchText: '', appliedFacets: {} });
    const locations = locationsFacet(facets.facets);
    if (!locations.length) throw new Error('Supported Workday locations were not exposed.');
    for (const term of source.queries) await attempt(async () => {
      const data = await json(base + '/jobs', fetcher, { limit: 20, offset: 0, searchText: term, appliedFacets: { locations } });
      if (!Array.isArray(data.jobPostings)) throw new Error('Workday search unavailable.');
      for (const item of data.jobPostings.filter(item => professionalTitle(item.title))) {
        if (!item.externalPath?.startsWith('/job/')) continue;
        leads.push({ title: item.title, url: new URL('/Global_Experienced_Careers' + item.externalPath, source.url).href, detailUrl: base + item.externalPath, detailFormat: 'workday' });
      }
    });
  } else if (source.id === 'kpmg') {
    for (const site of ['CX_3', 'CX_3001']) for (const term of source.queries) await attempt(async () => {
      const url = new URL('https://ejgk.fa.em2.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions');
      url.searchParams.set('onlyData', 'true'); url.searchParams.set('expand', 'requisitionList');
      url.searchParams.set('finder', `findReqs;siteNumber=${site},facetsList=LOCATIONS;TITLE,limit=100,keyword=${term}`);
      const data = await json(url.href, fetcher);
      if (!Array.isArray(data.items?.[0]?.requisitionList)) throw new Error('Oracle search unavailable.');
      for (const item of data.items[0].requisitionList.filter(item => professionalTitle(item.Title))) {
        const location = inferLocations(item.PrimaryLocation);
        // Multi-location vacancies may expose a supported secondary location.
        if (!/^\d+$/.test(String(item.Id))) continue;
        const detail = new URL('https://ejgk.fa.em2.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails');
        detail.searchParams.set('onlyData', 'true'); detail.searchParams.set('expand', 'all'); detail.searchParams.set('finder', `ById;Id=${item.Id},siteNumber=${site}`);
        leads.push({ title: item.Title, url: `https://ejgk.fa.em2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/${site}/job/${item.Id}`, detailUrl: detail.href, detailFormat: 'oracle', atsId: String(item.Id), locations: location, publishedAt: publishedDate(item.PostedDate, new Date(now)) });
      }
    });
  }
  const known = previousJobs.filter(job => job.sourceId === source.id);
  const identity = job => job.detailFormat === 'oracle' && job.atsId ? `${source.id}:${job.atsId}` : canonicalUrl(job.url);
  const knownKeys = new Set(known.map(identity));
  const fresh = [...new Map(leads.map(job => [identity(job), job])).values()].filter(job => !knownKeys.has(identity(job)))
    .sort((a, b) => Number(/associate|executive|coordinator/i.test(b.title)) - Number(/associate|executive|coordinator/i.test(a.title))).slice(0, 40);
  let newCount = 0;
  for (const lead of [...known, ...fresh]) {
    const existing = knownKeys.has(identity(lead));
    if (!existing && newCount >= 6) continue;
    await attempt(async () => {
      let detail;
      if (lead.detailFormat) {
        const data = await json(lead.detailUrl, fetcher);
        detail = existing ? atsDetails(JSON.stringify(data), lead, new Date(now)) : atsJob(data, lead.detailFormat, new Date(now));
        if (normalizedTitle(detail.title) !== normalizedTitle(lead.title)) throw new Error('Vacancy changed.');
      } else {
        const html = await fetchOfficial(lead.url, [new URL(source.url).hostname], fetcher);
        detail = jobDescription(html, { ...lead, discoveryMethod: 'profile-web-search' }, new Date(now));
        if (source.id === 'deloitte' && detail.description.includes('Position Summary')) detail.description = detail.description.split('Position Summary').slice(1).join('Position Summary').trim();
        const $ = load(html);
        const locationLabels = $('[itemprop="jobLocation"],.job-location,.location,.jobGeoLocation,.jobLocation').map((_, node) => $(node).text()).get().join('; ');
        const structured = structuredJobs(html).find(job => normalizedTitle(job.title) === normalizedTitle(lead.title));
        const addresses = [structured?.jobLocation].flat().filter(Boolean).map(item => [item.address?.addressLocality, item.address?.addressRegion].filter(Boolean).join(', ')).join('; ');
        detail.locations = inferLocations(addresses || locationLabels);
        if (!detail.locations.length) detail.locations = inferLocations(detail.description.match(/(?:work )?location\s*[:\n]([^\n]+(?:\n[^\n]+)?)/i)?.[1] || '');
        if (!detail.locations.length && lead.locations?.length) detail.locations = lead.locations;
        const dateText = $('[data-careersite-propertyid="date"],.jobDate').first().text();
        const match = (dateText || detail.description.match(/(?:^|\n)\s*Date\s*:\s*([^\n]+)/i)?.[1] || '').match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(20\d{2})\b/);
        if (!detail.publishedAt && match) detail.publishedAt = publishedDate(`${match[2]} ${match[1]} ${match[3]}`, new Date(now));
        detail.detailUrl = undefined;
      }
      if (detail.availability === 'closed') { if (lead.id) closedIds.push(lead.id); return; }
      if (!detail.locations.length || detail.description.length < 120) return;
      // Avoid spending assessment tokens on clearly senior requirements.
      if (!existing && /\b(?:minimum|at least)\s+(?:[4-9]|1\d)\+?\s*years|\b(?:[4-9]|1\d)\s*(?:\+|[-–]\s*\d+\+?)\s*years/i.test(detail.description)) return;
      const id = lead.id || `BIG4-${createHash('sha256').update(canonicalUrl(lead.url)).digest('hex').slice(0, 12).toUpperCase()}`;
      jobs.push({ ...lead, ...detail, id, sourceId: source.id, company: source.company, employerContext: source.employerContext, companyGroup: 'big-four', searchScope: 'big-four', role: 'Big Four business support', brief: detail.description.slice(0, 1500), verification: 'page-verified', discoverySourceUrl: lead.url });
      if (!existing) newCount++;
    });
  }
  return { jobs, closedIds, status: warnings.length ? 'partial' : 'ok', message: warnings.length ? `${warnings.length} search/detail checks need a recheck; earlier jobs were preserved.` : null, candidateCount: leads.length };
}
