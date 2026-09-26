# 0003 — Cookie session versus database state

## Calibration evidence

The learner correctly connected the DevUI switch-user form to the `/api/switch-user` route and identified validation through `parseFormData` and its Zod schema. They located the response that returns `Set-Cookie`, but described that response as the point where the session itself changes. Because they saw no `sessions` table and wanted to follow the repo's existing structure, they proposed storing the selected user in a new column on `users` for the hypothetical database-backed operation. That was a reasonable architectural inference from the files they had inspected; the missing clue was the cookie-backed session strategy.

## Feedback and durable insight

`setCurrentUserId` calls `session.set("userId", userId)` and `commitSession` in `app/lib/session.ts`. The action then includes the committed cookie in the redirect response. Because `createCookieSessionStorage` puts session data in the cookie, this repo correctly has no `sessions` table. The selected user is a per-session context value, not a durable change to the account row. The `users` table should not gain a `current_user` column for this flow.

If session data were stored server-side, a separate session store keyed by a session identifier could be appropriate. The storage mechanism should reflect the intended lifetime and scope of the value.

When a feature persists a domain fact, choose the table and service that own that concept. A course enrollment, for example, belongs in enrollment data, with the corresponding domain operation and schema migration. Do not default every backend change to `userService` or `users`.

## Updated learning profile

- Strength demonstrated: locating a user interaction, mapping it to a route, and finding the validation call.
- Next concept to strengthen: distinguish route response handling from session mutation and cookie commit.
- Database design target: model persisted facts by domain meaning and lifetime; then follow schema → generated migration → applied migration.

## Lesson

[Cookie session or database row?](../lessons/0003-cookie-session-vs-database-state.html)

## Next practice

Trace a route action that creates a durable database record. Identify the form, validation, service, table, and migration history before proposing a change.
