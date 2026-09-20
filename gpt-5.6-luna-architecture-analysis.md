# Cadence Application: Architecture and Module Walkthrough

**Model:** GPT-5 (Codex)

## Overview

Cadence is best understood as a modular monolith: one React/React Router application contains the UI, server-side route handlers, business services, database access, and development tooling.

The main execution path is:

```text
Browser request
  → React Router loader/action
  → session + validation + authorization
  → domain service
  → Drizzle ORM
  → SQLite
  → rendered page or redirect
```

There is no separate REST API server or frontend API client. React Router route files perform both frontend rendering and backend request handling.

## 1. Application shell and routing

The route map is defined in `app/routes.ts`. There are three broad route groups:

- Public pages: home, login, and signup.
- Application pages under the shared layout: courses, dashboard, instructor, admin, teams, and settings.
- API-style actions: logout, switch user, country override, and video tracking.

`app/root.tsx` creates the HTML document, loads global CSS, restores scroll position, injects scripts, and provides the application-level error boundary.

`app/routes/layout.app.tsx` is the shared application shell. Its loader prepares:

- The current user.
- All users for the development user switcher.
- The current development country.
- PPP pricing information.
- Recently progressed courses.
- Whether the current user administers a team.

The layout renders the sidebar, the current route through `<Outlet />`, the development control panel, and toast notifications.

## 2. Database and domain model

The schema is defined in `app/db/schema.ts` and models these relationships:

```text
User
├── Courses they teach
├── Purchases
├── Enrollments
├── Lesson progress
├── Quiz attempts
├── Video watch events
└── Team memberships

Course
├── Category
├── Instructor
├── Modules
│   └── Lessons
│       └── Optional Quiz
│           ├── Questions
│           │   └── Options
│           └── Attempts
│               └── Answers
├── Purchases
└── Enrollments
```

Important entities include:

- `users`: students, instructors, and admins.
- `categories`: course classification with unique slugs.
- `courses`: title, description, sales copy, instructor, category, status, price, and PPP setting.
- `modules`: ordered sections inside courses.
- `lessons`: ordered learning units with Markdown, video URLs, GitHub URLs, and duration.
- `enrollments`: course access records.
- `lesson_progress`: not started, in progress, or completed state.
- `quizzes`, `quiz_questions`, and `quiz_options`: assessment content.
- `quiz_attempts` and `quiz_answers`: student results.
- `purchases`: transaction records.
- `teams`, `team_members`, and `coupons`: team-seat distribution.
- `video_watch_events`: playback telemetry.

The database connection in `app/db/index.ts` is lazy, uses SQLite WAL mode, and enables foreign keys. Tests create isolated in-memory databases using the same Drizzle migrations as the application, so they exercise the real schema.

## 3. Course catalog and content authoring

`app/services/courseService.ts` handles:

- Course lookup by ID, slug, instructor, category, or status.
- Published-course filtering.
- Search by title and description.
- Category filtering.
- Sorting and pagination.
- Joining course, instructor, and category data.
- Loading complete nested course structures.
- Course creation and editing.
- Draft, published, and archived status changes.
- Pricing and PPP configuration.

`getCourseWithDetails()` manually builds this structure:

```text
Course
  → modules ordered by position
    → lessons ordered by position
```

`moduleService.ts` and `lessonService.ts` support:

- Creating and deleting modules or lessons.
- Renaming content.
- Assigning positions.
- Reordering within a course or module.
- Moving lessons between modules.
- Closing and opening positional gaps when content moves.

The instructor editor uses drag-and-drop in the browser, then sends ordered IDs to route actions. The service rewrites positions as `1, 2, 3, ...`.

Course content is stored as Markdown. `app/lib/markdown.server.ts` converts it to HTML server-side and adds syntax highlighting for TypeScript, JavaScript, JSON, Bash, SQL, JSX, and other languages.

## 4. Public course discovery

The public course experience consists of:

- `/`: landing page and featured courses.
- `/courses`: searchable catalog.
- `/courses/:slug`: course sales/detail page.
- `/courses/:slug/:moduleId`: module overview.
- `/courses/:slug/lessons/:lessonId`: lesson viewer.

