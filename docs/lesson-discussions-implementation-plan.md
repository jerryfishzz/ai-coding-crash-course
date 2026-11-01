# Lesson discussions implementation plan

Status: proposed technical design, 2026-11-02. Implementation has not started.

The [agreed specification](./lesson-discussions-spec.md) defines product behavior. This plan translates it into changes to the existing React Router application, Drizzle/SQLite storage, and Vitest verification. Technical names below are proposed implementation choices; they do not reopen the agreed requirements.

## Approach

Keep the existing lesson URL and mounted lesson viewer. Use query parameters to select the discussion list, a question, and reply pagination. Extend the application's existing loaders, actions, cookie session, validation helpers, and database rather than adding a separate backend.

Put discussion rules behind a small module interface. Routes supply the authenticated actor and request context; the module validates the target's course, computes permissions, performs transactions, and returns only data the actor may see. UI controls reflect these permissions, but do not enforce them on their own.

Build in six phases. Each phase has a concrete completion check; all phases are required before the pilot is ready.

## Existing code to build on

| Concern                         | Existing location                                                                            | Planned change                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Persistence                     | `app/db/schema.ts`, `drizzle/`                                                               | Discussion tables, settings fields, constraints, indexes, migration               |
| Database tests                  | `app/test/setup.ts`, `app/services/*.test.ts`                                                | Reuse isolated in-memory SQLite and real migrations                               |
| Lesson                          | `app/routes/courses.$slug.lessons.$lessonId.tsx`                                             | Embedded discussion data, actions, list/detail UI, drafts                         |
| Video                           | `app/components/youtube-player.tsx`                                                          | Keep an existing player alive through discussion navigation and data revalidation |
| Shared navigation               | `app/routes/layout.app.tsx`, `app/components/sidebar.tsx`                                    | Inbox links/counts, shared mobile menu, main scroll reference                     |
| Course management               | `app/routes/instructor.$courseId.tsx`                                                        | Course setting and private Reports tab                                            |
| Lesson editor                   | `app/routes/instructor.$courseId.lessons.$lessonId.tsx`                                      | Admin-only lesson pause control                                                   |
| Global default                  | `app/routes/admin.courses.tsx`                                                               | Admin-only global control                                                         |
| Server helpers                  | `app/lib/session.ts`, `app/lib/validation.ts`, `app/lib/ppp.ts`, `app/lib/country.server.ts` | Reuse identity, Zod validation, and current lesson-access rules                   |
| Markdown                        | `app/lib/markdown.server.ts`                                                                 | Add a separate safe rendering entry point for user posts                          |
| Route registration and fixtures | `app/routes.ts`, `scripts/seed.ts`                                                           | Register inbox/resource routes and seed pilot examples                            |

The lesson loader currently renders lesson content even without enrollment, and its action handles completion and quizzes. Discussion access must be explicitly checked in every new read and mutation path. This work should not silently change the enrollment policy for unrelated lesson content or rewrite existing quiz/completion behavior.

## 1. Storage and invariants

### Settings

- Add a singleton discussion settings row with a checked ID and `defaultEnabled`, initially false. Treat a missing row as disabled until initialization completes.
- Add `courses.discussionOverride`: `inherit | enabled | disabled`, default `inherit`, with a database check.
- Add `lessons.discussionPaused`: boolean, default false. False maps to **Use course setting**; true maps to **Disabled**.
- Compute inheritance when reading, rather than copying the effective global value into every course or lesson.
- The migration preserves existing courses and lessons, initializes inheritance and the disabled global default, and creates no historical notifications. Pilot activation belongs to explicit configuration; the seed demonstrates it.

### Questions, replies, reports, and notifications

| Table                      | Main fields                                                                                                                         | Invariants                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `discussion_questions`     | ID, lesson ID, author ID, title, Markdown body, created/edited/deleted timestamps, hidden timestamp/actor, resolved timestamp/actor | One lesson per question; Open/Resolved independent of hiding/deletion     |
| `discussion_replies`       | ID, question ID, author ID, Markdown body, created/edited/deleted timestamps, hidden timestamp/actor                                | References a question, with no reply-to-reply field                       |
| `discussion_reports`       | ID, reporter ID, either question ID or reply ID, optional reason, created timestamp, review outcome/time/actor                      | Check exactly one target; reports never enter public discussion payloads  |
| `discussion_notifications` | ID, recipient ID, inbox kind, question ID, optional reply ID, created timestamp, nullable read timestamp                            | One delivery per recipient, inbox, and source post; read history persists |

