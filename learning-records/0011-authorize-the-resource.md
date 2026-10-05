# 0011 — Authorize the resource, not just the role

## Skill

Explain role-level and object-level authorization, including ownership and nested-resource relationship checks.

## Lesson

[Authorize the resource, not just the role](../lessons/0011-authorize-the-resource.html)

## Repo example

The `instructor.$courseId.tsx` loader and action allow instructors/admins, then require an instructor to own the selected course. Mutations involving modules also verify the module belongs to that course.

## Durable insight

Authorization depends on caller, action, and specific resource. A valid role does not grant access to every object. Route/child IDs are untrusted references; verify ownership and parent-child relationships before writing.

## Practice

If instructor A owns the route's course but submits a module ID from instructor B's course, the module lookup plus `mod.courseId !== courseId` check should stop the write.

## Next useful challenge

Test a cross-owner request with two instructor accounts and verify both the denial response and unchanged database state.

## Practice response

The learner correctly distinguished course ownership from module membership. The route first authorizes the instructor for the course; that does not validate a submitted `moduleId`. The action must also load the module and confirm `mod.courseId === courseId` before performing the write. Since a module has no direct instructor owner field, its effective ownership is established through its parent course.
