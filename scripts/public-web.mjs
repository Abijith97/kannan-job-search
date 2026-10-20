// Used only by the GitHub discovery job. DNS is checked AND pinned for each
// HTTPS request so a search result cannot reach a private or metadata address.
import { request } from 'node:https';
import { lookup } from 'node:dns';
import { isIP } from 'node:net';

export function publicJobUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || isIP(url.hostname) || !url.hostname.includes('.') || /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(url.hostname)) throw new Error('Not a public HTTPS job address.');
  url.hash = '';
  return url;
}
export function publicIPv4(address) {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
}
function checkedLookup(host, options, callback) {
  lookup(host, { all: true, family: 4 }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses.length || addresses.some(item => !publicIPv4(item.address))) return callback(new Error('The job host did not resolve to public addresses.'));
    const address = addresses[0];
    callback(null, options?.all ? [address] : address.address, address.family);
  });
}
function get(url) {
  return new Promise((resolve, reject) => {
    const req = request(url, { lookup: checkedLookup, headers: { 'User-Agent': 'KannanJobSearch/1.3 (personal job research)', Accept: 'text/html,application/xhtml+xml', 'Accept-Encoding': 'identity' } }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) { response.resume(); resolve({ redirect: response.headers.location }); return; }
      if (response.statusCode !== 200) { response.resume(); const error = new Error(`Job page returned HTTP ${response.statusCode}.`); error.status = response.statusCode; reject(error); return; }
      if (!/text\/html|application\/xhtml\+xml/i.test(response.headers['content-type'] || '')) { response.resume(); reject(new Error('The job link did not return a web page.')); return; }
      const chunks = []; let bytes = 0;
      response.on('data', chunk => { bytes += chunk.length; if (bytes > 2000000) req.destroy(new Error('Job page is too large.')); else chunks.push(chunk); });
      response.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8') }));
      response.on('error', reject);
    });
    const timer = setTimeout(() => req.destroy(new Error('Job page timed out.')), 15000);
    req.on('close', () => clearTimeout(timer)); req.on('error', reject); req.end();
  });
}
export async function fetchPublicPage(value) {
  let url = publicJobUrl(value);
  for (let hop = 0; hop < 4; hop++) {
    const result = await get(url);
    if (result.redirect) { url = publicJobUrl(new URL(result.redirect, url).href); continue; }
    return { html: result.html, url: url.href };
  }
  throw new Error('Too many redirects from the job page.');
}