Store raw Markdown, not trusted HTML. An edit sets `editedAt`; resolving, hiding, or restoring does not masquerade as an author edit. Hiding keeps the original content. Author deletion clears the post's original title/body and leaves its identity and position as a tombstone, preserving the rest of the thread. Restoring hidden content cannot resurrect an author-deleted body.

Use foreign-key cascades from lesson to question, question to reply, and source post to its reports/notifications for hard deletion. Soft deletion does not activate cascades. Keep author references independent of enrollment so unenrollment does not delete contributions. New foreign keys must not make existing lesson/module deletion fail merely because discussions exist; verify the existing deletion paths with discussion data present.

Index questions by `(lessonId, createdAt, id)`, replies by `(questionId, createdAt, id)`, reports by target/review state, and notifications by `(recipientId, inboxKind, createdAt, id)` plus unread lookup. Add author/time indexes for the posting limit. Enforce notification uniqueness with separate partial indexes for question deliveries and reply deliveries; a nullable reply ID in one ordinary unique index would not deduplicate question deliveries in SQLite.

Keep question order newest first and reply order oldest first, with ID as a deterministic tie-breaker. Use fixed page size 20. Hidden/deleted reply placeholders retain their chronological slots, so deep-link page calculations and pagination use the same ordering. Never include a hidden/deleted original in excerpts or a student's serialized payload.

## 2. Module interface and permissions

Organize new server code under `app/services/discussions/`, with a small public entry point and internal files for access, queries, commands, settings, and inboxes. Keep database internals and visibility filtering behind that interface. Follow the repository's positional-argument convention; a command payload may hold the validated fields needed for one operation.

The public interface should cover these operations:

- Read a lesson discussion view, including effective settings, allowed actions, and a paginated list or thread.
- Execute a discussion command: create/edit/delete question or reply, resolve/reopen, report, hide/restore, or dismiss a report.
- Read a private course reports page.
- Read one recipient's inbox page or both eligible unread counts.
- Acknowledge source posts that appeared in the active detail view.
- Read/change discussion settings with explicit admin authorization.

Pass actor identity and resolved access context, including country where required, through the interface. Load the current user, ownership, enrollment, course state, and stored settings on the server. Never accept a client-supplied role, recipient, author, effective setting, or capability as authoritative. Verify the complete course → module → lesson → question → reply relationship for each supplied ID.

| Actor/state                                              | Read                           | Participate                                             | Report           | Moderate                | Change settings                |
| -------------------------------------------------------- | ------------------------------ | ------------------------------------------------------- | ---------------- | ----------------------- | ------------------------------ |
| Enrolled learner with lesson access                      | Visible posts and placeholders | Own posts; resolve/reopen own questions when enabled    | Accessible posts | No                      | No                             |
| Owning instructor                                        | Includes hidden originals      | Own posts; resolve/reopen course questions when enabled | Accessible posts | Own course              | No                             |
| Admin                                                    | Includes hidden originals      | Own posts; resolve/reopen when enabled                  | Accessible posts | All courses             | All three levels               |
| Unrelated instructor without enrollment                  | No                             | No                                                      | No               | No                      | No                             |
| Former learner without current access                    | No                             | No                                                      | No               | No                      | No                             |
| Authorized user, participation paused or course archived | As otherwise authorized        | No, including staff                                     | Yes              | Staff retain moderation | Admin retains settings control |

An instructor/admin enrolled as a learner in another course gets learner activity in Notifications. Global Instructor status does not confer ownership elsewhere; admins retain their explicitly agreed moderation authority. Notification audience eligibility must still require the appropriate learning/teaching relationship, even if an admin could independently inspect the course.

