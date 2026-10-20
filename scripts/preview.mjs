// Local website QA only. No OpenAI requests or deployment secrets.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import worker, { JobWorkspace } from '../src/worker.mjs';
import { memoryState, openAIResponse } from '../tests/helpers.mjs';
import { jobs } from '../.generated/data.mjs';

export async function startPreview() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://api.openai.com/')) return openAIResponse();
    const job = jobs.find(item => item.url === String(url));
    if (job) return new Response(`<h1>${job.title}</h1><main><p>Develop education partnerships, research opportunities, build relationships and manage student enrolment pipelines. Strong communication and business development experience required.</p></main>`);
    return originalFetch(url, options);
  };
  const env = { APP_ACCESS_PASSWORD: 'preview-only-private-passphrase', RESUME_GENERATION_ENABLED: 'true', OPENAI_API_KEY: 'local-test-placeholder-not-a-real-key', OPENAI_MODEL: 'gpt-4.1-mini' };
  const workspace = new JobWorkspace(memoryState(), env);
  env.WORKSPACE = { idFromName: value => value, get: () => workspace };
  const root = resolve('dist');
  env.ASSETS = { async fetch(request) {
    const path = new URL(request.url).pathname;
    const file = resolve(root, path === '/' ? 'index.html' : `.${path}`);
    if (!file.startsWith(root + sep)) return new Response('Not found', { status: 404 });
    try {
      let bytes = await readFile(file);
      return new Response(bytes, { headers: { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream' } });
    } catch { return new Response('Not found', { status: 404 }); }
  } };
  const server = createServer(async (req, res) => {
    try {
      const parts = []; for await (const part of req) parts.push(part);
      const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers: req.headers, ...(parts.length ? { body: Buffer.concat(parts) } : {}) });
      const response = await worker.fetch(request, env);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(500); res.end('Local preview error'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, password: env.APP_ACCESS_PASSWORD,
    async close() { globalThis.fetch = originalFetch; server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
