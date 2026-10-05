# 0013 — Trace a mutation end to end

## Skill

Trace a UI mutation through React Router, authorization and validation, a service, Drizzle/SQLite, and back to refreshed UI data.

## Lesson

[Trace a mutation end to end](../lessons/0013-trace-a-mutation-end-to-end.html)

## Repo example

Renaming a module uses `InlineEditableModuleTitle` and `fetcher.submit`, the course editor route's `action`, role/ownership and module-parent checks, `updateModuleTitle`, and a Drizzle update to `modules.title`. The action response allows React Router to revalidate loader data.

## Durable insight

The service performs persistence, but the route determines whether the request is allowed to reach that write. Service, route, and UI tests cover different contracts; UI tests do not replace server-side authorization tests.

## Practice response

Trace the four hops and identify a test that attempts a cross-owner module ID, expects denial, and confirms the database row remains unchanged.

## Learner response and calibration

The learner correctly traced the UI's empty/unchanged guard, authentication and course authorization, Zod validation, module-to-course check, service update, and loader revalidation. They also correctly noticed that the repo has service tests but no direct route/UI tests for this flow.

Precise ordering in this action: resolve session user → check instructor/admin role → parse route `courseId` → look up course → check course ownership → parse/validate form data → branch by intent → check module belongs to course → call service. The service returns the updated module object, but the route does not return that object; it returns `{ success: true, field: "module" }`.

Loader revalidation does not mean only the title field is fetched. React Router re-runs applicable loader data after the action; React then reconciles the existing route tree and updates the changed rendered output without a full-document navigation. In this component, the read view renders the `value` prop, which is refreshed from loader data.

UI edge case noticed in the code: when `handleSave` receives an empty value, it skips submission and exits edit mode, so the display still shows the previous `value`. But `editValue` remains empty; reopening the editor can show the stale empty local state because it resets only on cancel or when `value` changes.

## Next useful challenge

Review the learning path so far and choose a real feature or bug to trace independently, with hints only where needed.
