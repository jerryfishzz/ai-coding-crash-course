# Cadence Application Architecture and Source-Code Guide

_Analysis produced by GPT-5.6 Sol._

## Overview

Cadence is a server-rendered course marketplace and learning-management application. It has three primary application surfaces—student learning, instructor authoring, and administration—plus purchasing-power pricing, team-seat licensing, and a separate AI request-inspection utility.

The repository is also the exercise codebase for the AI Coding Crash Course. That explains several deliberate design choices: the domain is realistic enough for feature work and refactoring, while authentication, payment processing, and deployment infrastructure remain lightweight enough to run locally.

## Request and data flow

```text
Browser
  │
  ├── React components
  │     ├── forms and navigation
  │     ├── fetcher-based interactions
  │     └── client integrations such as YouTube and Monaco
  │
  ▼
React Router route module
  ├── loader()  → reads data for a page
  ├── action()  → validates and processes mutations
  ├── component → renders the interface
  └── boundary  → handles route-specific errors
  │
  ▼
Service layer
  ├── courseService
  ├── enrollmentService
  ├── progressService
  ├── quizService
  └── other domain services
  │
  ▼
Drizzle ORM
  │
  ▼
SQLite data.db
```

React Router acts as both the frontend router and backend web framework. A route file can contain server-side loading and mutation logic alongside the React component that consumes the result.

For example, the lesson route loads the course, module, lesson, enrollment, progress, video state, and quiz; renders Markdown on the server; accepts lesson-completion and quiz-submission actions; and then hydrates into an interactive React page in the browser.

## Application shell and routing

The route hierarchy is declared centrally in [`app/routes.ts`](app/routes.ts).

There are two broad layouts:

- `/` uses a standalone public home page.
- Most application pages sit inside `layout.app.tsx`, which adds the sidebar, development controls, current-user information, recent courses, and toast notifications.

The root module, [`app/root.tsx`](app/root.tsx), owns:

- The HTML document.
- Global styles and metadata.
- Font loading.
- Dark-mode restoration before hydration.
- The global navigation loading bar.
- The final catch-all error boundary.

The application layout, [`app/routes/layout.app.tsx`](app/routes/layout.app.tsx), loads shared information:

- The current user.
- All users for the development user switcher.
- Recently studied courses and progress.
- The simulated country and purchasing-power tier.
- Whether the current user administers a team.

Because it is a parent route, its loader may run alongside a child page loader during navigation.

## Identity, sessions, and roles

The application defines three roles:

```text
Student
├── browse and purchase courses
├── consume lessons
├── track progress
└── take quizzes

Instructor
├── create courses
├── edit curricula
├── create quizzes
└── inspect student progress

Admin
├── manage users
├── change user roles
├── manage all courses
└── manage categories
```

### Login and signup

Authentication is deliberately simplified. Login asks only for an email address. If that email belongs to a user, the user's numeric ID is written into a signed cookie. There are no passwords, OAuth providers, password resets, or email verification.

Signup accepts a name and email and creates a student account. If the email already exists, the signup action silently logs into the existing account. This is convenient for a teaching environment but would be a severe authentication vulnerability in a production application.

The relevant routes are [`app/routes/login.tsx`](app/routes/login.tsx) and [`app/routes/signup.tsx`](app/routes/signup.tsx).

### Session storage

[`app/lib/session.ts`](app/lib/session.ts) stores the current user ID and optional development country in a cookie. The cookie is HTTP-only and uses `SameSite=Lax`, but its signing secret is hard-coded and it is not explicitly marked `secure`.

### Development UI

The floating [`app/components/dev-ui.tsx`](app/components/dev-ui.tsx) panel allows a developer or student to:

- Switch between seeded users.
- Test student, instructor, and administrator views.
- Simulate different countries.
- See the resulting purchasing-power tier.

This is a course-development feature rather than a production authentication mechanism.

## Domain and database model

The schema is defined in [`app/db/schema.ts`](app/db/schema.ts).

