import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const states = ['Tamil Nadu', 'Kerala', 'Karnataka', 'Telangana', 'Maharashtra'];
export async function loadCatalog(root) {
  const details = JSON.parse(await readFile(resolve(root, 'data/job-details.json'), 'utf8'));
  const catalog = new Map();
  for (const state of states) {
    const file = state.toLowerCase().replaceAll(' ', '_');
    const source = await readFile(resolve(root, `companies/${file}.md`), 'utf8');
    for (const line of source.split(/\r?\n/)) {
      const cells = line.split('|').slice(1, -1).map(x => x.trim());
      if (cells.length !== 7 || !/^(SM-|ZOLVE-|ENV-|IDP-|COK-|LEAP-|VIAVIFA-)/.test(cells[0])) continue;
      const [id, company, title, location, link, checked, role] = cells;
      const url = link.match(/\]\((https:\/\/[^)]+)\)/)?.[1];
      if (!url || !details[id]) throw new Error(`Missing URL or researched details for ${id}`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(checked)) throw new Error(`Invalid checked date: ${id}`);
      const existing = catalog.get(id);
      if (existing && (existing.url !== url || existing.title !== title)) throw new Error(`Conflicting shared listing: ${id}`);
      const job = existing || { id, company, title, url, checked, role, locations: [], ...details[id] };
      job.locations.push({ state, label: location });
      catalog.set(id, job);
    }
  }
  for (const id of Object.keys(details)) if (!catalog.has(id)) throw new Error(`Stale job details: ${id}`);
  return [...catalog.values()];
}

export function parseResume(markdown) {
  const section = name => markdown.split(`## ${name}`)[1]?.split('\n## ')[0]?.trim() || '';
  const clean = text => text.replaceAll('**', '').trim();
  const bullets = text => [...text.matchAll(/^- (.+)$/gm)].map(m => m[1].trim());
  const experiences = section('Work Experience').split(/^### /m).slice(1).map((chunk, i) => {
    const lines = chunk.trim().split(/\r?\n/).filter(x => x.trim());
    return { id: `experience-${i + 1}`, title: clean(lines[0]), employer: clean(lines[1]), dates: clean(lines[2]),
      bullets: bullets(chunk).map((text, j) => ({ id: `experience-${i + 1}-fact-${j + 1}`, text })) };
  });
  const education = section('Education').split(/^### /m).slice(1).map(chunk => {
    const lines = chunk.trim().split(/\r?\n/).filter(x => x.trim());
    return { degree: clean(lines[0]), detail: clean(lines[1]) };
  });
  const skills = bullets(section('Core Skills')).map((text, i) => ({ id: `skill-${i + 1}`, text }));
  const summary = section('Professional Summary').split(/(?<=\.)\s+/).filter(Boolean).map((text, i) => ({ id: `summary-${i + 1}`, text }));
  const contact = bullets(markdown.split('## Professional Summary')[0]).map(clean);
  const profile = { name: markdown.match(/^# (.+)/m)?.[1], headline: markdown.match(/^\*\*(.+)\*\*$/m)?.[1], contact, summary, experiences, education, skills, certifications: bullets(section('Certifications')) };
  if (!profile.name || experiences.length !== 4 || education.length !== 2 || !summary.length || contact.length !== 4 || !skills.length || experiences.some(x => !x.bullets.length || !x.dates)) throw new Error('Resume structure changed. Review parser before deploying.');
  return profile;
}
