# Learning resources

## Repository sources

- [`README.md`](README.md) — project purpose, setup, scripts, stack, and course progression.
- [`app/routes.ts`](app/routes.ts) — URL-to-route-module map.
- [`app/routes/courses.$slug.tsx`](app/routes/courses.$slug.tsx) — representative course detail route and server loader.
- [`app/services/courseService.ts`](app/services/courseService.ts) — course queries and domain operations.
- [`app/db/schema.ts`](app/db/schema.ts) — persisted entities and relationships.

## Primary documentation

- [React Router: Data Loading](https://reactrouter.com/start/framework/data-loading) — official explanation of server loaders and how their data reaches route components.
- [React Router: Actions](https://reactrouter.com/start/framework/actions) — official guide to server-side route mutations and automatic loader revalidation.
- [React Router: Sessions and Cookies](https://reactrouter.com/explanation/sessions-and-cookies) — official explanation of cookie-backed and custom server-side session storage.
- [React Router: `useFetcher`](https://reactrouter.com/api/hooks/useFetcher) — official reference for submissions that interact with route actions without navigating.
- [Drizzle ORM: SQLite](https://orm.drizzle.team/docs/get-started-sqlite) — official setup and query overview for SQLite drivers, including `better-sqlite3`.
- [Drizzle ORM: Insert](https://orm.drizzle.team/docs/insert) — official guide to SQL-like inserts and returned rows.
- [Drizzle ORM: Transactions](https://orm.drizzle.team/docs/transactions) — official overview of grouping database statements so they commit or roll back together.
- [Drizzle Kit: Migrations](https://orm.drizzle.team/docs/migrations) — official overview of code-first and database-first migration workflows.
- [Drizzle Kit: Generate](https://orm.drizzle.team/docs/drizzle-kit-generate) — how schema diffs become SQL migration files.
- [Drizzle Kit: Migrate](https://orm.drizzle.team/docs/drizzle-kit-migrate) — how unapplied SQL migrations are applied and tracked.
- [SQLite: Foreign Key Support](https://www.sqlite.org/foreignkeys.html) — primary reference for relational integrity constraints in SQLite.

## Further exploration

- [React Router: Route Modules](https://reactrouter.com/start/framework/route-module) — route module APIs and generated types.
- [Drizzle ORM: Select](https://orm.drizzle.team/docs/select) — typed query composition and filtering.
