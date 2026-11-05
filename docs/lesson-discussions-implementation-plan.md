# Lesson discussions implementation plan

Status: Phases 1–6 implemented, 2026-11-04. Local browser verification passes. Pilot activation and the physical-device/live-video smoke checks remain manual; see the [pilot guide](./lesson-discussions-pilot.md).

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

| Route                                         | Request/inputs                                                              | Result and side effects                                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Existing lesson route, GET                    | Discussion query parameters above                                           | Lesson plus selected discussion view and server-derived capabilities; never marks notifications read          |
| Existing lesson route, POST                   | FormData with a distinct discussion `intent` and fields below               | Command result; existing completion/quiz intents remain supported                                             |
| `/notifications`, GET                         | Optional `page`                                                             | Recipient's eligible learning notifications, read and unread, 20/page                                         |
| `/discussion-inbox`, GET                      | Optional `page`                                                             | Owning instructor's eligible teaching activity, read and unread, 20/page                                      |
| `/api/discussions/unread`, GET                | Cookie session; no recipient parameter                                      | `{ notifications: number, discussionInbox: number }` for the current actor                                    |
| `/api/discussions/read`, POST                 | JSON `{ lessonId, questionId, replyIds: number[] }`, max 20 reply IDs       | Idempotent acknowledgement of eligible notifications for those displayed sources; returns both current counts |
| Existing course management, GET/POST          | `?tab=reports`, optional `reportsPage`; report review intent with report ID | Private reports and authorized review result                                                                  |
| Existing admin/course/lesson management, POST | Dedicated setting intent and explicit setting value                         | Admin-authorized setting update; inheritance recomputed on subsequent reads                                   |

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

## Phase 1 implementation record

- Added migration `0006_lesson_discussions`, settings inheritance, and discussion tables with cascading source deletion, report target checks, and partial notification uniqueness indexes. The migration adds the checked course column in place, avoiding a course-table rebuild.
- Added `app/services/discussions/` for authorized reads, commands, settings, private reports, rolling posting limits, and atomic activity delivery. Hidden/deleted originals are excluded from learner projections. Inbox queries, counts, receipts, and their UI remain Phase 5 work.
- Added admin-only controls on Manage Courses, the course Settings tab, and the lesson editor. Course instructors see their effective settings without edit controls. Lesson settings cannot force-enable a disabled course.
- Added 30 database/request-handler tests covering inheritance, enrollment loss/regain, PPP, ownership, forged target IDs, archived/paused participation, moderation, visibility, pagination, constraints, hard deletion, and transaction rollback. A populated database using the preceding migrations upgrades without losing existing relationships.
- Extended seed drop order and ran the seed twice in a disposable database, including existing discussion child rows before the second run. Both runs passed foreign-key checks.
- Applied the additive migration to the local database after taking a temporary backup; its 2 courses and 39 lessons were preserved, the global default is disabled, and foreign-key checks passed. No pilot course was activated.
- Verification: full test suite, type checking, and production build pass. The full test suite requires local socket permission for the existing request-logger proxy test. Browser verification could not run because the browser access host was unavailable; settings interactions are covered by real `Request`/cookie-session action tests.

## Phase 2 implementation record

