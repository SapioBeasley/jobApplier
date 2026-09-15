# AGENTS.md

## Mission

Build JobApplier V1 as a deterministic, local-first pipeline that:

1. aggregates supported remote-US jobs,
2. filters to configured accepted positions,
3. deduplicates them into stable canonical jobs,
4. queues supported Quick/Easy Apply opportunities,
5. applies to one job at a time using only explicit candidate data, and
6. records every outcome without ever submitting the same canonical job twice.

The PRD in `docs/PRD.md` defines product scope. The architecture in `docs/TECHNICAL_DESIGN.md` defines system boundaries. `docs/TDD.md` defines the required development method.

## Non-negotiable architecture

- GitHub Actions owns public job aggregation and catalog publication.
- `catalog.sqlite` contains public/replaceable job-market data only.
- `user.sqlite` contains private/durable candidate and application state only.
- Candidate data, resumes, saved answers, credentials, and application history must never be written into `catalog.sqlite` or aggregation artifacts.
- Canonical `job_id` values must remain stable across catalog refreshes.
- Application execution runs locally, one queued job at a time.
- A canonical job already marked `applied` must never be automatically submitted again.
- Unknown or ambiguous required application answers must become `needs_review`; agents must never invent candidate-specific facts.
- CAPTCHA, assessments, security challenges, unsupported page structures, and unrecognized required questions must not be bypassed. Return `needs_review` instead.
- Source-specific scraping/parsing belongs behind `SourceAdapter` implementations.
- Application-site DOM selectors/navigation belongs behind `ApplicationAdapter` implementations.
- Prefer APIs/feeds/structured data over browser automation for aggregation.

## TDD requirement

All behavior changes follow red -> green -> refactor. Read `docs/TDD.md` before changing production code.

**No behavior-affecting production change may merge without automated test coverage for every changed observable behavior and the relevant failure/safety paths.** This includes business rules, validation, parsing, persistence/state transitions, CLI/API contracts, workflow/config behavior, and side effects.

At minimum:

- Add or update a failing test that expresses the desired behavior before changing production code.
- Run the focused test and confirm the failure is for the expected reason.
- Cover the successful path plus relevant rejection/error/edge paths and every safety invariant touched by the change.
- For persistence or external side effects, test both the intended mutation and what must remain unchanged.
- Make the smallest production change that passes the focused tests.
- Run the full test suite.
- Refactor only while tests remain green.
- Run `npm run check` before considering work complete or mergeable.

If behavior is difficult to test, create the smallest deterministic seam, fixture, fake, or dependency injection point needed to test it first. "Untestable" is not an exemption from coverage.

A production bug fix always requires a failing regression test before the fix.

Documentation-only changes that do not alter executable behavior do not require artificial red tests, but they still require the normal CI/check gate. Configuration, schema, scripts, and workflow changes count as behavior changes when they affect runtime or CI behavior.

Do not weaken, delete, skip, or broaden assertions merely to make CI pass unless the product requirement itself changed and the replacement tests prove the new requirement.

## Test boundaries

Favor fast deterministic tests for:

- title matching and normalization,
- URL canonicalization and stable identity,
- eligibility decisions and reason codes,
- dedupe behavior,
- queue idempotency and state transitions,
- duplicate-application prevention,
- candidate answer resolution,
- adapter classification and unsupported-flow handling.

Use temporary SQLite databases for persistence/integration tests. Never point tests at the developer's real `data/user.sqlite` or candidate files.

Browser/application adapters should separate DOM interpretation from orchestration wherever possible so most behavior can be tested without live websites. Live-site checks are smoke tests, not the primary test suite.

## Definition of done for code changes

A change is done only when:

- every changed observable behavior has automated coverage,
- relevant success, failure, edge, and safety paths are covered,
- any touched persistence/side-effect boundary proves both intended mutation and isolation,
- `npm test` passes,
- `npm run build` passes,
- `npm run check` passes in the final branch/PR state,
- no secrets or personal candidate data are committed,
- schema changes are reflected in the relevant Drizzle schema/migrations,
- documentation is updated when an architectural or product contract changes,
- failure states are explicit rather than silently ignored.

Manual testing may supplement automated tests but never replaces them for behavior-changing work.

## Implementation preferences

- TypeScript strict mode stays enabled.
- Prefer small pure functions for normalization, matching, classification, and state decisions.
- Validate external/source data at boundaries.
- Keep source adapters and application adapters independently testable.
- Prefer deterministic IDs/state transitions over time-dependent or random behavior; inject clocks/IDs in tests when necessary.
- Preserve raw public source payloads only where useful for debugging; avoid unnecessary sensitive data retention.
- Prefer conservative dedupe: false negatives are better than merging distinct jobs.
- Prefer `unknown`/`needs_review` over guessing.

## Scope discipline

V1 intentionally excludes AI recommendations, resume tailoring, generated application essays, invented answers, multi-user SaaS features, and fully autonomous handling of unknown forms.

Do not add these unless the PRD is explicitly changed.

## Working order

For each vertical slice:

1. state the acceptance behavior, including negative/failure cases,
2. write the failing tests for all changed behavior and touched safety invariants,
3. confirm the focused tests fail for the intended reason,
4. implement the smallest slice end-to-end,
5. run focused tests and then the full suite,
6. keep application and source adapters behind existing contracts,
7. update docs if the contract changed,
8. run `npm run check` and do not merge unless it is green.
