import { sortJobs } from './jobs.mjs';
const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const states = ['All states', 'Tamil Nadu', 'Kerala', 'Karnataka', 'Telangana', 'Maharashtra'];
let jobs = [], selectedState = 'All states', selectedJob = null, busyJob = null, generationAvailable = false, toastTimer;
const dialog = $('#resume-dialog');

async function api(path, options = {}) {
  let response;
  try { response = await fetch(path, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...options.headers } }); }
  catch { throw new Error('Could not connect. Check your connection and try again.'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/login') { showLogin(); if (dialog.open) dialog.close(); }
    throw new Error(data.error || 'Something went wrong. Please try again.');
  }
  return data;
}
function errorAt(selector, error) { const element = $(selector); if (element) { element.textContent = error?.message || ''; element.hidden = !error; } }
function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => $('#toast').hidden = true, 3500); }
function showLogin() { $('#loading').hidden = true; $('#workspace').hidden = true; $('#logout').hidden = true; $('#login-view').hidden = false; jobs = []; }
function locations(job) { return job.locations.filter(x => selectedState === 'All states' || x.state === selectedState); }

async function refresh() {
  const data = await api('/api/jobs'); jobs = data.jobs; generationAvailable = data.generationAvailable;
  $('#loading').hidden = true; $('#login-view').hidden = true; $('#workspace').hidden = false; $('#logout').hidden = false;
  $('#service-note').hidden = generationAvailable;
  $('#apply-help').textContent = 'Create custom resume prepares and downloads an editable Word file for the role. Review it in Word, then submit it using the employer’s application link.';
  const refreshInfo = data.refreshInfo;
  $('#refresh-info').textContent = refreshInfo?.updatedAt ? `Last checked ${new Date(refreshInfo.updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} IST. ${refreshInfo.sources.filter(x => x.status !== 'ok').length} source(s) need a recheck.` : 'Nightly employer checks are scheduled for 2:00 a.m. IST.';
  const discovery = refreshInfo?.discovery;
  if (!discovery) $('#discovery-info').textContent = 'Nightly web searches will find roles across employers in all five states and assess them against your resume. First search pending.';
  else {
    const searched = discovery.states.filter(state => state.status !== 'failed').length;
    const date = new Date(discovery.completedAt || refreshInfo.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    $('#discovery-info').textContent = `Profile-based web discovery · ${date} · ${searched}/5 states searched. ${discovery.phase === 'complete' ? `${discovery.acceptedCount || 0} new verified matches in the latest search.` : 'The latest assessment needs another check; earlier matches are preserved.'} Open “Why it fits” for the experience match and requirements to confirm.`;
  }
  render();
}

function render() {
  const query = $('#search').value.trim().toLowerCase();
  const status = $('#status-filter').value;
  const matchesStatus = job => status === 'all' || (status === 'recent' ? job.isNew : status === 'matched' ? Boolean(job.profileMatch) : job.status === status);
  const rows = sortJobs(jobs.filter(job => locations(job).length && matchesStatus(job) && `${job.title} ${job.company} ${job.locations.map(x => `${x.state} ${x.label}`).join(' ')}`.toLowerCase().includes(query)), $('#sort-order').value);
  $('#total-count').textContent = String(jobs.length).padStart(2, '0');
  $('#ready-count').textContent = String(jobs.filter(x => generationAvailable ? x.hasResume : x.status === 'interested').length).padStart(2, '0');
  $('#ready-label').textContent = generationAvailable ? 'resumes ready' : 'roles of interest';
  $('#status-filter option[value="ready"]').hidden = !generationAvailable;
  $('#result-count').textContent = rows.length;
  $('#state-filters').innerHTML = states.map(state => `<button type="button" data-state="${escape(state)}" aria-pressed="${state === selectedState}">${escape(state)}</button>`).join('');
  $('#job-rows').innerHTML = rows.map(job => {
    const local = locations(job);
    const primaryLocation = selectedState === 'All states' && job.locations.length > 1 ? `${job.locations.length} states` : local.map(x => x.label).join('; ');
    const secondaryLocation = selectedState === 'All states' ? local.map(x => x.state).join(' · ') : selectedState;
    const statusLabel = job.status === 'ready' ? 'Resume ready' : job.status === 'skipped' ? 'Skipped' : job.status === 'interested' ? 'Interested' : `${job.fit} fit`;
    return `<tr class="${job.status === 'skipped' ? 'skipped-row' : ''}" data-job-id="${escape(job.id)}"><td><div class="role-cell"><span class="company-mark" aria-hidden="true">${escape(job.company[0])}</span><div><span class="role-title">${escape(job.title)}${job.isNew ? '<span class="new-badge">New</span>' : ''}</span><div class="company-line">${escape(job.company)}<span class="role-badge ${job.status}">${escape(statusLabel)}</span></div></div></div></td><td><a class="job-link" href="${escape(job.url)}" target="_blank" rel="noopener noreferrer">View opening ↗</a></td><td class="location">${escape(primaryLocation)}<small>${escape(secondaryLocation)}</small></td><td class="published-date">${job.publishedAt ? escape(new Date(job.publishedAt + 'T12:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })) : '<span class="quiet">Date unavailable</span>'}<small>Checked ${escape(job.checked)}</small></td><td><div class="row-actions">${job.status === 'skipped' ? `<button class="button secondary" data-action="restore" data-id="${job.id}">Restore</button>` : `<button class="button primary" data-action="${job.hasResume ? 'review' : 'apply'}" data-id="${job.id}">${job.hasResume ? 'View resume' : 'Create custom resume'}</button><button class="text-button" data-action="skip" data-id="${job.id}" aria-label="Skip ${escape(job.title)} at ${escape(job.company)}">Skip</button>`}</div></td></tr>`;
  }).join('');
  for (const job of rows.filter(job => job.profileMatch)) {
    const match = job.profileMatch;
    const cell = document.querySelector(`tr[data-job-id="${job.id}"] .role-cell>div`);
    cell.insertAdjacentHTML('beforeend', `<details class="fit-details"><summary>Why it fits · ${escape(match.score)}/100</summary><p>${escape(match.reason)}</p>${match.requirements.length ? `<p><b>Check before applying:</b> ${escape(match.requirements.join(' '))}</p>` : ''}<a href="${escape(job.discoverySourceUrl)}" target="_blank" rel="noopener noreferrer">Source listing ↗</a></details>`);
  }
  $('#empty-state').hidden = rows.length !== 0;
  $('.table-wrap').hidden = rows.length === 0;
}

function renderPrepare(job) {
  if (!generationAvailable) {
    $('#dialog-content').innerHTML = `<h2 id="dialog-title">${escape(job.title)}</h2><p class="dialog-company">${escape(job.company)} · ${escape(job.locations.map(x => x.label).join(' / '))}</p><div class="role-details"><h3>What this role needs</h3><p>${escape(job.brief)}</p><p class="caution">Worth checking: ${escape(job.caution)}</p></div><p class="saved-mark">✓ Interest saved to your shortlist</p><p class="review-note">Listing checked ${escape(job.checked)}. Confirm availability and requirements on the employer's website.</p><div class="dialog-actions"><a class="button primary" href="${escape(job.url)}" target="_blank" rel="noopener noreferrer">Apply on employer site ↗</a></div>`;
    return;
  }
  $('#dialog-content').innerHTML = `<h2 id="dialog-title">${escape(job.title)}</h2><p class="dialog-company">${escape(job.company)} · ${escape(job.locations.map(x => x.label).join(' / '))}</p><div class="role-details"><h3>What this role needs</h3><p>${escape(job.brief)}</p><p class="caution">Worth checking: ${escape(job.caution)}</p></div><form id="prepare-form" class="job-form"><label for="job-description">Job description</label><textarea id="job-description" maxlength="16000" placeholder="Paste the employer's current responsibilities and requirements here…"></textarea><p id="description-note" class="form-note">We use the employer's current job description. If the page cannot be read, paste it here. Your supplied resume and this description are sent to OpenAI to select relevant experience.</p><p class="review-note">The Word file keeps your original titles, dates, qualifications and achievements. Review and edit it before applying.</p><p id="dialog-error" class="error" role="alert" hidden></p><div id="generation-status" class="generation-status" role="status" hidden><span class="spinner" aria-hidden="true"></span>Preparing your Word resume. This can take about a minute…</div><div class="dialog-actions"><button id="generate-button" class="button primary" type="submit" ${!generationAvailable || busyJob ? 'disabled' : ''}>Create and download Word ↓</button><a class="button secondary" href="${escape(job.url)}" target="_blank" rel="noopener noreferrer">Read the opening ↗</a></div>${busyJob ? '<p class="form-note">A resume is already being prepared. Please wait for it to finish.</p>' : ''}</form>`;
  $('#job-description').addEventListener('input', event => event.target.dataset.official = 'false');
  $('#prepare-form').addEventListener('submit', generate);
}

function renderResume(job, record) {
  const r = record.resume;
  $('#dialog-content').innerHTML = `<span class="saved-mark">✓ SAVED TO YOUR WORKSPACE</span><h2 id="dialog-title">Your resume is ready.</h2><p class="dialog-company">Prepared for ${escape(job.title)} · ${escape(job.company)}</p><div class="dialog-actions"><button class="button primary" data-download="docx">Download Word ↓</button><button class="button secondary" data-download="pdf">Download PDF ↓</button><a class="button secondary" href="${escape(job.url)}" target="_blank" rel="noopener noreferrer">Apply on employer site ↗</a></div><p class="review-note">Open the Word download to make any changes. Review your resume before submitting it. No application has been sent. Prepared ${escape(new Date(record.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }))} using ${escape(record.source.toLowerCase())}.</p>${job.resumeOutdated ? '<p class="notice">The saved job or resume source has changed since this document was prepared. Use the latest details to prepare a new version.</p>' : ''}<div class="resume-summary"><p><b>What this version emphasizes</b></p><p>${escape(record.rationale)}</p>${record.gaps.length ? `<b>Before you apply</b><ul>${record.gaps.map(x => `<li>${escape(x)}</li>`).join('')}</ul>` : ''}</div><article class="resume-paper" aria-label="Resume preview"><h3>${escape(r.name)}</h3><p>${escape(r.headline)}</p><p class="contact">${r.contact.map(escape).join('<br>')}</p><h4>PROFILE</h4><p>${escape(r.summary.join(' '))}</p><h4>CORE SKILLS</h4><p>${r.skills.map(escape).join(' · ')}</p><h4>EXPERIENCE</h4>${r.experiences.map(x => `<p class="role">${escape(x.title)}</p><p class="meta">${escape(x.employer)} · ${escape(x.dates)}</p><ul>${x.bullets.map(b => `<li>${escape(b)}</li>`).join('')}</ul>`).join('')}<h4>EDUCATION</h4>${r.education.map(x => `<p><b>${escape(x.degree)}</b><br>${escape(x.detail)}</p>`).join('')}<h4>CERTIFICATIONS</h4><ul>${r.certifications.map(x => `<li>${escape(x)}</li>`).join('')}</ul></article><p id="dialog-error" role="alert" class="error" hidden></p><div class="dialog-actions"><button id="different-details" class="text-button">Prepare with different job details ↗</button></div>`;
  $('#different-details').addEventListener('click', () => renderPrepare(job));
  for (const button of dialog.querySelectorAll('[data-download]')) button.addEventListener('click', () => download(job, button));
}

async function generate(event) {
  event.preventDefault(); if (busyJob || !selectedJob) return;
  const job = selectedJob; busyJob = job.id;
  const description = $('#job-description').dataset.official === 'true' ? '' : $('#job-description').value;
  $('#generate-button').disabled = true; $('#generation-status').hidden = false; errorAt('#dialog-error', null);
  try {
    const record = await api(`/api/jobs/${job.id}/resume`, { method: 'POST', body: JSON.stringify({ description }) });
    await refresh();
    if (selectedJob?.id === job.id && dialog.open) renderResume(jobs.find(x => x.id === job.id), record);
    await download(job, { dataset: { download: 'docx' } });
    toast(`Resume saved for ${job.company}.`);
  } catch (error) { if (selectedJob?.id === job.id && dialog.open) errorAt('#dialog-error', error); else toast(error.message); }
  finally { busyJob = null; if ($('#generate-button')) $('#generate-button').disabled = !generationAvailable; if ($('#generation-status')) $('#generation-status').hidden = true; }
}

async function download(job, button) {
  button.disabled = true; errorAt('#dialog-error', null);
  try {
    const response = await fetch(`/api/jobs/${job.id}/download?format=${button.dataset.download}`, { credentials: 'same-origin' });
    if (!response.ok) throw new Error((await response.json()).error || 'Download failed. Please try again.');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || `Arun_Kannan_${job.id}.${button.dataset.download}`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (error) { errorAt('#dialog-error', error); }
  finally { button.disabled = false; }
}

$('#login-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.currentTarget.querySelector('button'); button.disabled = true; errorAt('#login-error', null);
  try { await api('/api/login', { method: 'POST', body: JSON.stringify({ password: $('#password').value }) }); $('#password').value = ''; await refresh(); }
  catch (error) { errorAt('#login-error', error); }
  finally { button.disabled = false; }
});
$('#logout').addEventListener('click', async () => { try { await api('/api/logout', { method: 'POST', body: '{}' }); showLogin(); } catch (error) { toast(error.message); } });
$('#search').addEventListener('input', render);
$('#status-filter').addEventListener('change', render);
$('#sort-order').addEventListener('change', render);
$('#state-filters').addEventListener('click', event => { const button = event.target.closest('[data-state]'); if (button) { selectedState = button.dataset.state; render(); } });
$('#reset-filters').addEventListener('click', () => { selectedState = 'All states'; $('#status-filter').value = 'all'; $('#search').value = ''; render(); });
$('#close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => selectedJob = null);
$('#job-rows').addEventListener('click', async event => {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const job = jobs.find(x => x.id === button.dataset.id); if (!job) return;
  errorAt('#workspace-error', null);
  if (['skip', 'restore'].includes(button.dataset.action)) {
    button.disabled = true;
    try { await api(`/api/jobs/${job.id}/decision`, { method: 'POST', body: JSON.stringify({ decision: button.dataset.action === 'skip' ? 'skipped' : 'new' }) }); await refresh(); toast(button.dataset.action === 'skip' ? 'Skipped for now. You can restore this role anytime.' : 'Role restored to your shortlist.'); }
    catch (error) { errorAt('#workspace-error', error); button.disabled = false; }
    return;
  }
  if (!generationAvailable && button.dataset.action === 'apply') {
    button.disabled = true;
    try { await api(`/api/jobs/${job.id}/decision`, { method: 'POST', body: JSON.stringify({ decision: 'interested' }) }); await refresh(); }
    catch (error) { errorAt('#workspace-error', error); button.disabled = false; return; }
  }
  selectedJob = job; renderPrepare(job); dialog.showModal();
  if (generationAvailable && button.dataset.action === 'apply') {
    if (busyJob) return;
    $('#generate-button').disabled = true;
    $('#description-note').textContent = 'Reading the employer’s current job description…';
    try {
      const detail = await api(`/api/jobs/${job.id}/details`);
      if (selectedJob?.id !== job.id || !dialog.open) return;
      $('#job-description').value = detail.description;
      $('#job-description').dataset.official = 'true';
      $('#description-note').textContent = 'Using the current employer job description. Your editable Word resume will download when ready.';
      await generate({ preventDefault() {} });
    } catch (error) { if (selectedJob?.id === job.id && dialog.open) { errorAt('#dialog-error', error); $('#description-note').textContent = 'Paste the current employer job description, then choose Create and download Word.'; $('#generate-button').disabled = false; } }
  }
  if (button.dataset.action === 'review') {
    $('#dialog-content').innerHTML = '<h2 id="dialog-title">Opening your resume…</h2>';
    try { const record = await api(`/api/jobs/${job.id}/resume`); if (selectedJob?.id === job.id && dialog.open) renderResume(job, record); }
    catch (error) { if (selectedJob?.id === job.id && dialog.open) { renderPrepare(job); errorAt('#dialog-error', error); } }
  }
});

try { const session = await api('/api/session'); if (session.authenticated) await refresh(); else showLogin(); }
catch (error) { showLogin(); errorAt('#login-error', error); }
