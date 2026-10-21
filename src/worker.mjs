import { jobs, profile, dataVersion, refreshInfo, sourceHosts } from '../.generated/data.mjs';
import { AppError, curateResume, resumeText } from './curation.mjs';
import { makePdf } from './pdf.mjs';
import { makeDocx } from './docx.mjs';
import { fetchOfficial, jobDescription } from './listings.mjs';
import { atsDetails } from './ats.mjs';
import { sortJobs, isNewListing } from '../web/jobs.mjs';

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const sha = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(x => x.toString(16).padStart(2, '0')).join('');
const cookieName = 'kannan_session';
const sessionAge = 7 * 86400;
const secretReady = value => typeof value === 'string' && value.length >= 16 && !value.startsWith('replace-with-');
const cookie = (token, url, age = sessionAge) => `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${url.protocol === 'https:' ? '; Secure' : ''}`;

async function body(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AppError('JSON request required.', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError('Request body is required.');
  const chunks = []; let length = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > 72000) { await reader.cancel(); throw new AppError('Job details are too long. Keep them below 16,000 characters.', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new AppError('Invalid request.'); }
}

export class JobWorkspace {
  constructor(state, env) { this.state = state; this.env = env; this.pending = null; }

  async session(request) {
    if (!secretReady(this.env.APP_ACCESS_PASSWORD)) return null;
    const token = request.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const key = `session:${await sha(token)}`;
    const record = await this.state.storage.get(key);
    if (!record || record.expires < Date.now() || record.passwordHash !== await sha(this.env.APP_ACCESS_PASSWORD)) return null;
    return key;
  }

  async login(request, url) {
    if (!secretReady(this.env.APP_ACCESS_PASSWORD)) throw new AppError('The site owner needs to configure the sign-in passphrase.', 503);
    const input = await body(request);
    if (typeof input?.password !== 'string' || input.password.length > 256) throw new AppError('Enter your access passphrase.');
    const ip = await sha(request.headers.get('CF-Connecting-IP') || 'local');
    await this.state.storage.transaction(async tx => {
      const now = Date.now();
      const key = `login:${ip}`;
      const previous = await tx.get(key);
      const rate = previous && previous.until > now ? previous : { count: 0, until: now + 600000 };
      if (rate.count >= 8) throw new AppError('Too many sign-in attempts. Try again in ten minutes.', 429);
      rate.count++; await tx.put(key, rate);
    });
    const supplied = await sha(input.password), expected = await sha(this.env.APP_ACCESS_PASSWORD);
    let difference = 0;
    for (let i = 0; i < supplied.length; i++) difference |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
    if (difference) throw new AppError('That passphrase is not correct.', 401);
    const token = [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, '0')).join('');
    await this.state.storage.put(`session:${await sha(token)}`, { expires: Date.now() + sessionAge * 1000, passwordHash: expected });
    await this.state.storage.delete(`login:${ip}`);
    if (this.state.storage.setAlarm) await this.state.storage.setAlarm(Date.now() + 86400000);
    return json({ authenticated: true }, 200, { 'Set-Cookie': cookie(token, url) });
  }

  async alarm() {
    for (const prefix of ['session:', 'login:']) {
      const records = await this.state.storage.list({ prefix });
      const expired = [...records].filter(([, value]) => (value.expires || value.until) < Date.now()).map(([key]) => key);
      if (expired.length) await this.state.storage.delete(expired);
    }
    await this.state.storage.setAlarm(Date.now() + 86400000);
  }

  async reserveGeneration() {
    const date = new Date().toISOString().slice(0, 10);
    const configured = Number(this.env.DAILY_GENERATION_LIMIT || 20);
    const limit = Number.isInteger(configured) && configured > 0 ? Math.min(configured, 100) : 20;
    await this.state.storage.transaction(async tx => {
      const previous = await tx.get('daily-usage');
      const usage = previous?.date === date ? previous : { date, count: 0 };
      if (usage.count >= limit) throw new AppError('Today’s resume limit has been reached. Saved resumes can still be downloaded. Try again tomorrow (UTC).', 429);
      usage.count++; await tx.put('daily-usage', usage);
    });
  }

  async generate(job, input) {
    if (this.env.RESUME_GENERATION_ENABLED !== 'true') throw new AppError('Resume preparation is not enabled yet.', 503);
    if (typeof input?.description !== 'string' || input.description.length > 16000) throw new AppError('Job details must be text under 16,000 characters.');
    let description = input.description.trim();
    if (description && description.length < 40) throw new AppError('Paste at least 40 characters of the current job description.');
    let source = 'Pasted job description';
    if (!description) {
      const detail = await this.details(job);
      description = detail.description;
      source = 'Current employer job description';
    }
    const sourceHash = await sha(`${dataVersion}:${this.env.OPENAI_MODEL}:${job.id}:${description}`);
    const cached = await this.state.storage.get(`resume:${job.id}`);
    if (cached?.sourceHash === sourceHash) return json(cached);
    if (this.pending) throw new AppError('A resume is already being prepared. Please wait for it to finish.', 409);
    if (!secretReady(this.env.OPENAI_API_KEY)) throw new AppError('The site owner needs to connect the resume service. You can still browse and skip jobs.', 503);
    this.pending = job.id;
    try {
      await this.reserveGeneration();
      const result = await curateResume({ profile, job, description, apiKey: this.env.OPENAI_API_KEY, model: this.env.OPENAI_MODEL || 'gpt-4.1-mini' });
      const record = { ...result, jobId: job.id, company: job.company, title: job.title, createdAt: new Date().toISOString(), source, jobUrl: job.url, sourceHash, dataVersion };
      await this.state.storage.put(`resume:${job.id}`, record);
      await this.state.storage.put(`decision:${job.id}`, 'new');
      return json(record);
    } finally { this.pending = null; }
  }

  async details(job) {
    if (job.availability === 'closed') throw new AppError('This listing is marked closed. Choose another role.', 410);
    const cached = await this.state.storage.get(`description:${job.id}`);
    if (cached?.fetchedAt > Date.now() - 6 * 3600000 && cached.url === job.url) return cached;
    try {
      const html = await fetchOfficial(job.detailUrl || job.url, sourceHosts);
      const detail = job.detailFormat ? atsDetails(html, job) : jobDescription(html, job);
      if (detail.availability === 'closed') throw new AppError('The employer has marked this listing closed.', 410);
      const result = { ...detail, fetchedAt: Date.now(), url: job.url };
      await this.state.storage.put(`description:${job.id}`, result);
      return result;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('The employer’s job description could not be read. Paste the current job description below to continue.', 422);
    }
  }

  async route(request) {
    const url = new URL(request.url);
    if (!['GET', 'POST'].includes(request.method)) throw new AppError('Method not allowed.', 405);
    if (request.method === 'POST' && request.headers.get('origin') !== url.origin) throw new AppError('This request must come from the job-search website.', 403);
    if (url.pathname === '/api/login' && request.method === 'POST') return this.login(request, url);
    const session = await this.session(request);
    if (url.pathname === '/api/session' && request.method === 'GET') return json({ authenticated: Boolean(session) });
    if (!session) throw new AppError('Please sign in to continue.', 401);
    if (url.pathname === '/api/logout' && request.method === 'POST') { await this.state.storage.delete(session); return json({ ok: true }, 200, { 'Set-Cookie': cookie('', url, 0) }); }
    if (url.pathname === '/api/jobs' && request.method === 'GET') {
      const [decisions, resumes] = await Promise.all([this.state.storage.list({ prefix: 'decision:' }), this.state.storage.list({ prefix: 'resume:' })]);
      return json({ jobs: sortJobs(jobs.filter(job => job.availability !== 'closed')).map(job => ({ ...job, isNew: isNewListing(job), status: decisions.get(`decision:${job.id}`) === 'skipped' ? 'skipped' : resumes.has(`resume:${job.id}`) ? 'ready' : decisions.get(`decision:${job.id}`) === 'interested' ? 'interested' : 'new', hasResume: resumes.has(`resume:${job.id}`), resumeOutdated: resumes.has(`resume:${job.id}`) && resumes.get(`resume:${job.id}`).dataVersion !== dataVersion })), generationAvailable: this.env.RESUME_GENERATION_ENABLED === 'true' && secretReady(this.env.OPENAI_API_KEY), refreshInfo });
    }
    const match = url.pathname.match(/^\/api\/jobs\/([A-Z0-9-]+)\/(decision|resume|download|details)$/);
    const job = match && jobs.find(x => x.id === match[1]);
    if (!job) throw new AppError('Job not found.', 404);
    const action = match[2];
    if (action === 'details' && request.method === 'GET') return json(await this.details(job));
    if (action === 'decision' && request.method === 'POST') {
      const input = await body(request);
      if (!['new', 'skipped', 'interested'].includes(input?.decision)) throw new AppError('Invalid job decision.');
      await this.state.storage.put(`decision:${job.id}`, input.decision);
      return json({ ok: true });
    }
    if (action === 'resume' && request.method === 'POST') return this.generate(job, await body(request));
    const record = await this.state.storage.get(`resume:${job.id}`);
    if (!record) throw new AppError('Prepare a resume for this job first.', 404);
    if (action === 'resume' && request.method === 'GET') return json(record);
    if (action === 'download' && request.method === 'GET') {
      const format = url.searchParams.get('format') || 'docx';
      if (!['docx', 'pdf', 'txt'].includes(format)) throw new AppError('Unsupported download format.');
      const content = format === 'docx' ? await makeDocx(record.resume) : format === 'pdf' ? await makePdf(record.resume) : resumeText(record.resume);
      const filename = `Arun_Kannan_${job.company.replace(/[^a-zA-Z0-9]+/g, '_')}_${job.id}.${format}`;
      return new Response(content, { headers: { 'Content-Type': format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : format === 'pdf' ? 'application/pdf' : 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' } });
    }
    throw new AppError('Method not allowed.', 405);
  }

  async fetch(request) {
    try { return await this.route(request); }
    catch (error) { return json({ error: error instanceof AppError ? error.message : 'Something went wrong. Please try again.' }, error instanceof AppError ? error.status : 500); }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let response;
    try {
      response = url.pathname.startsWith('/api/')
        ? await env.WORKSPACE.get(env.WORKSPACE.idFromName('arun-private-workspace')).fetch(request)
        : await env.ASSETS.fetch(request);
    } catch { response = json({ error: 'The service is temporarily unavailable.' }, 503); }
    const secured = new Response(response.body, response);
    secured.headers.set('X-Content-Type-Options', 'nosniff');
    secured.headers.set('Referrer-Policy', 'no-referrer');
    secured.headers.set('X-Frame-Options', 'DENY');
    secured.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    secured.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (url.protocol === 'https:') secured.headers.set('Strict-Transport-Security', 'max-age=31536000');
    return secured;
  }
};
