import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { load } from 'cheerio/slim';
import { loadCatalog } from './catalog.mjs';
import { discoverCards, detailLocation, mergeSnapshot } from './discovery.mjs';
import { fetchOfficial, jobDescription, inferLocations, listingKey, normalizedTitle } from '../src/listings.mjs';

const sources = JSON.parse(await readFile('data/sources.json', 'utf8'));
const previous = await readFile('data/job-snapshot.json', 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return { jobs: [] }; throw error; });
const seeds = await loadCatalog(process.cwd(), { seedOnly: true });
const now = new Date().toISOString(), sourceResults = [], discovered = [], closedIds = new Set();
const seen = new Set();
const hash = text => createHash('sha256').update(text).digest('hex').slice(0, 12).toUpperCase();

for (const source of sources) {
  let count = 0, warning = null;
  try {
    const host = new URL(source.url).hostname;
    const pages = [await fetchOfficial(source.url, [host])];
    if (source.type === 'idp') {
      const $ = load(pages[0]);
      const next = [...new Set($('a[href*="startrow="],a[href*="/go/India/7862310/"]').map((_, node) => new URL($(node).attr('href'), source.url).href).get())].filter(url => url !== source.url && new URL(url).pathname !== new URL(source.url).pathname).slice(0, 5);
      for (const url of next) pages.push(await fetchOfficial(url, [host]));
    }
    const cards = pages.flatMap(html => discoverCards(source, html));
    // Some employers publish a generic careers page. Recheck known exact roles
    // there as well as discovering new role cards.
    for (const seed of seeds.filter(job => job.sourceId === source.id)) {
      if (!cards.some(card => listingKey(card) === listingKey(seed))) cards.push({ ...seed });
    }
    if (!cards.length || /we couldn't find|invalid-domain-header|there are no jobs/i.test(pages[0])) throw new Error('The career board did not expose usable listings.');
    for (const card of cards) {
      if (seen.has(listingKey(card))) continue;
      try {
        const genericPage = new URL(card.url).pathname.replace(/\/$/, '') === new URL(source.url).pathname.replace(/\/$/, '');
        const html = genericPage ? pages[0] : await fetchOfficial(card.url, [host]);
        const detail = jobDescription(html, card);
        const old = [...seeds, ...(previous.jobs || [])].find(job => listingKey(job) === listingKey(card));
        if (detail.availability === 'closed') { if (old) closedIds.add(old.id); continue; }
        const inferred = inferLocations(detailLocation(html));
        const locations = genericPage && card.locations?.length ? card.locations : inferred.length ? inferred : card.locations;
        if (!locations?.length) continue;
        const title = card.title;
        const job = { ...card, id: old?.id || `AUTO-${hash(listingKey(card))}`, sourceId: source.id, locations, brief: old?.brief || detail.description.slice(0, 1500), description: detail.description, publishedAt: detail.publishedAt || card.publishedAt || null, role: /partner/i.test(title) ? 'R1 Partnerships / R2 BD' : /counsell?or|student relation|admission/i.test(title) ? 'R3 Admissions Counselling' : 'R2 Business Development', fit: old?.fit || 'Medium', caution: old?.caution || 'Newly discovered role. Confirm requirements, seniority and work arrangement with the employer.' };
        discovered.push(job); seen.add(listingKey(job)); count++;
      } catch (error) { warning = 'Some role detail pages could not be read; their earlier records were preserved.'; }
    }
    if (!count) throw new Error('No relevant exact-role descriptions could be verified.');
    sourceResults.push({ id: source.id, company: source.company, status: warning ? 'partial' : 'ok', checkedAt: now, count, message: warning });
  } catch (error) { sourceResults.push({ id: source.id, company: source.company, status: 'failed', checkedAt: now, count: 0, message: error.message }); }
  console.log(`${source.id}: ${sourceResults.at(-1).status}; ${count} relevant listings verified`);
}
const success = new Set(sourceResults.filter(x => x.status === 'ok').map(x => x.id));
const jobs = mergeSnapshot(previous, seeds, discovered, success, now);
for (const job of jobs) if (closedIds.has(job.id)) { job.availability = 'closed'; job.checked = now.slice(0, 10); }
const snapshot = { updatedAt: now, jobs, sources: sourceResults };
await writeFile('data/job-snapshot.json', JSON.stringify(snapshot, null, 2) + '\n');
console.log(`Saved ${jobs.filter(x => x.availability !== 'closed').length} listings; ${jobs.filter(x => !x.isSeed && x.firstSeenAt === now).length} newly discovered.`);
if (sourceResults.every(source => source.status === 'failed')) process.exitCode = 1;
