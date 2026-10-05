# 0007 — From schema change to migration

## Skill

Distinguish the Drizzle schema declaration, generated SQL migration, migration application, and application behavior that completes a feature.

## Lesson

[From schema change to migration](../lessons/0007-from-schema-change-to-migration.html)

## Repo example

`drizzle.config.ts` points to `app/db/schema.ts`, `drizzle/`, and `data.db`. `npm run db:generate` produces migration SQL; `npm run db:migrate` applies unapplied migration files.

## Durable insight

A TypeScript schema edit does not modify an existing SQLite database. Generate and review the SQL, apply it deliberately, then implement and verify the service/UI behavior that depends on the new shape or constraint.

## Practice

The learner correctly identified `npm run db:generate` as the SQL-generation step and `npm run db:migrate` as the database-application step. They identified UI updates as remaining application work.

Repo-specific refinement: the service/query layer must also define which module queries exclude archived records (and which admin/history queries include them). The UI then presents the resulting behavior consistently. The migration does not automatically update either layer.

## Next useful challenge

Trace a schema migration into a focused test that proves the intended foreign-key or archive behavior without risking the working database.