```text
User
├── teaches → Course
├── enrolls in → Course
├── purchases → Course
├── progresses through → Lesson
├── watches → Lesson video
├── attempts → Quiz
└── belongs to → Team

Category
└── contains → Course
      └── Module
            └── Lesson
                  └── Quiz
                        └── Question
                              └── Option

Team
├── TeamMember
└── Coupon
      ├── belongs to a Course
      ├── belongs to a Purchase
      └── may be redeemed by a User
```

Important storage choices include:

- Prices are integer cents.
- Dates are ISO strings rather than native SQLite timestamps.
- Roles and statuses are TypeScript enums stored as text.
- Module, lesson, and question ordering uses integer `position` fields.
- SQLite foreign-key enforcement and WAL mode are enabled.

The database connection in [`app/db/index.ts`](app/db/index.ts) is lazy. This prevents `better-sqlite3` from being included accidentally in a browser bundle when a route imports a service only for its server-side loader.

### Database constraints

SQLite directly enforces only a subset of the domain invariants:

- User emails are unique.
- Course slugs are unique.
- Category slugs are unique.
- Coupon codes are unique.

Other invariants exist only in application logic:

- One enrollment per user and course.
- One progress record per user and lesson.
- One quiz per lesson.
- Unique positions within a module, course, or quiz.
- One administrative team per user.

Without composite unique constraints, bypassing service validation or racing two requests could create duplicate records.

## Course catalog and discovery

The public catalog in [`app/routes/courses.tsx`](app/routes/courses.tsx) queries published courses and supports:

- Title and description search.
- Category filtering.
- Newest-first sorting.
- Instructor and category information.
- Regional prices.
- Lesson counts.
- Current-student progress.

[`app/services/courseService.ts`](app/services/courseService.ts) contains the main catalog query and constructs detailed course aggregates containing ordered modules and lessons.

The course-detail route adds enrollment-specific information, including:

- Overall course progress.
- The status of each lesson.
- The next incomplete lesson.
- Purchasing-power pricing.
- Server-rendered sales copy.

One subtle behavior is that the course-detail route does not itself require `Published` status. A draft course can be viewed if someone knows its slug, although it is absent from the normal catalog and the purchase loader rejects it.

## Course authoring

The instructor experience is one of the largest parts of the application.

### Instructor dashboard

[`app/routes/instructor.tsx`](app/routes/instructor.tsx) lists courses owned by the current instructor and calculates status, lesson count, enrollment count, and relevant dates.

Only instructors may use this dashboard. Administrators can access individual course editors but do not use the instructor dashboard itself.

### Course creation

[`app/routes/instructor.new.tsx`](app/routes/instructor.new.tsx) creates a course from a title, description, category, and optional cover image. The title is converted into a URL slug, collisions are rejected, and the new course starts as a draft.

### Main course editor

[`app/routes/instructor.$courseId.tsx`](app/routes/instructor.$courseId.tsx) is a large multi-purpose authoring workspace. Its route action supports:

- Updating title and description.
- Changing publication status.
- Updating price and PPP settings.
- Editing Markdown sales copy.
- Adding, renaming, deleting, and reordering modules.
- Adding, renaming, deleting, moving, and reordering lessons.

Instructors can edit only their own courses; administrators can edit any course. The UI uses `@hello-pangea/dnd` to reorder curriculum elements, and the services persist normalized one-based positions.

### Lesson editor

A lesson can contain:

- Markdown content.
- A YouTube URL.
- A duration.
- A GitHub repository URL.
- An attached quiz.

[`app/components/monaco-markdown-editor.tsx`](app/components/monaco-markdown-editor.tsx) loads Monaco dynamically, registers Prettier as a Markdown formatter, and maps Cmd/Ctrl+S to format and save. The lesson editor also blocks navigation when there are unsaved changes.

A current limitation is that `updateLesson()` uses `null` to mean "do not update." As a result, submitting an empty optional field does not reliably clear an existing video or GitHub URL.

## Learning and lesson consumption

The student experience centers on the dashboard, course overview, module overview, and lesson viewer.

### Dashboard

[`app/routes/dashboard.tsx`](app/routes/dashboard.tsx) divides enrollments into in-progress and completed groups. For each enrollment it calculates:

- Completion percentage.
- Completed lesson count.
- Total lesson count.
- Next incomplete lesson.

