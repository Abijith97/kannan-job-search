# Arun Kannan — job search

Job-search research for Arun Kannan across **Tamil Nadu, Kerala, Karnataka, Telangana, and Maharashtra**.

## Website

Open the [job website](https://kannan-job-search.abijith97-jobs.workers.dev). Sign in with your access passphrase, filter by state and industry, and search by role or city. Choose **Industry → Other industries** to explore jobs beyond education and consulting; each job shows its assessed employer sector. Choices and prepared resumes are saved across devices.

- **Create custom resume** reads the employer's current job description, selects relevant facts from the existing resume, and downloads an editable **Word (.docx)** file. If the description cannot be read, paste it into the form. Open the file in Word to make changes before applying.
- **View resume** reopens the saved preview, Word download and optional PDF. Downloads reuse the saved resume without another OpenAI call. Use **Prepare with different job details** to create a revised version.
- Use **Apply on employer site** to submit the finished resume yourself. The website does not submit applications.
- **Skip** saves the role for later; **Restore** returns it to the shortlist.
- Sign in with the passphrase stored as `APP_ACCESS_PASSWORD`.
- Jobs are sorted by the employer's **publication date, newest first**. Choose oldest first if preferred. Listings without a published date appear last, labelled **Date unavailable**; a checked date is never treated as a publication date.
- The nightly refresh runs around **2:00 a.m. IST** through GitHub Actions (scheduled runs may be delayed). Newly discovered roles show **New** for seven days and can be filtered with **New listings**.
- **Profile matches** filters vacancies found by the nightly web search and assessed against his resume. Open **Why it fits** for the match explanation, score, requirements to confirm and source link. Scores are AI assessments, not guarantees of eligibility or selection.

GitHub Actions checks and deploys the site to Cloudflare Workers on pushes to `main`. Open the latest [website workflow run](https://github.com/Abijith97/kannan-job-search/actions/workflows/website.yml) for the deployed link. Cloudflare stores decisions and sessions in a SQLite-backed Durable Object.

Deployment uses repository secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `APP_ACCESS_PASSWORD` (at least 16 characters), and `OPENAI_API_KEY`. The Cloudflare token needs Workers Scripts Edit for the selected account. The OpenAI key is installed as a server secret and is never sent to the browser. No custom domain is required.

Resume preparation uses `gpt-4.1-mini` with structured output to select and order existing resume facts. Names, employers, employment dates, qualifications and achievement wording are preserved. Contact details stay on the server and are added to the download; they are excluded from OpenAI requests. Read the preview and any fit notes before applying. The default shared limit is 20 resume-generation attempts per UTC day; repeated requests with identical inputs reuse the saved result. Browsing and downloading saved files do not call OpenAI. **Nightly profile-based discovery also uses the OpenAI key**, separately from this resume limit.

The [nightly workflow](https://github.com/Abijith97/kannan-job-search/actions/workflows/nightly-jobs.yml) reads the current [resume](resume/Arun_Kannan_Resume.md) and all eight researched [role families](roles/suitable_roles.md). It performs one live OpenAI web search per state, specifically seeking employers outside education, study abroad, admissions, immigration and consulting. The five themes in [data/search-themes.json](data/search-themes.json) cover business development and partnerships; customer accounts; sales/business operations; social media/content; and community growth/commercial research. Each night assigns a different theme to each state, rotating so each state covers all five themes over five nights. Industry experience is treated as transferable unless the actual vacancy makes previous sector experience mandatory. Specialist skills, required seniority and qualifications still determine fit. Existing education roles remain available and the seven original employers are still checked. Configured career and vacancy sources in [data/sources.json](data/sources.json) are also checked directly. New roles from those employers go through the same AI profile assessment before publication; existing researched listings retain their original assessments.

Search results are leads until verified: a returned URL must appear in actual search sources/citations, resolve to a public HTTPS site and expose the specific vacancy, usable job description and supported location. Generic indexes without readable role descriptions, unverified links, explicit closures and inaccessible pages are not added. Configured employer pages can contain multiple roles: each complete role section is read separately, including responsibilities and requirements. A short metadata teaser does not replace a longer visible job description. Up to 30 verified candidates are assessed together against the resume and job descriptions; only suitable matches scoring at least 65/100 with real work-experience evidence are published. New additions must have been published within 30 days, or have no supplied publication date and pass the active-page checks. Unknown publication dates remain unknown. Coverage depends on what the search index finds and which job pages can be read; it is not exhaustive and a state can legitimately have no new matches.

Direct checks now also cover Femtosoft Technologies, DAASIL, KPro Digii and Teknoppy employer pages, plus BlueSapling's individual vacancy on Wellfound. These supplement the seven original sources and the five nightly web searches. New jobs from every configured source still require the same AI fit assessment; sources are not automatic endorsements. Search rejections and assessment decisions are recorded in the snapshot to diagnose missing results without guessing.

Each run is capped at **five web-search requests (one tool call each), plus one batch-assessment request when there are verified candidates**. A persisted ledger avoids repeating state searches and assessment attempts on normal same-day reruns with the same profile/policy. OpenAI web-search tool charges and model token charges both apply; this is separate from the 20 daily on-demand resume attempts. [OpenAI web-search documentation](https://developers.openai.com/api/docs/guides/tools-web-search) and [pricing](https://developers.openai.com/api/docs/pricing) explain the billing. No additional search-service key is required. Regular website deployments and browser tests do not perform these live searches.

Results, search status and recovery checkpoints are saved in [data/job-snapshot.json](data/job-snapshot.json). Existing jobs and saved decisions survive source or API failures. Previously discovered vacancies are rechecked without AI (up to 30 per run, oldest checked first); explicit closures are hidden. Unfinished new matches are staged for a later assessment rather than published. The website shows the search status for the five states; the workflow reports failures. The state Markdown files remain the original researched shortlist.

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
