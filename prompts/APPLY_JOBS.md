# Apply Prepared Jobs

Read `AGENTS.md` and `docs/CODEX_RUNBOOK.md` before doing anything else.

Use the repository only as the prepared job/state source. Do not perform job discovery, broad web searches, title matching, remote-US classification, deduplication, or prior-application research yourself.

Install dependencies if they are not already present:

```bash
npm ci
```

If the user provided a resume or candidate fact source in this Work thread, extract only facts explicitly supported by that source into a temporary local JSON file and import them with:

```bash
npm run candidate:import -- --file <temporary-candidate-facts.json>
```

Do not commit that JSON file or the resume. Do not infer work authorization, sponsorship, language fluency, or other unstated screening facts.

Then run:

```bash
npm run jobs:next -- --limit 10
```

`jobs:next` refreshes the public catalog, rejects contradictory non-US regional jobs, prioritizes Houston/Texas within the confirmed US-remote eligible set, and safely initializes the private durable ledger if needed. Do not open any job until this command succeeds.

Before browser work, report `diagnostics` and print the returned jobs with title, company, source, application type, application URL, and canonical job ID. A low eligible count is not permission to broaden the search or weaken eligibility rules.

Use only returned jobs, one at a time, in returned order.

For each job:
1. Open only its supplied `applicationUrl`.
2. Use only explicit candidate facts from private state/source material. Never invent a candidate-specific answer.
3. Unknown required question, ambiguous fact, CAPTCHA, assessment, security challenge, unexpected authentication, or unsupported form -> `needs_review`.
4. Immediately record the outcome with `npm run application:result` before opening another job.
5. Do not automatically retry a durable outcome.

If the user later supplies the missing fact for a `needs_review` job, import the fact first, then explicitly reset only that job with:

```bash
npm run application:retry -- --job-id <canonical-job-id>
```

After the explicit reset, rerun `jobs:next`. Never reset an `applied` job.

Stop after 5 confirmed successful submissions, after all returned jobs are exhausted, or if I ask you to stop.
