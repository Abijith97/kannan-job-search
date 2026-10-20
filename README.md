# Arun Kannan — job search

Job-search research for Arun Kannan across **Tamil Nadu, Kerala, Karnataka, Telangana, and Maharashtra**.

## Website

The website provides a private job table with role, employer application link, location, and Apply/Skip controls. Filter by state, search by role or city, and revisit saved choices from another device.

- **Apply** saves interest and opens role details with the employer's application link.
- **Skip** saves the role for later; **Restore** returns it to the shortlist.
- Sign in with the passphrase stored as `APP_ACCESS_PASSWORD`.
- Resume preparation is disabled for this initial website release. The deployment does not use the OpenAI secret or make OpenAI requests.

GitHub Actions checks and deploys the site to Cloudflare Workers on pushes to `main`. Open the latest [website workflow run](https://github.com/Abijith97/kannan-job-search/actions/workflows/website.yml) for the deployed link. Cloudflare stores decisions and sessions in a SQLite-backed Durable Object.

Deployment uses repository secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `APP_ACCESS_PASSWORD` (at least 16 characters). The Cloudflare token needs Workers Scripts Edit for the selected account. No custom domain is required.

For local website development: install Node.js 24, run `npm ci`, copy `.dev.vars.example` to `.dev.vars` with a local passphrase, and run `npm run dev`. Run `npm test` for website checks. Never commit `.dev.vars` or secret values.

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