Participation is allowed only when course inheritance resolves to enabled, the lesson is not paused, the course is not archived, and the actor has access. Reporting and moderation deliberately do not use the participation gate. Hidden question threads are unavailable to learners; hidden replies return placeholders. Staff may receive hidden originals only through authorized server projections.

For creation, check the five-post limit across questions and replies in every course in the preceding 60 seconds. Count successful creates, including subsequently hidden/deleted posts; edits do not create posting activity. Perform the limit check, insert, and notification delivery in one synchronous SQLite transaction so concurrent submissions cannot exceed the limit or leave partial deliveries. Resolve request context and perform asynchronous rendering outside the transaction.

## 3. URLs and request contract

### Lesson URLs

Use the existing `/courses/:slug/lessons/:lessonId` route:

| View            | Query example                                |
| --------------- | -------------------------------------------- |
| Question list   | `?questionsPage=2`                           |
| Question detail | `?question=42&questionsPage=2&repliesPage=1` |
| Specific reply  | `?question=42&reply=87&questionsPage=2`      |

Parameters are positive integer IDs/pages; omitted pages mean 1. Preserve unrelated lesson query parameters. A reply ID is authoritative for locating its current reply page; verify it belongs to the selected question. Retain `questionsPage` while in detail so **All questions** restores it, including after refresh. A new incoming question may shift offset-based list pages; a question/reply ID remains the stable destination.

The lesson loader returns one selected discussion view. It does not load every thread or every reply. Re-running the loader is acceptable; keep the same lesson/video element identity and make the player's initial resume position apply only when initializing that lesson/video, rather than recreating the player whenever loader data changes. Do not key the viewer or draft provider by query string or navigation key.

An inaccessible question returns an unavailable discussion state inside the accessible lesson, without throwing away the whole lesson through a route error. An inaccessible linked reply keeps the accessible thread and its placeholder/message. Invalid input gets a controlled error; inaccessible sources use generic unavailable wording without exposing their hidden content or existence details. Denied lesson access uses the lesson's access-denied/unavailable presentation.

### Route operations

Use existing React Router loaders/actions for app pages and existing form conventions for commands. New JSON resource routes serve the two small cross-page interactions. These are internal app contracts; a separate public REST interface or Postman workspace is not needed for this planning step.

| Route                                         | Request/inputs                                                        | Result and side effects                                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Existing lesson route, GET                    | Discussion query parameters above                                     | Lesson plus selected discussion view and server-derived capabilities; never marks notifications read          |
| Existing lesson route, POST                   | FormData with a distinct discussion `intent` and fields below         | Command result; existing completion/quiz intents remain supported                                             |
| `/notifications`, GET                         | Optional `page`                                                       | Recipient's eligible learning notifications, read and unread, 20/page                                         |
| `/discussion-inbox`, GET                      | Optional `page`                                                       | Owning instructor's eligible teaching activity, read and unread, 20/page                                      |
| `/api/discussions/unread`, GET                | Cookie session; no recipient parameter                                | `{ notifications: number, discussionInbox: number }` for the current actor                                    |
| `/api/discussions/read`, POST                 | JSON `{ lessonId, questionId, replyIds: number[] }`, max 20 reply IDs | Idempotent acknowledgement of eligible notifications for those displayed sources; returns both current counts |
| Existing course management, GET/POST          | Reports tab/page; report review intent with report ID                 | Private reports and authorized review result                                                                  |
| Existing admin/course/lesson management, POST | Dedicated setting intent and explicit setting value                   | Admin-authorized setting update; inheritance recomputed on subsequent reads                                   |

Discussion form intents:

| Intent                                                                  | Required fields besides `intent`                    |
| ----------------------------------------------------------------------- | --------------------------------------------------- |
| `discussion-create-question`                                            | `title`, `body`                                     |
| `discussion-create-reply`                                               | `questionId`, `body`                                |
| `discussion-edit-question`                                              | `questionId`, `title`, `body`                       |
| `discussion-edit-reply`                                                 | `questionId`, `replyId`, `body`                     |
| `discussion-delete-question`, `discussion-resolve`, `discussion-reopen` | `questionId`                                        |
| `discussion-delete-reply`                                               | `questionId`, `replyId`                             |
| `discussion-report`                                                     | `questionId`, optional `replyId`, optional `reason` |
| `discussion-hide`, `discussion-restore`                                 | `questionId`, optional `replyId`                    |