The catalog:

- Restricts results to published courses.
- Supports search and category filtering.
- Calculates lesson counts.
- Displays viewer progress when enrolled.
- Calculates country-specific PPP prices.

The course detail page renders sales copy, instructor information, modules, lessons, pricing, enrollment counts, and progress. It offers individual and team purchase paths.

The module page calculates module-level completion from completed lesson records.

## 5. Identity, sessions, and authorization

Authentication is intentionally lightweight. `app/lib/session.ts` uses a signed cookie session containing only a `userId`. There is no password, OAuth, email verification, or external identity provider.

Login validates an email, looks up the user, and stores that user’s ID in the cookie. Signup validates a name and email, creates a student if necessary, and stores the new user ID.

The `DevUI` component lets developers switch between seeded users, demonstrating student, instructor, and admin behavior locally.

Authorization is performed mostly inside route loaders and actions:

- Students can use the learning dashboard.
- Instructors can manage their own courses.
- Admins can manage all courses, users, and categories.
- Admins can edit instructor-owned courses.
- Instructors cannot edit another instructor’s course.

This authorization logic is repeated in route files rather than centralized in one permission service. Services generally assume their callers have already been authorized.

## 6. Purchasing, enrollment, and PPP pricing

Purchases and enrollments are separate concepts. `purchaseService.ts` records what was paid, while `enrollmentService.ts` grants course access.

For an individual purchase, the application:

```text
Validate published course
  → Require logged-in user
  → Calculate PPP-adjusted price
  → Create purchase record
  → Create enrollment
  → Redirect to welcome page
```

There is no payment gateway. The purchase action directly creates a successful purchase record.

PPP behavior in `app/lib/ppp.ts` uses these tiers:

- Tier 1: full price.
- Tier 2: 30% discount.
- Tier 3: 50% discount.
- Tier 4: 70% discount.

Country resolution uses:

1. Development session override.
2. Cloudflare country header.
3. `ip-api.com` fallback based on `X-Forwarded-For`.
4. No country, which defaults to full price.

Discounted purchases are geographically restricted. When an enrolled user opens a lesson, the route compares the current country to the purchase country and can show an access-restricted screen.

## 7. Team purchases and coupons

Team purchasing is a small seat-management system.

`createTeamPurchase()`:

1. Creates a purchase record for the total price.
2. Creates or finds a team for the purchaser.
3. Generates one coupon per purchased seat.

The purchaser is not automatically enrolled in the team-purchase flow.

`couponService.ts` generates random codes and validates redemption by checking:

- Coupon existence.
- Whether it has already been redeemed.
- Whether the user is already enrolled.
- Whether the redeemer’s country matches the purchaser’s country.

Successful redemption marks the coupon as consumed and creates an enrollment. The team page shows total seats, claimed seats, course associations, redeemer emails, and copyable redemption links.

## 8. Student learning flow

The student dashboard calculates, for each enrollment:

- Completed lesson count.
- Total lesson count.
- Percentage progress.
- Next incomplete lesson.
- Whether the course is marked complete.

The lesson viewer is the richest student route. Its loader:

1. Resolves the course, module, and lesson.
2. Verifies that the lesson belongs to the course in the URL.
3. Checks enrollment.
4. Marks the lesson as in progress when an enrolled student opens it.
5. Loads progress for the curriculum sidebar.
6. Loads the last video playback position.
7. Calculates video watch progress.
8. Applies the PPP access check.
9. Renders Markdown content.
10. Loads the attached quiz.
11. Removes `isCorrect` from quiz options before sending them to the browser.
12. Calculates previous and next lesson navigation.

The lesson actions support:

- `mark-complete`: write a completed progress record.
- `submit-quiz`: collect selected option IDs and calculate a result.

The UI uses `useFetcher()` so completing lessons and submitting quizzes do not require full page navigation.

`progressService.ts` supports in-progress state, completed state, resetting progress, count-based progress, duration-weighted progress, next incomplete lesson, and recently active courses.

`youtube-player.tsx` dynamically loads the YouTube API, resumes playback from the last position, logs play/pause/progress/ended events, sends progress roughly every ten seconds, and displays a watch-progress bar.

