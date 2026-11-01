# Lesson discussions specification

Status: requirements agreed, 2026-11-02. No implementation has started.

This document records the shared understanding reached in the grilling interview, including the lesson-level pause-only control and the final decisions on notification restoration and archived courses. The requirements discussion is complete. Pilot ownership below describes responsibility in the exercise; it does not claim that a real-world operator has been assigned.

## Purpose and scope

- Add lesson Q&A that helps enrolled students get unstuck. Peer discussion is welcome.
- Build the first version as an exercise in the existing app. Production readiness is a separate review.
- Attach discussions to the whole lesson, beneath its content. No inline annotations or video timestamps.
- Use existing named accounts. Course instructors and admins have moderation access.
- Pilot in **Introduction to TypeScript** before a broader rollout. Its seeded instructor is Sarah Chen.
- The course instructor is responsible for reviewing activity each working day, without promising a response time. Review the pilot after two weeks for useful answers, unanswered questions, and instructor workload.
- Expansion is an admin's decision to change settings, rather than an automatic consequence of elapsed time or metrics.

## Questions, replies, and lesson context

- Each thread has one main question or topic, with a short title and body.
- Replies have one flat level. Related follow-ups belong in the thread; another topic gets a new question.
- Support text, links, and Markdown code blocks. No attachments or anonymous posting.
- Untrusted post content must render safely, without executing scripts or unsafe HTML.
- The discussion section switches between a compact question list and the selected thread. The full lesson remains mounted, preserving lesson/video state.
- Navigation changes the URL's route or query parameters. Support deep links, refresh, browser Back/Forward, and sharing links to specific questions/replies.
- Discussion navigation keeps the discussion section in view. An **All questions** action restores the previous list page and scroll position.
- List entries show the title, a short excerpt, author, Open/Resolved state, reply count, and latest activity time.
- Questions are ordered newest first, with 20 questions per page. Replies are chronological, oldest first, with 20 replies per page.
- A link to a reply opens the correct reply page.

## Resolution, editing, and deletion

- The question author, owning course instructor, and admins can mark a question resolved or reopen it while participation is enabled.
- Show **Mark resolved** or **Reopen** as appropriate, plus a visible Open/Resolved label in the list and thread header.
- Resolved questions remain in the normal list and can still receive replies. A reply does not automatically resolve a question.
- Authors can edit their own posts; edited posts show an Edited label.
- Deleting a post leaves a placeholder and preserves other people's replies. Deletion and moderator hiding are separate actions.
- Course instructor replies show an **Instructor** badge. An instructor participating as a student in another course does not receive that badge there.

## Access and lifecycle

- Student participation requires current enrollment and access to the lesson. Enforce the same access rules when reading and when performing actions.
- Losing access retains previous contributions for people who still have access. The former participant cannot read the discussion, post, edit/delete previous posts, or resolve/reopen questions.
- Regaining access restores participation, subject to discussion enablement and course state.
- Lesson edits retain discussions. Deleting a lesson deletes its discussion.
- Archived courses pause discussion participation for everyone, including instructors and admins, regardless of the discussion enablement settings. Authorized users can still read and report existing content, and staff retain moderation access.

## Global default, course overrides, and lesson pauses

- Global discussion default: **Enabled** or **Disabled**.
- Course setting: **Use global default**, **Enabled**, or **Disabled**.
- Explicit course settings override the global default. New courses use the global default.
- Initially use a disabled global default, an explicitly enabled pilot course, and other courses inheriting the default.
- Changing the global default affects inheriting courses. An explicitly enabled course stays enabled even when the global default is disabled.
- Display explicit settings as **Enabled** or **Disabled**. Display inherited settings as **Using global default: Enabled/Disabled**, updating when the default changes.
- Add the course discussion setting to the course management page's existing **Settings** tab, such as `/instructor/2` for course 2. This is separate from the course's Draft/Published/Archived publication status. The app-wide Manage Courses list is `/admin/courses`.
- Each lesson has a pause-only discussion setting in its lesson editor: **Use course setting** or **Disabled**. New lessons use the course setting.
- A lesson can pause its own discussion but cannot enable participation while its course's effective discussion setting is disabled. Participation requires the course to be enabled and the lesson not to be explicitly disabled, subject to access and lifecycle rules.
- Re-enabling a course does not clear explicit lesson pauses. An admin resumes a paused lesson by returning it to **Use course setting**.
- All three controls are admin-only. Place the app-wide global default on the admin **Manage Courses** page at `/admin/courses`.
- Disabled means participation is paused: students and staff cannot create questions/replies, edit/delete their posts, or resolve/reopen questions. Existing content remains readable, and students can still report it.
- Course instructors and admins retain report review, hide, and restore controls while participation is paused. Admins can re-enable participation.
- Use wording such as **Pause discussions** where it helps explain the participation behavior.

## Moderation and reports

- Publish posts immediately. Students can report existing content.
- The owning course instructor and admins can hide or restore content. A global Instructor role grants no moderation access to unrelated courses.
- Hidden content's original body remains visible to the owning instructor and admins, with a Hidden label and Restore control.
- Students, including the author, cannot view the hidden original.
- Hiding a question hides the whole thread from students. Hiding one reply leaves the rest of the thread visible and replaces that reply with a moderator-hidden placeholder.
- Reports are private to the owning instructor and admins.
- Provide a private **Reports** tab in course management. Reports accept an optional reason; staff can dismiss a report or hide its content.
- Admins can moderate through lesson discussions and the course's Reports tab. A global admin Discussion inbox is outside the first version's scope.

