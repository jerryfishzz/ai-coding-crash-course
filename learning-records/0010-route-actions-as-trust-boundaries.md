# 0010 — Route actions are trust boundaries

## Skill

Trace authentication, authorization, runtime validation, and service calls in a server-side route action.

## Lesson

[Route actions are trust boundaries](../lessons/0010-route-actions-as-trust-boundaries.html)

## Repo example

The `admin.categories.tsx` action resolves the current user, checks for an admin role, parses form data with `adminCategoryActionSchema`, then calls `categoryService` and maps failures to response data.

## Durable insight

The UI is not an authorization boundary. The server must authorize each mutation and validate untrusted request data at runtime before invoking a service. Authentication (who?), authorization (may they?), and validation (is input acceptable?) are distinct checks.

React Router distinction: the server `action` and browser `clientAction` are not automatically both run for a browser-router submission. `clientAction` takes priority and may explicitly call its `serverAction()` helper; a direct HTTP request is handled on the server. This route defines only `action`.

## Next useful challenge

Trace a different action with a resource-specific authorization check, such as whether an instructor may mutate a course they own.

## Practice response

The learner correctly identified the observed order in `admin.categories.tsx`: unauthenticated request → 401; authenticated but non-admin (or missing user record) → 403; invalid submitted data after those checks → 400. The stated rationale is to reject unauthenticated callers before doing route-specific validation work.

Nuance: this is the route's chosen ordering, not a universal rule that all endpoints must validate only after authentication. The important invariants are that untrusted input is validated before use and authorization is enforced before protected work or writes.
