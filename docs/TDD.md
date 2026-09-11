# Test-Driven Development Rules

## Purpose

JobApplier automates actions with durable external consequences: job applications. Tests are therefore part of the product safety boundary, not optional cleanup.

The default development method is **red -> green -> refactor**.

## The loop

### 1. Red

Before changing production behavior, write the smallest test that demonstrates the desired outcome.

The test must initially fail for the reason the implementation is missing or incorrect. A test that already passes does not establish the new behavior.

### 2. Green

Make the smallest production-code change needed to satisfy the test. Avoid opportunistic refactors or unrelated feature work during this step.

### 3. Refactor

After the focused test passes, improve names, boundaries, duplication, and structure while keeping the entire suite green.

## Required test levels

### Unit tests

Use for deterministic logic such as:

- normalization,
- accepted-position matching,
- canonical URL handling,
- stable identity/fingerprints,
- remote-US classification,
- Quick/Easy Apply classification,
- eligibility reason codes,
- answer resolution,
- queue/state transition decisions.

### Integration tests

Use temporary SQLite databases to verify:

- aggregation upserts,
- dedupe across multiple source rows,
- queue synchronization and idempotency,
- `applied` jobs cannot re-enter the automatic queue,
- attempts and final status are committed consistently,
- a failed/review-required job does not block subsequent queued jobs,
- catalog replacement does not modify `user.sqlite`.

### Adapter contract tests

Every new `SourceAdapter` should prove that representative captured input maps into the canonical `SourceJob` contract.

Every new `ApplicationAdapter` should prove at least:

- supported URL detection,
- known fields map correctly,
- missing required data returns `needs_review`,
- unsupported questions return `needs_review`,
- the adapter does not submit when required information is unresolved,
- successful completion returns `submitted` only after a positive submission signal.

Prefer local HTML fixtures or isolated DOM fixtures over live websites.

### End-to-end smoke tests

Keep E2E tests few and intentional. They should validate the main local workflow with controlled fixtures/test doubles:

```text
catalog job
-> eligibility
-> queue
-> application adapter
-> submitted/needs_review
-> durable application ledger
```

Do not make CI depend on third-party job sites being online or keeping identical DOM structure.

## Bug-fix rule

Every reproducible bug should become a regression test before the fix is applied.

If the current structure makes the bug impossible to test, introduce the smallest test seam first, then add the failing regression test, then fix the bug.

## Safety invariants that must always have tests

The suite must protect these invariants:

1. An empty accepted-position list cannot mean "accept everything."
2. Non-remote-US jobs cannot enter the automatic queue.
3. Jobs without confirmed supported Quick/Easy Apply cannot enter the automatic queue.
4. A canonical job marked `applied` cannot be automatically queued/submitted again.
5. Unknown required candidate answers cannot be invented.
6. Unsupported flows, CAPTCHAs, assessments, and ambiguous questions resolve to `needs_review`, not auto-submit.
7. One application's failure cannot corrupt or block unrelated queue items.
8. Catalog refresh/replacement cannot erase personal application history.
9. Candidate/private data cannot leak into generated catalog artifacts.

## Test quality rules

- Test observable behavior, not private implementation details.
- Prefer explicit fixtures over large mocks.
- Keep tests deterministic; do not rely on wall-clock time, network access, or execution order unless specifically testing those concerns.
- When time or IDs matter, inject/fix them in the test.
- A test should have one clear reason to fail.
- Failure messages should make the violated behavior understandable.
- Do not use snapshots for core business decisions where explicit assertions are clearer.
- Do not silently skip flaky tests. Fix or quarantine them with a documented issue and a deterministic replacement where possible.

## Commands

Development loop:

```bash
npm test -- --watch
```

One-shot tests:

```bash
npm test
```

Full local gate:

```bash
npm run check
```

`npm run check` must run tests before the production build.

## Pull request expectations

A behavior-changing PR should explain:

- what behavior changed,
- what test was written first,
- important edge/failure cases covered,
- any deliberate gaps or follow-up tests.

CI must be green before merge.
