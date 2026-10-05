# 0008 — Test foreign-key behavior safely

## Skill

Test persistence rules against isolated SQLite using the same migrations and foreign-key settings as the app.

## Lesson

[Test foreign-key behavior safely](../lessons/0008-test-foreign-key-behavior.html)

## Repo example

`app/test/setup.ts` creates a new `:memory:` SQLite database, turns foreign-key enforcement on, and applies the migrations. `app/services/moduleService.test.ts` uses it to test module service behavior.

## Durable insight

A useful foreign-key test arranges the dependent rows, calls the service, and queries the resulting database state. Matching the real migrations and PRAGMA makes the test representative; the in-memory connection keeps it isolated from `data.db`.

## Next useful challenge

Explain what a module-delete test should assert when a lesson has progress: the operation should fail under the current policy and the module and lesson should remain. Then consider how those assertions would change if product policy chose archive or cascade.

## Practice response

The learner correctly explained that `createTestDb` supplies an isolated in-memory database configured like the app's SQLite database, and that progress makes module deletion fail while the module remains.

Precision: `deleteModule` first deletes lessons. A progress row references the lesson, so SQLite rejects that delete; the service never reaches its later module-delete statement. The failed set-based lesson delete does not partially remove lessons, so both the lesson and module remain.