Course report review uses `discussion-dismiss-report` or `discussion-hide-reported-content` with `reportId`; the server resolves the target from the report. Settings use `discussion-set-global`, `discussion-set-course`, and `discussion-set-lesson`, each on its existing management route. Do not extend a general lesson/course update to let instructors accidentally write admin-only discussion fields.

Validate with Zod and the existing parsing helpers. Titles must contain non-whitespace text and be at most 160 characters; bodies must contain non-whitespace text and be at most 10,000 characters while preserving useful code formatting. Validate optional report reasons and bound request/array sizes. Reject unsupported methods on resource routes. User-specific responses must not enter shared caches.

Return predictable command results so expected failures appear inside the discussion form rather than replacing the lesson:

```json
{ "ok": true, "questionId": 42, "replyId": 87 }
```

```json
{
  "ok": false,
  "error": {
    "code": "participation_paused",
    "message": "Discussions are paused. Your draft has been kept."
  }
}
```

Use 400 for malformed/invalid fields, 401 for no session, 403 for denied permission/access, 404 for unavailable targets, 409 for participation paused since the view loaded, and 429 for the posting limit with `Retry-After`. Field failures additionally return a field-error map. Network/server errors retain drafts and offer retry. Do not blindly retry creation commands; disable duplicate submission while a request is pending. Read acknowledgement is safe to repeat and does not create a new notification.

## 4. Notification delivery, eligibility, and read timing

Deliver notifications in the same transaction as the source post:

- A learner's new question creates a Discussion inbox entry for the owning instructor, excluding the actor.
- A new reply creates a Notifications entry for the question author when that author participates as an enrolled learner in the course, excluding the actor.
- A learner's new reply also creates a Discussion inbox entry for the owning instructor, excluding the actor. An instructor studying another course counts as a learner there.
- Edits, own actions, resolving, reporting, hiding, and restoring do not create new activity alerts.

Use one shared eligibility rule for inbox rows and unread counts. Check current course relationship, lesson access, and source visibility before pagination/counting. A paused or archived discussion remains readable and therefore is not filtered out solely because participation is paused. An author-deleted source contributes no original-content notification. Do not copy raw question/reply excerpts into permanently visible notification rows; derive safe display text from the currently authorized source projection.

Loss of enrollment/access or hiding excludes an entry without deleting it or changing `readAt`. Restored eligibility exposes that original row at its original timestamp. Stable newest-first ordering uses notification ID as a tie-breaker. Do not recreate restored deliveries or reset read state. A hidden parent question also excludes its reply notifications for learners.

Initialize counts in the app layout's server load. After each completed navigation whose pathname/query changes, refresh both counts through the small unread resource route. This includes Back/Forward and discussion pagination; it excludes hash-only changes, menus, and scrolling. Keep this trigger in the shared layout. Do not add polling or fetch every course's discussion content. Reuse the app's existing country/access resolution policy for count eligibility.

After a successful detail response is committed to the active view, acknowledge the question and exactly the reply IDs rendered on that page. Do not acknowledge during a loader, prefetch, question-list render, inbox render, or background request. Acknowledge no hidden/deleted placeholders as read original content. On the server, verify the lesson/question/reply relationships, current authorization, recipient ownership, and visibility again. A later page's replies are not in the acknowledgement and remain unread.

The acknowledgement returns fresh counts for immediate badge updates. Coordinate count requests and acknowledgements in one layout-owned controller: discard superseded responses and responses for a previous signed-in user, and invalidate older count requests when a receipt completes. This prevents an earlier count response from bringing back a cleared badge. Retry a failed receipt only while its source view is still valid; receipt failures do not falsely clear the badge or block reading. Keep the inbox row in history after success.

## 5. Lesson UI, drafts, safe Markdown, and mobile

