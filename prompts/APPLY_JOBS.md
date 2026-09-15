# Apply Prepared Jobs

Read `AGENTS.md` and `docs/CODEX_RUNBOOK.md` before doing anything else.

Use the repository only as the prepared job/state source. Do not perform job discovery, broad web searches, title matching, remote-US classification, deduplication, or prior-application research yourself.

Run:

```bash
npm run jobs:next -- --limit 10
```

Use only the jobs returned by that command. Process them one at a time in returned order using Ego Lite and the existing application workflow.

For each job:

1. Open only its supplied `applicationUrl`.
2. Apply using only explicit candidate facts already available to the established workflow. Never invent a candidate-specific answer.
3. If you encounter an unknown required question, ambiguous candidate fact, CAPTCHA, assessment, security challenge, unexpected authentication flow, or unsupported form structure, stop that job and classify it as `needs_review`. Do not bypass the challenge.
4. Immediately record the outcome with `npm run application:result` before opening another job.
5. Do not automatically retry a job after any durable `applied`, `skipped`, `needs_review`, or `failed` outcome. A review/failed retry must be explicitly requested through a future supported reset/retry path.

Valid outcomes are `applied`, `needs_review`, `failed`, and `skipped`. `needs_review` and `failed` must include a concrete reason.

If `application:result` is not implemented or fails, stop the application session and report the problem. Do not write ad-hoc SQL or invent another state-tracking mechanism.

Stop after 5 confirmed successful submissions, after all returned jobs are exhausted, or if I ask you to stop. `needs_review` and `failed` jobs do not count as successful submissions and should not prevent you from continuing to unrelated returned jobs once their outcome has been durably recorded.
