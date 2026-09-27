# 0004 — Trace a database write

## Skill

Trace a user-submitted create operation through route handling, validation, domain logic, and relational persistence.

## Lesson

[Trace a database write](../lessons/0004-trace-a-database-write.html)

## Repo example

Creating a category flows from `CreateCategoryRow` in `app/routes/admin.categories.tsx`, through its `action` and Zod schema, into `createCategory` in `app/services/categoryService.ts`, then to a Drizzle insert against the `categories` table in `app/db/schema.ts`.

## Durable insight

The UI submits; the route authenticates/authorizes and validates; the service applies reusable domain rules and performs the query; the database enforces schema constraints. Inserting a row into an existing table does not itself require a migration.

## Calibration evidence

The learner correctly found the Save interaction, admin authorization in the route action, `adminCategoryActionSchema`, `categoryService`, and that adding a row does not change schema. They first identified `getCategoryBySlug` as the database's duplicate protection. Clarify the two layers: the service pre-check provides a friendly error; `.unique()` on `categories.slug` in `app/db/schema.ts`, applied as `categories_slug_unique` in the migration, is the database-enforced invariant. The latter also protects against concurrent inserts that both pass the pre-check.

## Next useful challenge

Trace category deletion and compare the service guard with the database foreign key in [Lesson 05](../lessons/0005-application-rules-and-foreign-keys.html).