A course is considered completed here only when `enrollment.completedAt` is set. Although the enrollment service exposes `markEnrollmentComplete()`, no active route calls it, so reaching 100% lesson completion does not automatically move a course into the completed group.

### Lesson lifecycle

When an enrolled student opens a lesson:

1. The lesson is marked `in_progress` unless it is already completed.
2. Existing video position and progress are loaded.
3. Curriculum-wide progress is loaded for the sidebar.
4. Markdown is rendered on the server.
5. Previous and next lessons are calculated.
6. Any associated quiz and best attempt are loaded.

Clicking the "Up next" button marks the lesson complete and navigates to the next lesson.

[`app/services/progressService.ts`](app/services/progressService.ts) can calculate progress by raw lesson count or by lesson duration. It accepts an `includeQuizzes` argument, but that argument is currently unused.

### Content access behavior

The lesson route calculates whether a visitor is enrolled but does not use enrollment as a hard content-access guard. A non-enrolled visitor who knows a lesson URL can currently see the video and rendered lesson content. Enrollment controls progress tracking, quizzes, and completion actions rather than basic content visibility.

## Markdown and code content

Course sales copy and lesson content are stored as Markdown. [`app/lib/markdown.server.ts`](app/lib/markdown.server.ts):

1. Parses Markdown with Marked.
2. Highlights code blocks with Shiki.
3. Caches the Shiki highlighter after first initialization.
4. Returns HTML to the React route component.

The HTML is rendered with `dangerouslySetInnerHTML`. The current pipeline does not sanitize arbitrary HTML, so instructor-provided HTML can reach the browser. This becomes a stored-XSS risk if instructors are not fully trusted.

## Video tracking

[`app/components/youtube-player.tsx`](app/components/youtube-player.tsx) dynamically loads the YouTube IFrame API and understands standard watch, shortened, and embed URLs.

It records:

- `play`
- `pause`
- `ended`
- A `progress` event every ten seconds

The UI resumes from the latest recorded position and displays the greatest percentage reached. Tracking failures are intentionally ignored because tracking is best-effort.

Progress is calculated from the maximum playback position rather than accumulated watch time. Seeking near the end can therefore produce a high completion percentage.

The service contains `hasUserCompletedVideo()`, but it is not connected to automatic lesson completion. The tracking API verifies login but does not currently verify enrollment, lesson existence, allowed event types, or non-negative playback positions.

## Quizzes

```text
Quiz
├── title
├── passing score
└── ordered questions
      ├── multiple choice or true/false
      └── answer options marked correct or incorrect
```

### Authoring

[`app/routes/instructor.$courseId.lessons.$lessonId.quiz.tsx`](app/routes/instructor.$courseId.lessons.$lessonId.quiz.tsx) implements a four-step wizard:

1. Settings.
2. Questions.
3. Answers.
4. Review.

Client state is serialized into JSON, posted as one form field, parsed, and revalidated with Zod on the server.

Saving an existing quiz deletes it and recreates its complete structure. The deletion also removes previous answers and attempts. This simplifies persistence but means that editing a quiz destroys its student history and analytics.

### Student submissions

Correct-answer flags are removed before quiz data reaches the browser. The server reloads correct options, calculates the score, assigns a grade, stores the attempt and selected answers, and returns per-question feedback.

There is a scoring inconsistency in [`app/services/quizScoringService.ts`](app/services/quizScoringService.ts):

- The UI displays the stored `passingScore`.
- The scoring service ignores that value.
- Passing is hard-coded as `score > 0.7`.
- Exactly 70% receives a C but is considered failed.

The lesson action also accepts a submitted `quizId` without confirming that it belongs to the lesson in the URL.

## Purchasing and purchasing-power parity

The purchase subsystem records commercial activity but does not integrate with a payment processor.

### Individual purchase

```text
Published course
    ↓
Resolve buyer country
    ↓
Calculate regional price
    ↓
Insert purchase record
    ↓
Insert enrollment
    ↓
Show welcome page
```

Prices are stored in cents, so a displayed `$49.99` is stored as `4999`.

### Country resolution

[`app/lib/country.server.ts`](app/lib/country.server.ts) resolves the country in this order:

