# Test-Driven Development Rules

## Purpose

JobApplier automates actions with durable external consequences: job applications. Tests are therefore part of the product safety boundary, not optional cleanup.

The required development method is **red -> green -> refactor**.

## Comprehensive coverage rule

Every behavior-affecting production change must have deterministic automated test coverage for **every changed observable behavior** and the relevant negative, edge, failure, and safety paths.

This rule applies to changes in:

- business rules and eligibility decisions,
- normalization, matching, parsing, and dedupe,
- validation and rejection behavior,
- persistence and state transitions,
- CLI/API input and output contracts,
- source adapters and external-data boundaries,
- schema and migration behavior,
- scripts, configuration, and GitHub Actions behavior when they affect execution,
- side effects and isolation guarantees,
- privacy and safety invariants.

For persistence or side-effecting changes, tests must prove both what changes and what must **not** change.

Manual testing may supplement automated testing, but it never replaces automated coverage for behavior-changing work.

If a behavior is difficult to test, first introduce the smallest deterministic seam, fixture, fake, or dependency-injection point needed to test it. "Untestable" is not an exemption.

Documentation-only edits that do not alter executable behavior do not require artificial red tests, but the normal CI/check gate still applies.

This rule is about complete coverage of changed behavior, not chasing a line-coverage percentage. Line coverage alone does not prove business, failure, or safety behavior.

## The loop

### 1. Red

Before changing production behavior, write the smallest test or focused set of tests that demonstrates the desired outcomes.

The tests must initially fail for the reason the implementation is missing or incorrect. Tests that already pass do not establish the new behavior.

The red phase must include all behavior being changed, including relevant rejection/error paths and any safety invariant touched by the change.

### 2. Green

Make the smallest production-code change needed to satisfy the focused tests. Avoid opportunistic refactors or unrelated feature work during this step.

### 3. Refactor

After the focused tests pass, improve names, boundaries, duplication, and structure while keeping the focused tests and the entire suite green.

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
- state transition decisions,
- CLI argument validation,
- pure classification and filtering rules.

### Integration tests

Use temporary SQLite databases and controlled fixtures to verify cross-boundary behavior such as:

- aggregation upserts,
- dedupe across multiple source rows,
- automatic catalog refresh and replacement,
- `jobs:next` eligibility and prior-outcome filtering,
- `application:result` current-state plus immutable-history persistence,
- `applied` jobs cannot re-enter automatic handoff,
- failed/review-required/skipped jobs do not automatically retry,
- a failed/review-required result does not corrupt unrelated job state,
- catalog replacement does not modify `user.sqlite`,
- private state never appears in catalog artifacts or public command output.

### Adapter contract tests

Every new `SourceAdapter` must prove representative captured input maps into the canonical `SourceJob` contract and that malformed/unsupported input fails conservatively.

Prefer captured fixtures and test doubles over live third-party sites.

### End-to-end smoke tests

Keep E2E tests few and intentional. Validate the main repository-owned workflow with controlled fixtures/test doubles, for example:

```text
published catalog fixture
-> verified local catalog refresh
-> jobs:next
-> application:result
-> durable status/history
-> subsequent jobs:next excludes prior outcome
```

Do not make CI depend on third-party job sites being online or keeping identical DOM structure.

## Bug-fix rule

Every reproducible bug must become a failing regression test before the fix is applied.

If the current structure makes the bug difficult to test, introduce the smallest test seam first, then add the failing regression test, then fix the bug.

## Safety invariants that must always have tests

The suite must protect these invariants:

1. An empty accepted-position list cannot mean "accept everything."
2. Non-remote-US jobs cannot enter automatic handoff.
3. Jobs without confirmed supported Quick/Easy Apply cannot enter automatic handoff.
4. A canonical job marked `applied` cannot be automatically handed off or submitted again.
5. Durable `needs_review`, `failed`, and `skipped` outcomes cannot be automatically retried without an explicit reset path.
6. Candidate-specific facts cannot be invented.
7. Unknown required answers, CAPTCHAs, assessments, security challenges, unsupported structures, and ambiguous required questions resolve to `needs_review`, not bypass/submission.
8. One application's failure or review state cannot corrupt or block unrelated jobs.
9. Catalog refresh/replacement cannot erase or modify personal application history.
10. Candidate/private data cannot leak into generated catalog artifacts or public command output.

Any change touching one of these invariants must include or update tests that directly prove the invariant still holds.

## Test quality rules

- Test observable behavior, not private implementation details.
- Prefer explicit fixtures over large mocks.
- Keep tests deterministic; do not rely on wall-clock time, network access, or execution order unless specifically testing those concerns.
- When time or IDs matter, inject/fix them in the test.
- A test should have one clear reason to fail where practical.
- Failure messages should make the violated behavior understandable.
- Do not use snapshots for core business decisions where explicit assertions are clearer.
- Do not silently skip flaky tests. Fix or quarantine them with a documented issue and a deterministic replacement where possible.
- Do not delete or weaken tests merely to make CI pass. If requirements changed, update tests to prove the new requirement and document the contract change.
- A green focused test is not enough; the full suite must also remain green.

## Commands

Development loop:

```bash
npm test -- --watch
```

One-shot tests:

```bash
npm test
```

Full gate:

```bash
npm run check
```

`npm run check` must run tests before the production build and must pass on the final PR state before merge.

## Pull request expectations

A behavior-changing PR must explain:

- what behavior changed,
- which test(s) were written first and how they failed,
- the success path covered,
- the negative/error/edge paths covered,
- safety invariants affected and how they are proven,
- persistence/side-effect isolation coverage when relevant,
- any deliberate gaps, which require an explicit follow-up issue rather than silent omission.

CI must be green before merge. A behavior-changing PR with missing automated coverage is not ready to merge even if manual testing succeeds.