## Two separate inboxes

| Inbox            | Audience                                                    | Activity                                                        |
| ---------------- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| Notifications    | Students, including instructors/admins enrolled as students | Replies to their own questions in courses they take as students |
| Discussion inbox | Course instructors                                          | New student questions and student replies in courses they teach |

- Determine learning/teaching participation per course. An instructor can use both inboxes for different courses.
- Keep the inboxes separate. Each has its own unread count.
- Sidebar entries open their lists in the main content area, following the existing navigation pattern. They are not expandable sidebar sub-lists.
- Both inboxes retain read and unread entries. Highlight unread entries; reading one leaves it available in history.
- Use one entry per incoming question or reply, newest first, with 20 entries per page. Grouping and filters can wait.
- Own posts and edits do not generate alerts for the actor.
- Show a numeric badge beside each inbox entry. Hide that badge at zero.
- Notification links open the relevant discussion detail within the lesson.

## Unread checks and read status

- Check both inboxes' unread counts on initial app load, refresh, and after completed app navigation changes the path or query parameters.
- This includes discussion list/detail switches, moving between questions or reply pages, navigating to other app pages, and browser Back/Forward.
- Scrolling, opening a menu, and hash-only anchor jumps do not trigger the check.
- Count checks do not mark activity read and do not require fetching all discussion content across all lessons.
- Mark a notification read once its referenced question or reply successfully appears in the active discussion detail view. This applies when arriving from an inbox, the question list, or a direct link.
- Titles/excerpts in lists, background fetches, and failed navigation do not mark entries read. Notifications for replies on unloaded pages remain unread.
- Read-status changes immediately update the appropriate count and badge. Reading a question does not resolve it.
- No separate manual or bulk Mark as read controls in the first version.
- No automatic incoming live updates while staying on the same page. New incoming activity appears on the next navigation or refresh.

## Inaccessible notification destinations

- Exclude notifications for content the user can no longer access from their visible inbox and unread count. This includes lost course access and moderator-hidden content the user cannot view.
- A saved link to an inaccessible thread keeps the lesson visible when the user still has lesson access. Show an unavailable message inside the discussion section, with an All questions action.
- If only a linked reply is unavailable, retain the accessible thread and use a placeholder for that reply.
- If the lesson itself is inaccessible, show the appropriate access-denied/unavailable page.
- Retain excluded notifications and their read status. When access or content visibility is restored, eligible entries reappear in their original chronological position, with their previous read/unread state.

## Forms and drafts

- Title limit: 160 characters. Question/reply body limit: 10,000 characters.
- Posting limit: five posts per minute per account. Failed submissions preserve the draft and explain the error.
- Preserve drafts in lesson-level memory while navigating between discussion views within the same lesson.
- Keep one new-question draft per lesson and separate reply drafts per question.
- Submitting successfully clears the corresponding draft.
- Leaving the lesson with unsent drafts triggers a Stay/Leave confirmation. Stay cancels navigation; Leave discards the lesson's drafts. Opening another lesson counts as leaving.
- Refreshing, closing the tab, or leaving the site requests the browser's built-in unsaved-changes warning while drafts exist, using beforeunload.
- The app must explicitly request that browser warning. Its wording is browser-controlled, and it is not guaranteed in every situation, especially mobile browser termination.
- Confirmed reload/close discards these in-memory drafts. Cross-session draft storage is deferred.

## Mobile scope

- Support phones for shared app navigation and all discussion-related flows.
- Add a mobile menu exposing the existing navigation, including both inbox links and badges, and allow content to use the screen width.
- Keep discussion list/detail embedded beneath the lesson on mobile.
- Make question/reply forms, thread controls, inboxes, reports, and relevant settings usable on narrow screens.
- Long text and code must not stretch the whole page horizontally. Keep code scrolling local to its content area.
- Verify menu focus/closing, scrolling, on-screen keyboard behavior, and draft navigation warnings.
- A comprehensive redesign of all existing dashboards, administrative tables, quizzes, and editors is outside this feature's mobile scope.

## Seed and deferred features

- Update seed data to demonstrate discussions and unread notifications in both inboxes, including an instructor who also participates as a student in another course.
- Include read history so the distinction between history and unread counts can be reviewed.
- Initialize the global default and course overrides to demonstrate the pilot configuration, with lessons using their course setting by default.
- Defer email alerts, votes, reactions, pins, mentions, search, and incoming live updates.

## Final decisions from the interview

29. **Global setting placement.** Place the global discussion default on the admin **Manage Courses** page, each course's override in its existing **Settings** tab, and the lesson-level pause-only setting in the lesson editor.
30. **Restored visibility/access.** Retain excluded notifications and their read status. When access or content visibility is restored, eligible entries reappear in their original chronological position, with their previous read/unread state.
31. **Staff participation in archived courses.** Apply the participation pause to everyone when a course is archived, while keeping reading/reporting available to authorized users and staff moderation available.

## Next step

The [technical implementation plan](./lesson-discussions-implementation-plan.md) translates these agreed requirements into storage, module and route interfaces, six implementation phases, and a verification strategy. Implementation has not started.
