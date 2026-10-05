# 0006 — Deletion policy and transactions

## Skill

Choose a deliberate policy for deleting related data and make multi-step cleanup atomic.

## Lesson

[Deletion policy and transactions](../lessons/0006-deletion-policy-and-transactions.html)

## Repo example

`deleteModule` deletes lessons, then the module. The current lesson rows are referenced by progress, quizzes, and video-watch events. Those dependent rows have no cascade policy, so deleting lessons fails. The service also does not wrap its multiple statements in a transaction.

## Durable insight

Choose retention behavior from product meaning before choosing a database action. Foreign-key cascade is configured per relationship. Explicit cleanup should use a transaction so a failure rolls back the whole operation.

## Next useful challenge

The learner compared three policies. Archiving preserves history but needs a consistent definition of visibility; restriction protects dependent records; cascading requires policies across the full dependency tree, not just the module-to-lesson edge. A useful next step is to select based on product requirements, then trace all affected reads and writes.

## Practice response

- **Archive:** add an archived marker and update views so archived modules are hidden or clearly labelled. Key follow-up: ensure every relevant listing, lookup, and route handles archived modules consistently; consider whether an `archivedAt` timestamp is more useful than a boolean.
- **Restrict:** check whether dependent history exists, block deletion with a useful message, and retain the foreign-key constraint as the final integrity guard. The dependency check should cover the full tree, not only lessons.
- **Cascade:** configure every relevant foreign-key edge deliberately. Cascading `modules → lessons` alone would still be blocked by progress, quiz, or video-event references to lessons. A single SQLite delete statement with configured cascades is atomic; a transaction is especially important for explicit multi-statement cleanup.

The key design question remains product policy: should learning history survive module removal?
