import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { loadCatalog, parseResume } from './catalog.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const jobs = await loadCatalog(root);
const profile = parseResume(await readFile(resolve(root, 'resume/Arun_Kannan_Resume.md'), 'utf8'));
const version = createHash('sha256').update(JSON.stringify({ jobs, profile })).digest('hex').slice(0, 16);
await mkdir(resolve(root, '.generated'), { recursive: true });
await writeFile(resolve(root, '.generated/data.mjs'), `// Server-only generated data. Never copy into dist.\nexport const jobs = ${JSON.stringify(jobs)};\nexport const profile = ${JSON.stringify(profile)};\nexport const dataVersion = ${JSON.stringify(version)};\n`);
await mkdir(resolve(root, 'dist'), { recursive: true });
await cp(resolve(root, 'web'), resolve(root, 'dist'), { recursive: true });
console.log(`Built private catalog: ${jobs.length} unique jobs. Public assets contain no resume or credentials.`);