Use discussion UI files under `app/components/discussions/` for the list, thread, forms, post controls, report form, and shared states. The list/detail switch replaces only the discussion region beneath the full lesson. Show current Open/Resolved and Hidden labels and capabilities from the server, including explicit pause messaging while retaining readable history.

Store new-question, per-question reply, and dirty edit form state in a lesson-scoped provider that survives query navigation. Clear only the successfully submitted draft, and only if it still matches the submitted snapshot, so text typed while a request is pending is preserved. Failed requests, rate limits, and settings/access changes keep unsent text.

Use a `useBlocker` predicate that identifies leaving the current lesson viewer, rather than blocking every query change. Present an accessible Stay/Leave dialog; Stay resets the blocker, Leave clears lesson drafts and proceeds. Attach `beforeunload` only while dirty for full reload/close/site leave. Browser-controlled warning wording and mobile termination limitations remain as agreed. Existing lesson-editor blocking code is a reference, not a reason to make same-lesson discussion navigation warn. [React Router documents the SPA-only scope of `useBlocker`](https://reactrouter.com/api/hooks/useBlocker).

The app scrolls an inner `<main>`, not just the window. Expose its scroll element through layout context and save list scroll position in lesson memory. Use navigation without a page-top reset, then restore the list position or focus/scroll the discussion heading or linked reply after the selected view appears. Preserve Back/Forward behavior. When a direct link opens without an in-memory list position, **All questions** opens the retained list page at the discussion section. [React Router's scroll restoration](https://reactrouter.com/api/components/ScrollRestoration) is useful context, but inner-container restoration must be implemented and verified in this app.

Add `renderDiscussionMarkdown` as a server-only rendering entry point using a maintained HTML sanitizer, such as `sanitize-html`, with an explicit allowlist for basic text, lists, links, and code. Escape/disable raw HTML in the Markdown input, then sanitize rendered output. Permit safe link protocols, remove event handlers, scripts, embeds, images, and arbitrary styles; render code as escaped text initially so syntax highlighting cannot introduce an unrestricted style policy. Keep the existing authored-lesson rendering policy separate. The [sanitizer's official documentation](https://github.com/apostrophecms/apostrophe/tree/main/packages/sanitize-html) describes server use and configurable tags, attributes, and URL schemes. Verify the chosen dependency/version during implementation.

Extract shared navigation items so desktop and mobile show the same permitted links and numeric badges. Add an accessible mobile menu using the installed Radix Dialog primitive: labeled trigger, focus containment/return, Escape close, route-change close, and correct scroll locking. Add `min-width: 0` where needed, local code scrolling, wrapping labels, and responsive discussion forms/controls.

Add the Reports tab to the existing course workspace with narrow-screen tab overflow handled accessibly. Make the new settings and reports UI usable on phones without redesigning every older management screen. Check the floating DevUI does not obscure the mobile menu or new actions. Inbox pages live in the main content area, with unread styling, history, pagination, empty/error states, and destination links.

## 6. Implementation sequence and completion checks

### Phase 1 — Data, access, and configuration

Implement the migration, settings inheritance, access module, server commands/queries, notification delivery storage, and admin setting controls. Add real-database tests for relationships, constraints, deletion, enrollment/ownership, archived/paused behavior, and transactions. Extend seed drop order for the new child tables before existing tables.

**Complete when:** existing migrations upgrade a populated isolated database without losing course data; new lessons/courses inherit; only admins change settings; pause/archive blocks staff and learner participation while moderation remains available; direct commands cannot bypass ownership or lesson access.

### Phase 2 — Embedded question and reply flow

Implement lesson query parsing, selected-view loading, safe Markdown, list/detail pagination, create/reply/edit/delete, resolution controls, instructor badges, and unavailable states. Preserve video initialization through query navigation and loader revalidation. Maintain lesson completion/quiz behavior.

**Complete when:** a learner can ask and answer a question, see 20-item pages, follow a reply deep link, resolve/reopen, edit/delete with placeholders, and navigate Back/Forward without losing lesson playback or resetting the lesson view. Learner payloads exclude hidden originals, and rendered post HTML is safe for every viewer.

### Phase 3 — Drafts and navigation protection

Add lesson-scoped draft memory, form errors, rate-limit feedback, submission snapshot handling, list-scroll restoration, focus handling, SPA blocking, and conditional browser unload handling.

**Complete when:** question/reply drafts survive discussion navigation; Stay preserves text; confirmed Leave/reload discards it; failed submission preserves it; successful submission clears only the matching draft; no warning appears for ordinary list/detail navigation.

### Phase 4 — Moderation and private reports

Add reporting, hidden placeholders/staff originals, hide/restore controls, and the course Reports tab with dismiss/hide actions. Apply permission checks to direct reads and submissions. Keep moderation usable during pause/archive.

**Complete when:** students cannot retrieve hidden original bodies through any new read path; owning instructors/admins can inspect and restore them; unrelated instructors cannot read reports; a hidden question suppresses its entire learner thread while a hidden reply leaves its neighbors available.

### Phase 5 — Separate inboxes and unread integration

Add both main-area inbox pages, sidebar links/badges, eligibility queries, count resource, active-view receipts, and request ordering. Seed both inbox kinds, read history, and an instructor studying another course.

**Complete when:** inbox audiences remain separate; counts match eligible unread rows; opening an inbox/list does not clear them; rendering a detail page marks only its displayed sources read; inaccessible entries disappear and restoration retains prior read state/order; zero badges disappear and delayed requests cannot revive them.

### Phase 6 — Mobile integration and pilot verification

Add the shared mobile menu and finish responsive discussion, inbox, reports, and settings layouts. Seed the disabled global default and explicitly enabled TypeScript pilot; other courses inherit, and new lessons use their course setting. Exercise long threads, deleted/hidden posts, resolved questions, reports, and at least one second reply page. Reuse existing accounts rather than hard-coded numeric IDs.

**Complete when:** desktop and phone-width checks pass for every new flow; keyboard/focus/scroll behavior works; the shared menu exposes both inboxes for instructors and only Notifications for learners; pilot configuration and unread fixtures are demonstrable. The two-week pilot review and later expansion remain manual operational steps.

## Verification strategy

- **Database/module tests:** use `createTestDb()` and real migrations, with foreign keys enabled; cover inheritance combinations, ownership versus global role, enrollment loss/regain, existing PPP access outcomes, all participation pauses, hidden/deleted projections, atomic recipient delivery, and the five-post rolling limit with a controlled clock.
- **Contract/route tests:** call loaders/actions with real `Request` objects and isolated data; cover forged cross-course/question/reply/report IDs, field validation, expected errors, admin-only settings, inbox audience separation, read receipts, and no mutation on GET. A direct invocation test of pure request handlers must avoid importing generated route build artifacts at runtime.
- **Notification regression tests:** one instructor learning elsewhere, history retention, no self-alerts, no edit alerts, eligible filtering before pagination/counting, hidden parent/reply handling, access restoration, repeat receipts, unloaded reply pages, and request races in the count controller.
- **Rendering tests:** malicious HTML, event handlers, dangerous URLs, malformed markup, code containing HTML, and ordinary links/code; assert safe output and absence of forbidden original content in serialized learner results.
- **Browser verification:** playback continuity, shared main-container scroll, deep links, Back/Forward, same-lesson drafts, Stay/Leave, conditional unload warning, sidebar badges, mobile focus/menu closing, phone-width long code, report/settings access, and existing quiz/completion navigation. Use a disposable migrated/seeded database; do not reset the user's working data. The project currently has Vitest but no configured browser test suite, so browser QA starts as a recorded manual pass; introduce automation only where it materially verifies these interaction risks.
- **Final checks:** run focused tests during each phase, then the relevant full `npm test`, `npm run typecheck`, and `npm run build` before calling the feature complete. Inspect the generated migration and seed behavior in an isolated database. Country-resolution tests must use controlled local context rather than depend on a live external geolocation response.

No application tests, migrations, or browser checks were run while writing this plan. Planning verification consists of reviewing the source and checking document formatting. The first implementation task is Phase 1; the feature is ready for the pilot only after Phase 6 and its checks are complete.