1. Development session override.
2. Cloudflare's `CF-IPCountry` header.
3. `X-Forwarded-For` followed by an `ip-api.com` lookup.
4. Unknown country, treated as full price.

The fallback uses plain HTTP for the external lookup, which would be undesirable for production privacy and integrity.

### PPP tiers

[`app/lib/ppp.ts`](app/lib/ppp.ts) defines:

- Tier 1: full price.
- Tier 2: 30% discount.
- Tier 3: 50% discount.
- Tier 4: 70% discount.

Discounted purchases are country-locked. When an enrolled user loads a lesson, the application compares the current country with the purchase country and may render an access-restricted page.

### Transactional limitations

Purchase and enrollment are separate database writes. Team purchase, team creation, and coupon generation involve additional separate writes. No explicit database transactions protect these workflows, so a partial failure can leave inconsistent state.

A direct POST to the purchase action also does not repeat the loader's published-course check.

## Teams and seat licensing

A team purchase implements a simple business-to-business seat model:

1. A purchase records the total price.
2. A team is created if the buyer does not already administer one.
3. The buyer becomes the team administrator.
4. One random coupon is generated per seat.
5. Other users redeem coupon links to enroll.

The buyer is not automatically enrolled.

[`app/routes/team.tsx`](app/routes/team.tsx) groups coupons by course and displays purchased seats, claimed seats, redemption codes, redeemers, and links for buying more seats.

Coupon redemption checks:

- Coupon existence.
- Whether it has already been claimed.
- Whether the user is already enrolled.
- Whether the user's country matches the purchaser's country.

Successful redemption first marks the coupon as used and then creates an enrollment. These operations are not transactional, so a failure between them could consume a coupon without granting access.

Although the schema supports administrator and member team roles, coupon redeemers are not added as team members. Team membership currently identifies mainly the purchasing administrator.

## Administration

The administrator area has three modules.

### User management

Administrators can edit names and emails and change roles among student, instructor, and administrator. The route repeats role checks in both its loader and action.

### Course management

Administrators can view every course, inspect lesson and enrollment counts, and change status among draft, published, and archived.

### Category management

Administrators can create, rename, and delete categories and view course counts. Names are slugified, name and slug collisions are rejected, and deletion is refused while courses still reference the category.

## Service layer

The service layer is divided by entity or feature:

- `userService` — user CRUD and roles.
- `categoryService` — categories, slugs, and course counts.
- `courseService` — course queries, aggregates, status, price, and PPP settings.
- `moduleService` — module CRUD and positioning.
- `lessonService` — lesson CRUD, positioning, and cross-module movement.
- `enrollmentService` — enrollment and completion records.
- `progressService` — lesson state and percentage calculations.
- `quizService` — quiz structure and attempt persistence.
- `quizScoringService` — scoring and reporting.
- `videoTrackingService` — playback event aggregation.
- `purchaseService` — individual and team purchase records.
- `teamService` — team creation and administrator membership.
- `couponService` — seat generation and redemption.

Services are synchronous because `better-sqlite3` is synchronous. This keeps the code direct, although several routes bypass the service boundary and query `db` directly.

Some loaders perform repeated per-record lookups. These N+1 query patterns are harmless for the small seed dataset but would become inefficient with a large catalog or student population.

## UI component system

The UI is split into feature components and generic primitives:

- Feature components include `Sidebar`, `DevUI`, `YouTubePlayer`, and `MonacoMarkdownEditor`.
- `app/components/ui/` contains shadcn/Radix-style buttons, cards, inputs, labels, selects, tabs, textareas, and skeletons.

Tailwind CSS variables in [`app/app.css`](app/app.css) define the visual theme. Dark mode is class-based and remembered in `localStorage`.

The interface relies heavily on React Router's `useFetcher`, allowing forms to submit route actions without full-page navigation. Sonner toasts communicate success and failure.

## Migrations and seed data

The `drizzle/` directory contains migrations for:

1. The original course platform schema.
2. GitHub repository URLs on lessons.
3. Teams, team members, and coupons.

[`scripts/seed.ts`](scripts/seed.ts) is intentionally destructive: it drops all application tables, reapplies migrations, and creates a complete demonstration dataset containing:

