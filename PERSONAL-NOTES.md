# Personal Notes

## Commands

- `npx drizzle-kit studio`

  Open Drizzle Studio web application

## Teach Me

### Lesson 1

`$teach` Teach me about this repo. Something about me: I've been working as a software developer in New Zealand for around seven years. I started in web development, working with technologies like React and JavaScript, and over time I moved more into cross-platform mobile development, first with React Native and more recently Flutter.

### Lesson 2

`$teach` I've been away from React about 2 years. So several techs used in this repo are newer to me. I know Typescript, React. But like React Router, or Next.js, I can only say that I have a basic understanding and would need to refresh my knowledge to work with them effectively. The backend and database are always my weak areas since most of my experience has been on the frontend. I worked on small backend projects using Node.js and Express, and I have some experience with SQL databases, but I would need to spend some time to get up to speed with more complex backend and database tasks. Possibly, if you can provide an evaluation of my current skill level, it would help you know me better and then give me a guide suitable for me to understand or work with this repo.

Based on your questions from Calibration exercise on the page `lessons/0002-skill-profile-and-repo-path.html`, here are my answers:

1. What starts the request, and which route function receives it?

    It starts from Switch user dropdown in the `DevUI` component, which triggers the request.

    The route is `route("api/switch-user", "routes/api.switch-user.ts")`.

2. Where is the submitted data validated, and where is the session changed?

    The validation happens in `const parsed = parseFormData(formData, switchUserSchema)`.

    The session changes in

    ```ts
    return redirect(url.searchParams.get("redirectTo") ?? "/", {
      headers: { "Set-Cookie": cookie },
    });
    ```

3. If this operation instead wrote a database row, which service/schema files and migration steps would you expect?

    The service should be `userService` while the schema should be `users`. The `users` table should add a new column like `current_user` or something for the currently active user. This needs a corresponding migration to update the database schema accordingly.

_Response to its answer:_

I agreed with your answer that the database operation should be related to session. But I saw there is no sessions table in the database. So I thought probably I should follow the existing structure and add the info in users table.

### Lesson 4

_Questions:_

- "lets the UI submit without a navigation"

  The above words were not very clear. With my question, the lesson was modified to include a detailed explanation of how the fetcher submission works and why it does not trigger a navigation.

- I found `createCategory(parsed.data.name);` on line 94 in `admin.categories.tsx` does not use `await`, which is a db insert action and very possibly should be awaited to ensure proper handling of the asynchronous operation. Will it lead to the return mistakenly sent but the database operation not yet completed?

  _Answer:_

  The repo configures Drizzle with `better-sqlite3` (database setup (`app/db/index.ts:1`)), whose API is synchronous. Drizzle’s SQLite docs and better-sqlite3’s docs describe those drivers.

  _Question:_

  Can I understand `better-sqlite3` is a way to use synchronous API for SQLite in Node.js? But for error handling, we still need to use try-catch blocks to catch any potential errors during the database operations, right?

  _Answer:_

  Yes. `better-sqlite3` gives Node.js a synchronous API for SQLite: a query runs and returns its result before execution continues. [Its docs describe the API as synchronous](https://github.com/WiseLibs/better-sqlite3).

  And yes, database operations can still fail, so `try/catch` is useful.

_Questions from the lesson:_

- Where the UI submits;

  UI submites on `Save` button in `CreateCategoryRow`

- Where the route checks authorization;

  Authorization is checked in `action` when `currentUser` and `currentUser.role` are checked

- Which schema validates name;

  `adminCategoryActionSchema`

- Which service writes the row;

  `categoryService`

- Where the database prevents a duplicate slug.

  ```ts
  const existingSlug = getCategoryBySlug(slug);
  if (existingSlug) {
    throw new Error(`A category with the slug "${slug}" already exists.`);
  }
  ```

- Then explain why adding a new category does not require npm run db:generate.

  No table structure changes, but just add a new row in the existing table.

### Lesson 5

- Is `ON DELETE no action` in migration is auto generated?

  Yes

_Answer to the last practice:_

I tried to delete a module `Getting Started with TypeScript` from `instructor` page but failed. Tracing the `delete-module` action in the code, though `deleteModule` function tries to delete all the lessons connected to the module, module id is still referenced by other tables in the database, causing the deletion to fail due to foreign key constraints. Since there is no guard in `deleteModule`, the page will throw an error for general failure and the deletion will not succeed.

_Response from AI:_

One refinement: the immediate blocker is that other rows reference the lessons, not that other tables still reference the module.

## Codex Context window customization

`~/.codex/config.toml`

In the first section before the project name line, add:

`model_context_window = 1050000`

## Migration Steps

1. Update `app/db/schema.ts`
2. Run `npm run db:generate`
3. Inspect the generated SQL in `drizzle/`
4. Run `npm run db:migrate`
