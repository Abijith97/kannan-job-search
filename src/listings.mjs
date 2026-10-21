import { load } from 'cheerio/slim';

export const targetStates = ['Tamil Nadu', 'Kerala', 'Karnataka', 'Telangana', 'Maharashtra'];
const cityStates = [
  ['Tamil Nadu', /\b(chennai|coimbatore|tamil\s*nadu|madurai|trichy|tiruchirappalli)\b/i],
  ['Kerala', /\b(kerala|kochi|cochin|trivandrum|thiruvananthapuram|kannur|cherthala|kattappana|mavelikkara|kothamangalam|muvattupuzha|thiruvambady|thrissur|kozhikode|calicut|kottayam)\b/i],
  ['Karnataka', /\b(karnataka|bengaluru|bangalore|mysuru|mysore|mangalore)\b/i],
  ['Telangana', /\b(telangana|hyderabad|secunderabad)\b/i],
  ['Maharashtra', /\b(maharashtra|mumbai|pune|nagpur|nashik|thane|navi\s*mumbai)\b/i]
];
export const cleanText = text => String(text || '').replace(/\s+/g, ' ').trim();
export const normalizedTitle = text => cleanText(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function htmlText(html) {
  let input = String(html || ''), result = '';
  for (let pass = 0; pass < 2; pass++) {
    const $ = load(input); $('script,style,noscript,nav,header,footer,svg').remove();
    $('br').replaceWith('\n'); $('p,li,div,h1,h2,h3,h4,h5,h6,button,article,section').prepend('\n').append('\n');
    result = $.root().text().replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
    if (!/<\/?(?:p|div|span|h[1-6]|table|ul|li)\b[^>]*>/i.test(result)) break;
    input = result;
  }
  return result;
}
export function canonicalUrl(value, base) {
  const url = new URL(value, base);
  if (url.protocol !== 'https:') throw new Error('Only HTTPS job links are supported.');
  url.hash = ''; for (const key of [...url.searchParams.keys()]) if (/^(utm_|ref$|source$)/i.test(key)) url.searchParams.delete(key);
  return url.href.replace(/\/$/, '');
}
export function listingKey(job) {
  const url = new URL(canonicalUrl(job.url));
  // Freshteam uses both /applicants and readable slugs for the same requisition.
  if (url.hostname.endsWith('.freshteam.com')) url.pathname = url.pathname.match(/^\/jobs\/[^/]+/)?.[0] || url.pathname;
  return `${url.href.replace(/\/$/, '')}|${normalizedTitle(job.title)}`;
}
export function publishedDate(value, now = new Date()) {
  if (typeof value !== 'string') return null;
  let date = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(date)) {
    const m = date.match(/\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(20\d{2})\b/i);
    if (!m) return null;
    const month = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    date = `${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  const timestamp = Date.parse(date);
  if (!Number.isFinite(timestamp) || timestamp > now.getTime() + 86400000) return null;
  const result = new Date(timestamp).toISOString().slice(0, 10);
  return result === date.slice(0, 10) ? result : null;
}
export function inferLocations(label) {
  const text = cleanText(label);
  return cityStates.filter(([, pattern]) => pattern.test(text)).map(([state, pattern]) => {
    const matched = text.match(pattern)?.[0] || state;
    return { state, label: text.length > 160 ? matched[0].toUpperCase() + matched.slice(1) : text };
  });
}
export function suitableTitle(title) {
  return /business development|\bBDE\b|partner(ship| acquisition| relations| success)|student relation|counsell?or|admission|recruitment representative|relationship (manager|executive)|external marketing executive|community (executive|associate|growth)|customer success|account (executive|management associate)|(?:inside|channel|development|operations) sales|sales (development|operations|coordinator)|business operations|social media|content (writer|marketing|executive)|marketing coordinator|market research/i.test(title)
    && !/head\b|director|vice president|psycholog|therap|clinical|intern(ship)?\b|trainer/i.test(title);
}
export function structuredJobs(html) {
  const $ = load(html), found = [];
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if ([value['@type']].flat().includes('JobPosting')) found.push(value);
    if (value['@graph']) visit(value['@graph']);
    if (value.itemListElement) value.itemListElement.forEach(item => visit(item.item || item));
  }
  $('script[type="application/ld+json"]').each((_, node) => { try { visit(JSON.parse($(node).text())); } catch {} });
  return found;
}
export function jobDescription(html, job, now = new Date()) {
  const structured = structuredJobs(html).find(x => normalizedTitle(x.title) === normalizedTitle(job.title));
  const $ = load(html);
  const title = cleanText($('h1').first().text());
  const pageText = htmlText(html);
  const expires = structured?.validThrough ? Date.parse(structured.validThrough) : null;
  let description = structured?.description ? htmlText(structured.description) : '';
  let visibleDescription = '';
  {
    if (normalizedTitle(title) === normalizedTitle(job.title)) {
      const container = $('h1').first().closest('main,article,.job-description,.content');
      visibleDescription = htmlText(container.length ? container.html() : html);
    } else {
      // Keep this vacancy's subheadings (requirements/responsibilities). Stopping
      // at every h4 previously discarded most of a multi-role page's details.
      const heading = $('h2,h3,h4,h5,h6').filter((_, node) => normalizedTitle($(node).text()) === normalizedTitle(job.title)).first();
      const level = Number(heading[0]?.tagName.slice(1)) || 3;
      const lines = pageText.split('\n').map(cleanText).filter(Boolean);
      const start = lines.findIndex(line => normalizedTitle(line) === normalizedTitle(job.title));
      if (start >= 0) {
        const selected = [];
        const headings = new Set($('h1,h2,h3,h4,h5,h6').filter((_, node) => Number(node.tagName.slice(1)) <= level).map((_, node) => normalizedTitle($(node).text())).get());
        for (const line of lines.slice(start + 1)) {
          if (headings.has(normalizedTitle(line)) && selected.length) break;
          if (/^apply(?: now)?\s*[→↗]?$/i.test(line)) continue;
          if (/^(?:current openings|related jobs|our hiring process|about us)$/i.test(line)) break;
          selected.push(line); if (selected.join('\n').length > 9000) break;
        }
        visibleDescription = `${job.title}\n${selected.join('\n')}`;
      }
    }
  }
  // JobPosting metadata is sometimes only a one-line SEO teaser. Prefer the
  // longer, exact-role visible section, while retaining metadata dates/expiry.
  if (description.length < 500 && visibleDescription.length > description.length) description = visibleDescription;
  const explicitlyClosed = /no longer accepting applications|position (?:has been |is )?closed|job (?:has been |is )?(?:closed|expired)|no longer available/i.test(description);
  if (explicitlyClosed || (Number.isFinite(expires) && expires < now.getTime())) return { description: '', publishedAt: publishedDate(structured?.datePosted, now), availability: 'closed' };
  if (description.length < 40 || (!suitableTitle(job.title) && !['profile-web-search', 'profile-assessed-employer'].includes(job.discoveryMethod))) throw new Error('A usable description for this exact role could not be read.');
  const posted = publishedDate(structured?.datePosted || $('[itemprop="datePosted"]').attr('content') || $('[itemprop="datePosted"]').text(), now);
  return { description: description.slice(0, 16000), publishedAt: posted, availability: 'open' };
}

export async function fetchOfficial(url, allowedHosts, fetcher = fetch) {
  let target = new URL(url);
  const allowed = new Set(allowedHosts);
  for (let redirect = 0; redirect < 4; redirect++) {
    if (target.protocol !== 'https:' || !allowed.has(target.hostname) || target.username || target.password || (target.port && target.port !== '443')) throw new Error('Unapproved job-page address.');
    const response = await fetcher(target.href, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'KannanJobSearch/1.2 (personal career shortlist)', Accept: 'text/html,application/json' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) { target = new URL(response.headers.get('location'), target); continue; }
    if (!response.ok) throw new Error(`Employer page returned HTTP ${response.status}.`);
    if (Number(response.headers.get('content-length') || 0) > 2000000) throw new Error('Employer page is too large.');
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 2000000) { await reader.cancel(); throw new Error('Employer page is too large.'); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return new TextDecoder().decode(bytes);
  }
  throw new Error('Too many employer-page redirects.');
}