## 9. Quizzes and assessment

Instructors create quizzes through a four-step wizard:

```text
Settings
  → Questions
  → Answer options
  → Review and save
```

The quiz builder supports multiple-choice and true/false questions, reordering, adding/removing options, selecting correct answers, configuring a passing score, replacing an existing quiz, and deleting a quiz.

Saving a quiz is implemented as a full replacement:

1. Delete the existing quiz and dependent data.
2. Create a new quiz.
3. Create all questions.
4. Create all options.

Student scoring reads correct options server-side, calculates the score and A–F grade, stores the attempt and submitted answers, and returns per-question results. The route strips correct answers before rendering the quiz to the browser.

## 10. Instructor module

Instructor routes include:

- `/instructor`: list owned courses.
- `/instructor/new`: create a course.
- `/instructor/:courseId`: manage course metadata and structure.
- `/instructor/:courseId/modules/:moduleId`: preview a module.
- `/instructor/:courseId/lessons/:lessonId`: edit lesson content.
- `/instructor/:courseId/lessons/:lessonId/quiz`: create or edit a quiz.
- `/instructor/:courseId/students`: inspect enrolled students.

The course editor supports title, description, status, price, PPP, sales-copy, module, lesson, and ordering changes. The lesson editor uses Monaco for Markdown and supports lesson title, content, video URL, GitHub repository URL, and duration.

The student roster combines enrollment, progress, user identity, and best quiz attempts so instructors can monitor learner performance.

## 11. Admin module

Admins have three management screens:

- `admin.users.tsx`: edit user names, emails, and roles.
- `admin.courses.tsx`: inspect every course and change status.
- `admin.categories.tsx`: create, rename, and delete categories.

Category deletion is guarded by business logic: a category cannot be deleted while courses still reference it.

## 12. UI architecture

The UI has three layers:

1. Feature pages in `app/routes`.
2. Feature components such as the sidebar, course image, avatars, video player, and Markdown editor.
3. Generic UI primitives in `app/components/ui`.

The application is primarily server-rendered with client-side enhancement:

- Loaders provide initial data.
- Actions mutate state.
- `useFetcher()` handles inline mutations.
- Skeleton fallbacks handle pending states.
- Route-level error boundaries provide friendly errors.
- Tailwind and shadcn provide the visual system.

## 13. Seed data and testing

`scripts/seed.ts` resets the database, runs migrations, and creates a realistic demo scenario containing:

- 9 users.
- 1 admin.
- 2 instructors.
- 6 students.
- 5 categories.
- 2 courses.
- Multiple modules and lessons.
- 3 quizzes.
- 7 enrollments.
- Lesson progress.
- Quiz attempts and answers.
- Video watch events.
- Individual purchases.
- One team purchase.
- Five team coupons.

The service layer has substantial unit-test coverage. Tests use isolated SQLite databases and the project’s actual migration files.

## Important design limitations

Several behaviors are simplified for the course environment:

- Authentication is not production authentication; login is email lookup only.
- Purchases are simulated; there is no Stripe or payment verification.
- Email delivery is not implemented.
- Authorization is route-level and repeated rather than centralized.
- `markEnrollmentComplete()` exists, but I found no normal route that calls it; seeded data supplies completed enrollments.
- Quiz passing score is configurable in the UI, but scoring currently uses a hard-coded score greater than 70%.
- `calculateProgress()` accepts an `includeQuizzes` argument, but current progress calculation is based on lessons only.
- Lesson content is returned even when the visitor is not enrolled. Enrollment gates quizzes, tracking, and completion controls, but the lesson route does not itself redirect a non-enrolled visitor.
- The README mentions Ably, but the current source and dependencies do not contain an active Ably integration.

Overall, the application models a complete educational product lifecycle:

```text
Admin creates platform structure
  → Instructor creates and publishes course
  → Student discovers and purchases course
  → Enrollment grants access
  → Student watches lessons and completes quizzes
  → Progress and attempts are recorded
  → Instructor monitors students
  → Team buyers distribute seats through coupons
```
