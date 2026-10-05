# 0001 — Trace a course request

## Lesson

[Trace one course page through the app](../lessons/0001-trace-a-course-request.html)

## Learning record

The course detail URL is declared in `app/routes.ts` and handled by `app/routes/courses.$slug.tsx`. The route's server `loader` gets request-specific data by calling service functions; the returned values are passed to the route component as `loaderData`. `app/services/courseService.ts` owns reusable course queries, expressed through Drizzle against tables described in `app/db/schema.ts`.

## Durable insight

When orienting in this app, follow the request through boundaries: URL mapping → loader → domain service → database schema → loader data → UI. This keeps the framework's routing concern distinct from domain queries and rendering.

## Next useful challenge

Trace a write path, including validation, authorization, persistence, and the UI's response.
