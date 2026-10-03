# 0012 — Test resource authorization

## Skill

Design tests for role, ownership, nested-resource authorization, and no-write-on-denial behavior.

## Lesson

[Test resource authorization](../lessons/0012-test-resource-authorization.html)

## Repo example

The course editor action distinguishes an instructor who does not own the route course (403) from a module ID that does not belong to the authorized course (404). `createTestDb` can isolate database state; route tests also need a valid session.

## Durable insight

Authorization tests need separate users and resources. Verify both the response and post-request database state; a denial response alone does not prove that no mutation occurred.

## Next useful challenge

Trace an end-to-end mutation from a UI submit through action validation and ownership checks into a service, then identify one test at each useful boundary.

## Practice response

The learner correctly predicted 404 for Instructor A submitting Module B's ID while acting on Course A, and identified Instructor A editing Module A as an allowed request.

For the two post-request assertions, the strongest pair is: (1) Module B still exists with its original data (the attempted target was not changed), and (2) a known unrelated row such as Module A remains unchanged (the request caused no spillover). Asserting Course A remains unchanged is also reasonable, but less diagnostic because the attempted module rename would not normally update the course row.
