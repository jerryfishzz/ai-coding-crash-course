# 0015 — Keep related writes together

## Skill

Trace a multi-step mutation, identify partial database state, and test the atomicity invariant.

## Lesson

[Keep related writes together](../lessons/0015-keep-related-writes-together.html)

## Repo example

The self-purchase action calls `createPurchase` and then `enrollUser`. Each runs an insert, but the calls are not currently wrapped together in a transaction. If the second insert fails after the first succeeds, a purchase without enrollment may remain.

## Durable insight

When related writes must represent one business outcome, use a transaction so they commit or roll back as one unit. Test both the successful state and a failure after an earlier write, asserting the database invariant rather than only an error response. Database transactions do not include external effects such as email delivery.

## Practice

Trace the purchase and enrollment writes; describe the possible partial state and a test that proves the writes stay consistent on failure.

## Learner response

The learner correctly identified the current partial-write case: if `createPurchase` succeeds and `enrollUser` then throws, the purchase row has been added but the enrollment row has not. For the transaction-protected behavior, the failure-path test should force the enrollment step to throw after purchase insertion, then assert neither row remains. They also noted that email delivery is outside the database transaction, so rollback cannot undo an email already sent. This distinguishes the current behavior from the desired invariant and recognizes the boundary of database atomicity.

The learner asked whether a rolled-back purchase ID is consumed. In this repo, `purchases.id` is declared `INTEGER PRIMARY KEY AUTOINCREMENT`. SQLite documents that ROWIDs allocated by rolled-back transactions are ignored and may be reused; this differs from IDs of previously committed rows, which `AUTOINCREMENT` will not reuse. IDs are identifiers, not guaranteed gapless business sequence numbers.

## Next useful challenge

Finish with an independent end-to-end trace: choose a route mutation and identify the UI trigger, server guards, validation, service/query, persistence effects, failure behavior, and a test for its key invariant.
