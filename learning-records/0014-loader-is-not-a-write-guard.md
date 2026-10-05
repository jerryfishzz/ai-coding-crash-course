# 0014 — A loader is not a write guard

## Skill

Compare route loader and action behavior; ensure write invariants are enforced at the action boundary rather than assumed from a prior page load.

## Lesson

[A loader is not a write guard](../lessons/0014-loader-is-not-a-write-guard.html)

## Repo example

The purchase loader rejects non-published courses. The action separately looks up the course, authenticates, validates the intent, computes price, and writes purchase/enrollment data; it does not currently repeat the published-status check.

## Durable insight

A direct mutation request may bypass the page loader. If the product requires a published course for purchase, enforce that rule in the action before any writes, and test the denied state produces no purchase or enrollment.

## Practice

Locate the loader's published-status check; note its absence in the action; propose an action test with a draft course that asserts no purchase/enrollment rows are created.

## Learner response

The published-status rule is checked in the loader, but the action should independently check it after confirming the course exists and return 404 if it is not published. The test should assert both the 404 response and the absence of side effects: no purchase row and no enrollment row for that user/course; for the team-purchase path, no coupon should be created either.

The learner initially reasoned that a thrown error stops execution, so database assertions seemed unnecessary. They revised this: tests should assert the core invariant (no writes for an unpublished course), not merely rely on the current implementation's control flow. Otherwise a future error-handling change could leave the test passing while allowing unintended writes. This is a strong distinction between checking an outcome and checking the protected state.

## Next useful challenge

Trace the purchase and enrollment writes as a multi-step unit and assess what should happen if one step fails.