- Embedded the discussion section beneath the full lesson, with a compact newest-first question list and a selected thread containing independently paginated oldest-first replies. List/detail/page navigation changes query parameters, preserves unrelated parameters and the retained question-list page, and supports reply deep links and Back/Forward.
- Connected the existing lesson loader/action to the discussion module. Form submissions support create, reply, author edit/delete, resolve/reopen, field errors, posting limits, and current access/settings checks. Course/lesson path validation prevents cross-course submissions. The lesson's existing completion and quiz behavior is retained. Responses are private and preserve action headers such as `Retry-After`.
- Added server-only discussion Markdown rendering using `sanitize-html` 2.18.1 and an explicit tag/attribute/protocol allowlist. Raw HTML is escaped, Markdown images are removed, and code is escaped without arbitrary styles. Hidden/deleted learner originals are excluded before rendering. Existing authored-lesson rendering is unchanged.
- Added Open/Resolved, Instructor, Edited, and Hidden labels; author controls and delete confirmation; participation pause messaging; empty states; and unavailable question/reply/link states within the lesson discussion region.
- Changed video initialization to follow lesson/video identity. Updated resume data, discussion submissions, query navigation, and autoplay preference changes preserve the current iframe and playback position; opening another lesson destroys the old player and initializes the new lesson's resume position. YouTube receives a disposable child element so iframe replacement does not remove React's container.
- Added 35 tests covering URL validation, malicious Markdown, real cookie-session loaders/actions with migrated SQLite, and interactions in a simulated DOM. These exercise posting, editing, deletion placeholders, resolve/reopen, reply deep links/pagination, same-lesson navigation, player identity, and switching lessons. The YouTube API is a local test double; these checks do not claim real playback/browser verification.
- At the end of Phase 2, drafts lived in mounted forms, with failed submissions retaining their text. Phase 3 below adds lesson-scoped preservation, pending-submission snapshots, unsaved-change warnings, focus, and list-scroll restoration. Reports UI, inbox/read integration, mobile navigation, and pilot fixtures remain Phases 4–6. No course was enabled or local database content changed in Phase 2.
- Browser verification remains pending: the browser access host was unavailable. The production build and type checking pass; the full suite passes with local socket permission for the existing request-logger proxy test.

## Phase 3 implementation record

