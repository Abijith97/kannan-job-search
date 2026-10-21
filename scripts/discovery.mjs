import { load } from 'cheerio/slim';
import { cleanText, canonicalUrl, htmlText, inferLocations, publishedDate, structuredJobs, suitableTitle, normalizedTitle, listingKey, jobDescription } from '../src/listings.mjs';

export function discoverCards(source, html, now = new Date()) {
  const $ = load(html), found = [];
  function add(title, href, location = '', brief = '', date = null) {
    title = cleanText(title);
    if (!suitableTitle(title)) return;
    let url; try { url = canonicalUrl(href, source.url); } catch { return; }
    if (new URL(url).hostname !== new URL(source.url).hostname) return;
    found.push({ sourceId: source.id, company: source.company, title, url, locations: inferLocations(location), locationText: cleanText(location), brief: cleanText(brief), publishedAt: publishedDate(date, now) });
  }
  for (const structured of structuredJobs(html)) {
    const addresses = [structured.jobLocation].flat().filter(Boolean).map(x => x.address || x);
    add(structured.title, structured.url || source.url, addresses.map(x => [x.addressLocality, x.addressRegion, x.addressCountry].filter(Boolean).join(', ')).join('; '), htmlText(structured.description || ''), structured.datePosted);
  }
  if (source.type === 'headings' || source.type === 'vacancy') {
    const titles = source.type === 'vacancy' ? [source.title] : [...new Set($('h1,h2,h3,h4,h5,h6').map((_, node) => cleanText($(node).text())).get())];
    for (const title of titles.filter(suitableTitle)) {
      try {
        const detail = jobDescription(html, { title, url: source.url, discoveryMethod: 'profile-web-search' }, now);
        if (detail.availability !== 'closed' && detail.description.length >= 120) add(title, source.url, detail.description, detail.description, detail.publishedAt);
      } catch { /* An index entry without a full description is not a vacancy. */ }
    }
  } else if (source.type === 'idp') {
    $('tr.data-row').each((_, row) => {
      const node = $(row), link = node.find('a.jobTitle-link').first();
      add(link.text(), link.attr('href'), node.find('.jobLocation').first().text(), '', node.find('.jobDate').first().text());
    });
  } else if (source.type === 'freshteam') {
    $('a[href*="/jobs/"]').each((_, node) => {
      const link = $(node);
      add(link.find('.job-title').text(), link.attr('href'), link.attr('data-portal-location') || link.find('.location-info').text(), link.find('.job-desc').text());
    });
  } else if (source.type === 'santamonica') {
    $('a[href*="/career/"]').each((_, node) => { const link = $(node); add(link.find('h3').first().text(), link.attr('href'), link.find('.options').text()); });
  } else if (source.type === 'envision') {
    $('p').each((_, node) => {
      const lines = htmlText($(node).html()).split('\n').map(cleanText).filter(Boolean);
      if (lines[0] && /–|—| - /.test(lines[0])) add(lines[0], source.url, lines[0].split(/–|—| - /).at(-1), lines.slice(1).join(' '));
    });
  } else if (source.type === 'cokonet') {
    $('h4').each((_, node) => { const area = $(node).parent(); const body = cleanText(area.text()); if (!/\b[5-9]\+?\s*years/i.test(body)) add($(node).text(), source.url, body.match(/Full time\s*[·|]\s*([^·|]+)/i)?.[1] || '', body); });
  } else if (source.type === 'viavifa') {
    const lines = htmlText(html).split('\n').map(cleanText).filter(Boolean);
    $('h3').each((_, node) => {
      const title = cleanText($(node).text()), index = lines.findIndex(x => x === title);
      const next = lines.slice(index + 1, index + 25).join(' ');
      if (!/immigration|team lead|branch manager/i.test(title)) add(title, source.url, next.match(/Location\s*:\s*(.*?)(?:Job Function|Department)/i)?.[1] || '', next);
    });
  }
  const unique = new Map(found.map(job => [`${job.url}|${normalizedTitle(job.title)}`, job]));
  return [...unique.values()];
}

export function detailLocation(html) {
  const lines = htmlText(html).split('\n').map(cleanText).filter(Boolean);
  const index = lines.findIndex(line => /^Location\s*:/i.test(line));
  if (index >= 0) return cleanText(lines[index].replace(/^Location\s*:/i, '') || lines[index + 1]);
  const structured = structuredJobs(html)[0];
  if (structured?.description) {
    const descriptionLines = htmlText(structured.description).split('\n').map(cleanText).filter(Boolean);
    const at = descriptionLines.findIndex(line => /^Location\s*:/i.test(line));
    if (at >= 0) return cleanText(descriptionLines[at].replace(/^Location\s*:/i, '') || descriptionLines[at + 1]);
  }
  if (structured?.jobLocation) return [structured.jobLocation].flat().map(x => [x.address?.addressLocality, x.address?.addressRegion].filter(Boolean).join(', ')).join('; ');
  return '';
}

export function mergeSnapshot(previous, seeds, discovered, successfulSources, now) {
  const identity = listingKey;
  const existing = new Map(seeds.map(job => [job.id, job]));
  for (const job of previous.jobs || []) {
    const duplicate = [...existing.values()].find(old => identity(old) === identity(job));
    if (duplicate && duplicate.id !== job.id) continue;
    existing.set(job.id, job);
  }
  const byIdentity = new Map([...existing.values()].map(job => [identity(job), job]));
  for (const job of discovered) {
    const old = byIdentity.get(identity(job));
    const merged = { ...old, ...job, id: old?.id || job.id, firstSeenAt: old?.firstSeenAt || now, isSeed: old?.isSeed || false, publishedAt: job.publishedAt || old?.publishedAt || null, checked: now.slice(0, 10), lastVerifiedAt: now, availability: 'open', missingCount: 0 };
    existing.set(merged.id, merged); byIdentity.set(identity(merged), merged);
  }
  // A failed or partially read source cannot remove any listing. An explicit
  // closure from a detail page may be supplied separately by the collector.
  for (const job of existing.values()) {
    if (!discovered.some(item => identity(item) === identity(job))) {
      const sourceSucceeded = successfulSources.has(job.sourceId);
      if (sourceSucceeded && !job.lastVerifiedAt) job.availability = 'unknown';
    }
  }
  return [...existing.values()];
}
