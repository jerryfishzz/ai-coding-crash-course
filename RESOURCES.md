# Learning resources

## Repository sources

- [`README.md`](README.md) — project purpose, setup, scripts, stack, and course progression.
- [`app/routes.ts`](app/routes.ts) — URL-to-route-module map.
- [`app/routes/courses.$slug.tsx`](app/routes/courses.$slug.tsx) — representative course detail route and server loader.
- [`app/services/courseService.ts`](app/services/courseService.ts) — course queries and domain operations.
- [`app/db/schema.ts`](app/db/schema.ts) — persisted entities and relationships.

## Primary documentation

- [React Router: Data Loading](https://reactrouter.com/start/framework/data-loading) — official explanation of server loaders and how their data reaches route components.
- [Drizzle ORM: SQLite](https://orm.drizzle.team/docs/get-started-sqlite) — official setup and query overview for SQLite drivers, including `better-sqlite3`.

## Further exploration

- [React Router: Route Modules](https://reactrouter.com/start/framework/route-module) — route module APIs and generated types.
- [Drizzle ORM: Select](https://orm.drizzle.team/docs/select) — typed query composition and filtering.