- Added memory scoped to the mounted lesson and signed-in actor for the new-question draft, separate replies per question, and author edits. Query navigation, pagination, and Back/Forward preserve text and expected failure feedback. Pausing participation or losing access keeps existing drafts; unavailable content does not expose an editable original. Drafts are not written to browser storage or the database.
- Moved draft submissions to lesson-owned fetchers that survive the form unmounting. Each request captures its text and destination. Successful creation clears only matching text; successful edits update the saved baseline. Text changed during a request remains unsent, with a saved/kept message. Off-screen completions neither redirect the active view nor clear another draft. Inputs remain editable during saves, while duplicate submissions are disabled. Closing a question composer keeps its draft; explicitly discarding an edit restores its saved baseline.
- Added a client action boundary for unconfirmed discussion submissions. Connection/server failures show inline feedback and keep text, without an automatic retry that could duplicate a successfully committed post. Existing completion/quiz actions, redirects, and abort handling retain their normal behavior. This uses the existing internal lesson action contract and the repository's request-handler test harness.
- Added an accessible Radix Alert Dialog for leaving the current lesson with dirty drafts. Stay and Escape cancel navigation and return focus; Leave clears drafts and proceeds. Same-lesson query/hash navigation does not prompt. The native `beforeunload` listener exists only while dirty and is removed on save/discard/unmount. Confirmed reload/close discards memory; browser wording and mobile termination behavior follow the [browser API's documented limits](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event).
- Exposed the actual scrolling main panel through a shared component/context. Discussion navigation restores each retained list page's scroll position and focus, restores thread positions for history navigation, and focuses/scrolls linked replies or the discussion heading. Direct-link **All questions** falls back to the retained list page at the discussion section. Loader revalidation and unrelated query changes do not steal form focus. Lesson/video identity remains stable during discussion navigation.
- Added 16 request-handler and simulated DOM tests covering independent drafts, dirty edits, Stay/Leave/Escape, conditional unload handling, fresh-mount discard, pending snapshots, off-screen completion, network/server failures, validation/rate-limit retries, pause/access restoration, inner-panel scroll, focus, deep links, and history. Tests use real migrated SQLite, cookie sessions, and the lesson route; geometry and YouTube remain local test doubles.
- Verification: 664 tests pass, type checking passes, and the production build succeeds. The full suite requires local socket permission for the existing request-logger proxy test. Browser access was checked again and the host remains unavailable, so actual layout, playback, native warning presentation, and keyboard/scroll interaction in a browser remain pending. No working database data or course settings changed in Phase 3.

## Phase 4 implementation record

- Added report controls to accessible questions and replies, with an optional reason capped at 2,000 characters, private-report guidance, inline validation/connection feedback, pending controls, and success confirmation. Failed sends keep the reason for an explicit retry; opening and closing the form moves focus appropriately. Reporting leaves question/reply drafts intact and remains available during disabled discussions and archived courses.
- Added course-owner/admin hide and restore controls in lesson threads. Hidden originals retain their Hidden label and staff-only explanation; learner replies remain placeholders without report/edit/moderation controls. A hidden question suppresses its entire learner thread and list entry. Author-deleted originals remain tombstones and cannot be restored. Moderation revalidation preserves the lesson and player identity.
- Added a private **Reports** tab to course management at `?tab=reports`, with strict `reportsPage` pagination, 20 newest reports per page, optional reasons, reporter/time, current sanitized content, hidden/deleted state, and links into the full lesson at the reported question/reply. Dismiss and hide actions keep reviewed history and the first review audit. Deleted targets offer dismissal. Tab/page navigation preserves unrelated query context and supports Back/Forward; the tab strip scrolls horizontally on narrow screens.
- The course loader loads report data only for the selected Reports tab, after course authorization. It projects the current source through the existing safe Markdown renderer; report reasons render as text. Course responses are private/no-store. Review actions resolve the source from the report server-side, reject cross-course IDs and unsupported methods, and preserve existing course actions. Unconfirmed review failures remain inline without automatic retries; redirects and aborted requests retain their normal behavior.
- Added 17 request-handler and simulated DOM tests using cookie sessions, real migrated SQLite, and the actual lesson/course routes. They cover private access, forged targets, reason limits, sanitized rendering, strict pagination, GET purity, review history/idempotence, deleted sources, disabled/archive behavior, hidden-author visibility, neighboring replies, staff originals/restoration, form feedback/focus, and player continuity.
- Verification: all 681 tests pass, type checking passes, formatting checks pass for the new/updated discussion files, and the production build succeeds. The full suite used local socket permission for the existing request-logger proxy test. Browser access was checked again and the host remains unavailable, so actual browser layout, narrow-screen overflow, and keyboard interaction remain pending. No working database data, discussion settings, migrations, dependencies, or seed fixtures changed in Phase 4.

## Phase 5 implementation record

- Added separate main-area **Notifications** and **Discussion inbox** pages with 20 newest entries per page, safe text excerpts, course/lesson context, direct question/reply links, read/unread styling, retained history, empty states, and error recovery. Sidebar links carry independent numeric badges that disappear at zero. Students see Notifications; instructors/admins also see Discussion inbox. Teaching entries require actual course ownership; learning entries require the recipient's current enrollment/access and a reply to their own question.
- Added a shared eligibility predicate for inbox pagination, totals, unread counts, and receipts. It checks current enrollment, geographic access, course ownership, source visibility/deletion, and self activity before counting or pagination. Disabled/paused/archived discussions remain readable. Hidden/deleted originals are excluded from learner payloads; staff can inspect authorized hidden sources. Excluded deliveries retain their IDs, timestamps, and read status so restoration preserves history/order.
- Registered cookie-authenticated JSON resources: `GET /api/discussions/unread` returns `{ notifications, discussionInbox }`; `POST /api/discussions/read` accepts `{ lessonId, questionId, replyIds }` and returns both counts. Read receipts require JSON, at most 4 KiB, positive IDs, at most 20 distinct reply IDs, and no extra fields. Both resources reject query parameters; recipient identity always comes from the session. Method errors include `Allow`, expected failures return `{ error: { code, message } }`, and responses are private/no-store. Receipts validate the whole lesson/question/reply batch before an idempotent transaction updates only eligible deliveries for that actor.
- Initialized counts in the layout loader and added a layout-owned controller to refresh them after completed pathname/query navigation, including Back/Forward and discussion pagination. Scroll, menu state, and hash-only changes do not trigger checks. Only committed active detail views submit receipts for the question and exactly the original replies rendered on that page. Inbox/list/loaders/background reads never mark activity read. Receipt failures keep confirmed badges and retry at most twice while the source view remains active; navigation cancels pending retries.
- Coordinated overlapping receipts and count requests so earlier responses cannot restore a cleared badge. Pending writes prevent premature GET results from publishing; superseded or previous-actor responses are discarded. Receipts return fresh counts without revalidating the lesson or replacing its player.
- Added seed examples for unread activity in both inboxes and read learning history, including Sarah Chen enrolled in Marcus Johnson's course. The helper uses returned account/course/lesson IDs. Seed verification used an isolated temporary database; the working database and discussion enablement settings were not changed. Pilot activation and richer discussion fixtures remain in Phase 6.
- Added 21 request-handler, controller, and simulated DOM tests covering separate audiences, instructor/admin learner relationships, access/visibility restoration, pagination, private endpoints, validation, transactional receipts, active-page timing, retries, zero badges, request ordering, main-area history, and player continuity. All **702 tests in 29 files**, type checking, and the production build pass. A further **20 assertions against the built React Router request handler** verify the registered routes, cookie authentication, SSR inboxes/detail, private headers, loader purity, receipt counts, retained history, and foreign keys using isolated seed data. Browser access remains unavailable, so visual layout and actual browser interaction remain pending.

## Phase 6 implementation record

- Extracted shared navigation content for desktop and an installed-Radix mobile Dialog. The same permissions, destinations, recent courses, account/theme controls, and numeric unread badges appear in both surfaces. Students have Notifications; instructors/admins also have Discussion inbox. The menu has a labeled trigger/close control, title/description, focus containment and return, Escape closing, background scroll lock, and closing after committed navigation or a desktop breakpoint change. A blocked draft navigation retains the menu link so Stay can return focus correctly.
- Changed the application shell to use dynamic viewport height, a phone header, and a full-width scrolling main panel. The desktop sidebar is hidden below the existing medium breakpoint. Development tools live inside the phone menu and start minimized on desktop. New settings use narrower padding and wrapping; question/report/inbox text wraps long words and links while code blocks scroll locally. Course tabs scroll horizontally and keep the selected tab visible. The lesson's completion/next-lesson buttons also wrap long titles.
- Real browser verification exposed a fresh-document deep-link issue: child layout effects ran before the scrolling main ref attached during hydration. Discussion focus/scroll synchronization now runs after refs attach. A regression test supplies initial server loader data so the lesson and main panel mount together, in addition to the existing navigation/history tests.
- Expanded the reset seed with the disabled global default, an explicit enabled TypeScript course, an inheriting Node.js course, and inherited lesson settings. Added 22 TypeScript questions and a 23-reply thread with a second page, long code/link examples, resolved/edited/hidden/deleted states, preserved replies under a deleted question, and five pending/reviewed report fixtures. Existing Phase 5 unread/history examples and Sarah's separate teaching/learning relationships remain. All identities come from created rows. The actual reset seed ran against a disposable temporary database, not the working database.
- Added 12 tests for shared permissions/badges, menu focus/Tab/Escape/scroll lock, committed/history/breakpoint navigation, mobile menu interactions with Stay/Leave, theme synchronization, pilot inheritance, pagination, visibility, retained history, foreign keys, rollback, and initial deep-link focus. Stabilized the UI test harness by awaiting native unread resource requests separately from Router fetchers; navigation-count tests isolate navigation from receipt reconciliation. **714 tests in 31 files pass**, along with type checking and the production build.
- Verified the built application in isolated headless Chrome at **1440, 390, and 320 pixels**. The 28 layout/navigation checks cover embedded list/thread pages, two question/reply pages, direct-link focus, long code/local overflow, iframe identity/position, mobile menu focus/return/scroll lock/role links, Stay/Leave drafts, both inboxes, private Reports, selected-tab visibility, and global/course/lesson settings. Seven further phone action checks cover composing/editing, question/reply creation, resolve/reopen, deletion placeholders, reporting, report review/hide/restore, and admin pause/inheritance with moderation while paused. Both passes completed without page errors. Screenshots were inspected. External requests were blocked; YouTube was a local API double, and the existing Monaco editor's installed files were served locally instead of its CDN.
- Added the [pilot guide](./lesson-discussions-pilot.md) with an isolated seed/server workflow, account/fixture tour, manual activation, device/video checks, daily review responsibility, and two-week assessment/expansion. No working database data, discussion settings, migrations, or dependencies changed in Phase 6. Real YouTube playback, physical-phone keyboard behavior, and browser-specific native unload presentation remain explicit manual smoke checks. The chat's browser bridge still reports an unavailable host; verification used a separate local Chrome process.

Implementation is complete. Follow the pilot guide to perform the remaining device/video checks and activate the chosen course explicitly. Daily review, the two-week assessment, and expansion are manual operational decisions.
