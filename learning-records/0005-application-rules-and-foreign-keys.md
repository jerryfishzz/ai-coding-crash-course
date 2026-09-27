# 0005 — Application rules and foreign keys

## Skill

Explain how service-level domain checks and database foreign keys provide complementary protection when deleting related records.

## Lesson

[Application rules and foreign keys](../lessons/0005-application-rules-and-foreign-keys.html)

## Repo example

`deleteCategory` counts dependent courses and throws a readable error before deleting. `courses.categoryId` references `categories.id`; the migration uses `ON DELETE no action`; and `app/db/index.ts` enables SQLite foreign-key checks for this connection.

## Durable insight

Application checks express domain intent and give useful errors. Database constraints preserve data integrity across every caller. A service check should not be treated as a substitute for a database invariant.

## Next useful challenge

Compare this relationship with `lessons.moduleId` → `modules.id`. Explain what would happen if the app changed the foreign key to cascade deletes, and which product behavior that choice would encode.

## Calibration evidence

The learner correctly recognized that deleting a module can fail because of foreign-key dependencies and that the current operation lacks user-friendly handling. Refine the exact relationship path: `deleteModule` first deletes all lessons in the module, then deletes the module. The course-to-module reference is removed by the second statement's ordering; the first lesson delete is blocked by existing rows in `lesson_progress`, `quizzes`, and `video_watch_events`, each of which references `lessons.id`. The route does not catch this database exception, so the route error boundary shows its generic failure view.
