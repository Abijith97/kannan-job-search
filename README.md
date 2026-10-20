# Arun Kannan — job search

Job-search research for Arun Kannan across **Tamil Nadu, Kerala, Karnataka, Telangana, and Maharashtra**.

## Website

Open the [job website](https://kannan-job-search.abijith97-jobs.workers.dev). Sign in with your access passphrase, filter by state, and search by role or city. Choices and prepared resumes are saved across devices.

- **Create custom resume** reads the employer's current job description, selects relevant facts from the existing resume, and downloads an editable **Word (.docx)** file. If the description cannot be read, paste it into the form. Open the file in Word to make changes before applying.
- **View resume** reopens the saved preview, Word download and optional PDF. Downloads reuse the saved resume without another OpenAI call. Use **Prepare with different job details** to create a revised version.
- Use **Apply on employer site** to submit the finished resume yourself. The website does not submit applications.
- **Skip** saves the role for later; **Restore** returns it to the shortlist.
- Sign in with the passphrase stored as `APP_ACCESS_PASSWORD`.
- Jobs are sorted by the employer's **publication date, newest first**. Choose oldest first if preferred. Listings without a published date appear last, labelled **Date unavailable**; a checked date is never treated as a publication date.
- The nightly refresh runs around **2:00 a.m. IST** through GitHub Actions (scheduled runs may be delayed). Newly discovered roles show **New** for seven days and can be filtered with **New listings**.

GitHub Actions checks and deploys the site to Cloudflare Workers on pushes to `main`. Open the latest [website workflow run](https://github.com/Abijith97/kannan-job-search/actions/workflows/website.yml) for the deployed link. Cloudflare stores decisions and sessions in a SQLite-backed Durable Object.

Deployment uses repository secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `APP_ACCESS_PASSWORD` (at least 16 characters), and `OPENAI_API_KEY`. The Cloudflare token needs Workers Scripts Edit for the selected account. The OpenAI key is installed as a server secret and is never sent to the browser. No custom domain is required.

Resume preparation uses `gpt-4.1-mini` with structured output to select and order existing resume facts. Names, employers, employment dates, qualifications and achievement wording are preserved. Contact details stay on the server and are added to the download; they are excluded from the OpenAI request. Read the preview and any fit notes before applying. The default shared limit is 20 generation attempts per UTC day; repeated requests with identical inputs reuse the saved result. Browsing, nightly discovery and downloading saved files do not call OpenAI.

The [nightly workflow](https://github.com/Abijith97/kannan-job-search/actions/workflows/nightly-jobs.yml) checks the seven configured employers in [data/sources.json](data/sources.json) for relevant roles across the five states. This is coverage of those official sources, not every job on the internet. It saves results in [data/job-snapshot.json](data/job-snapshot.json), preserves records when a source fails, and hides listings explicitly marked closed. The website shows when checks ran and whether sources need another check. Add another supported employer source and parser to expand coverage. The state Markdown files remain the original researched shortlist.

For local development: install Node.js 24, run `npm ci`, copy `.dev.vars.example` to `.dev.vars` with a local passphrase and API key, and run `npm run dev`. Run `npm run build` then `npm test` for checks. `npm run test:browser` uses mocked OpenAI responses and downloads a sample Word file. CI renders that file for layout review. Never commit `.dev.vars` or secret values. To refresh official listings manually, run `node scripts/refresh-jobs.mjs` or dispatch the nightly workflow. The website workflow has an optional `verify_resume` input for a real end-to-end check; leave it off for checks without API spending.

## How to use this repository

1. Open [the resume](resume/Arun_Kannan_Resume.md) to understand his experience.
2. Read [suitable roles](roles/suitable_roles.md) for ranked recommendations and skill gaps.
3. Choose a state below to find employers, job titles, application links and fit notes.
4. Read the verification status and checked date, then reopen the employer's link before applying. **Unverified** entries are leads to confirm.

| State | Open this file |
| --- | --- |
| Tamil Nadu | [companies/tamil_nadu.md](companies/tamil_nadu.md) |
| Kerala | [companies/kerala.md](companies/kerala.md) |
| Karnataka | [companies/karnataka.md](companies/karnataka.md) |
| Telangana | [companies/telangana.md](companies/telangana.md) |
| Maharashtra | [companies/maharashtra.md](companies/maharashtra.md) |

## What is in each folder?

| Folder / file | Purpose |
| --- | --- |
| [resume/](resume/) | Original candidate resume. |
| [roles/](roles/) | Role recommendations and resume improvement suggestions. |
| [companies/](companies/) | One hiring shortlist per state. [Hiring guide](companies/hiring_companies.md) explains status labels and shared postings. |
| [prompt/](prompt/) | [Research instructions](prompt/Kannan_Job_Search_Prompt.md), including the current geography and folder structure. |

On GitHub, click a folder or file to open it; click the repository name to return here. Locally, open this folder in your editor or File Explorer and follow the same paths. No installation or code execution is needed.

Research checked **18 October 2026**. These are public job listings, not employer-confirmed headcounts. Some postings cover several states: matching listing IDs identify the same opportunity, so avoid duplicate applications. No applications have been submitted.
