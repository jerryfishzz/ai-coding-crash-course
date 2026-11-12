# Lesson discussion pilot

The reset seed demonstrates one enabled course. It does not activate discussions in an existing database. The migration initializes a disabled global default; normal startup preserves stored settings.

## Try the seeded pilot without changing working data

Run these from the repository root. The seed clears its target database, so run it in the disposable directory shown here.

```sh
repo_root="$PWD"
pilot_dir="$(mktemp -d "${TMPDIR:-/tmp}/cadence-discussions.XXXXXX")"
(cd "$pilot_dir" && node "$repo_root/node_modules/tsx/dist/cli.mjs" "$repo_root/scripts/seed.ts")
npm run build
ln -s "$repo_root/build" "$pilot_dir/build"
ln -s "$repo_root/public" "$pilot_dir/public"
(cd "$pilot_dir" && HOST=127.0.0.1 PORT=5196 node "$repo_root/node_modules/@react-router/serve/bin.cjs" "$repo_root/build/server/index.js")
```

Open `http://127.0.0.1:5196`. Stop the temporary server with Ctrl+C when finished. The build/public links let the production server serve assets while its database stays in the disposable directory.

Use the existing DevUI account switcher. On phones it is under **Navigation → Development tools**; on desktop the floating panel can be minimized. Set the development country to **United States (US)** for repeatable access checks.

| Account        | What to inspect                                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Emma Wilson    | TypeScript questions, two question pages, Notifications with unread activity and history, replies, drafts, reporting             |
| Sarah Chen     | Both inboxes: Node.js learning replies in Notifications; TypeScript student activity in Discussion inbox; private course Reports |
| Marcus Johnson | Node.js Discussion inbox; readable history while the course inherits the disabled default                                        |
| Alex Rivera    | Global default, explicit course override, lesson pause, hidden originals and private Reports                                     |

The seed prints the actual pilot lesson URL and the long thread's question parameter. IDs come from the created accounts, course, and lesson. In the first TypeScript lesson:

- **How can I narrow an API response safely?** has 23 replies, including hidden/deleted placeholders, an edited instructor reply, long code, and a long link. Its last three replies are on page 2.
- **Why does a literal type become a string?** is resolved and still listed/replyable.
- **Example awaiting moderation** is hidden from learners and visible to the course instructor/admins.
- A deleted question has cleared original text and retains an instructor reply.
- Additional questions exercise pagination. Reports include pending, hidden, dismissed, and author-deleted sources.
- Read history and unread examples exist in both inbox kinds. Opening an inbox preserves unread counts; opening detail acknowledges only displayed original sources.

The global default is **Disabled**, TypeScript is explicitly **Enabled**, Node.js uses **Inherit**, and every lesson uses its course setting. An inherited disabled course can still expose existing history; it blocks new participation. Newly created lessons also use their course setting.

## Before activating a real pilot

An admin enables the selected course in **Manage Courses → course → Settings → Course discussions**. Keep **Manage Courses → Discussion default** disabled for courses still inheriting it. A lesson's separate control can pause participation; it cannot enable a globally/course-disabled lesson. Explicit course overrides take priority over the global default, so the global default is not an emergency switch for an explicitly enabled course.

Confirm the course instructor will review Discussion inbox and private Reports each working day. The named seed accounts demonstrate roles; they are not an operational staffing assignment. Explain that questions have no guaranteed response time.

Check these on desktop and a phone before inviting learners:

1. Ask, reply, edit, resolve/reopen, delete, report, and hide/restore. Check wrapping controls and local scrolling for code rather than whole-page horizontal scrolling.
2. Navigate question/reply pages, direct reply links, Back/Forward, and All questions while the full lesson remains mounted. Confirm real video playback and resume behavior with YouTube available.
3. Keep drafts through list/detail navigation. Check Stay/Leave and the browser's reload warning after interacting with the form. Use a real phone to check the on-screen keyboard, scrolling, and access to the submit button.
4. Open/close the mobile menu by keyboard; verify focus containment, Escape, return focus, background scroll lock, and the correct inbox links/badges for each role.
5. Open Notifications/Discussion inbox without clearing badges, then visit detail and return to retained history. Later reply pages stay unread until displayed. Hidden/inaccessible sources do not expose originals or add eligible unread counts.
6. Inspect Reports and all three setting controls on a phone. Disable participation and confirm existing content/reporting/staff moderation still work; restore the explicit pilot setting afterward.

## Two-week review and expansion

The course instructor reviews activity each working day. After two weeks, the instructor and admin review useful answers, unanswered questions, reports, and moderation workload. Record the decision to continue, adjust, pause, or expand. No timer or metric automatically enables another course.

For expansion, admins can explicitly enable additional courses or change the global default to **Enabled**. Explicit disabled courses stay disabled and paused lessons stay paused. Before changing the global default, inspect which courses inherit it. To pause the current pilot, disable its course override; staff retain read/report/moderation access.