- 9 users.
- 5 categories.
- 2 substantial programming courses.
- Modules and lessons with Markdown and video content.
- 3 quizzes.
- 7 enrollments.
- Progress records and quiz attempts.
- Video-watch events.
- 5 individual purchases.
- 1 team purchase with 5 coupons.

`npm run db:seed` should therefore be understood as a local database reset rather than an additive, production-safe seed operation.

## Testing strategy

The application tests focus mainly on:

- Service CRUD behavior.
- Module and lesson reordering.
- Enrollment validation.
- Progress calculations.
- Coupon restrictions.
- PPP and country resolution.

The request logger has extensive coverage of agent configurations, renderers, proxy behavior, retry suppression, and model discovery.

Areas with little or no direct coverage include:

- React route loaders and actions.
- Rendered UI behavior.
- End-to-end role and purchase flows.
- Quiz scoring.
- Video tracking.
- Session security.
- Cross-feature deletion behavior.

Most service tests substitute an isolated SQLite database for the application database, providing realistic query behavior without running the complete web application.

## Request logger

`request-logger/` is a second, course-supporting application rather than part of the Cadence product.

It:

1. Asks which coding agent and provider are in use.
2. Prints the command or configuration needed to route that agent through localhost.
3. Proxies requests to the real model provider.
4. Streams responses back to the agent.
5. Saves raw request and response files.
6. Produces a readable Markdown representation.

The proxy uses Node built-ins at runtime. It preserves original compressed bytes for forwarding while decoding zstd, gzip, Brotli, or deflate for the readable capture.

It understands Anthropic, OpenAI, and Gemini wire formats, with a raw JSON fallback. It also redacts known authentication headers, forces WebSocket clients back to inspectable HTTP, detects runaway retry bursts, supports custom model-server URLs, and optionally discovers available model IDs.

Only processes explicitly configured to use its localhost base URL are captured. It does not observe other Codex sessions globally.

The main files are [`request-logger/proxy.ts`](request-logger/proxy.ts), [`request-logger/render.ts`](request-logger/render.ts), and [`request-logger/agents.ts`](request-logger/agents.ts).

## Important implementation gaps

The most important gaps in the current implementation are:

- Authentication is intentionally non-production.
- Paid lesson content is not enrollment-gated.
- Purchases do not charge money.
- Purchase, enrollment, coupon, and reordering workflows lack transactions.
- Quiz passing ignores the configured passing score.
- Editing a quiz deletes historical attempts.
- Course completion is not automatic.
- Video completion is not connected to lesson completion.
- The progress service's `includeQuizzes` argument is unused.
- Optional lesson fields are difficult to clear.
- Rendered Markdown HTML is not sanitized.
- Some mutation endpoints lack ownership or enrollment checks.
- Database uniqueness and ordering invariants are mostly application-only.
- Foreign keys do not cascade, while only some services manually remove descendants.
- Several route loaders contain N+1 query patterns.
- The README's React Router version and Ably claim do not match the installed code.

## Recommended reading order

For an efficient introduction to the codebase:

1. [`app/routes.ts`](app/routes.ts) — understand the application surface.
2. [`app/db/schema.ts`](app/db/schema.ts) — learn the domain model.
3. [`app/routes/layout.app.tsx`](app/routes/layout.app.tsx) — understand shared context.
4. [`app/services/courseService.ts`](app/services/courseService.ts) — inspect the main aggregate queries.
5. [`app/routes/courses.$slug.tsx`](app/routes/courses.$slug.tsx) — follow catalog-to-course behavior.
6. [`app/routes/courses.$slug.lessons.$lessonId.tsx`](app/routes/courses.$slug.lessons.$lessonId.tsx) — follow the complete student workflow.
7. [`app/routes/instructor.$courseId.tsx`](app/routes/instructor.$courseId.tsx) — inspect the most complex mutation route.
8. [`app/services/progressService.ts`](app/services/progressService.ts) — understand learning state.
9. [`app/routes/courses.$slug.purchase.tsx`](app/routes/courses.$slug.purchase.tsx) and [`app/services/couponService.ts`](app/services/couponService.ts) — understand commerce and teams.
10. [`request-logger/proxy.ts`](request-logger/proxy.ts) — understand the separate agent-inspection tool.
