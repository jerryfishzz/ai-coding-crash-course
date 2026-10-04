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

### Lesson 6

_For practice:_

Let me tell you my ideas on all the three options.

- Preserve history by archiving modules

  We need to create a migration to add a boolean typed `archived` column to the `modules` table. So when users choose to delete the module, we can simply set `archived` to `true` instead of actually removing the row from the database.

  We also need to modify UI components to reflect the archived status, such as hiding archived modules from the main view or indicating their archived state.

- Restrict deletion when history exists

  This will be similar to deleting category. We can check dependency tree for any lessons or other entities that reference the module before allowing deletion. If dependencies exist, we can prevent deletion and provide a meaningful message to the user.

- Cascade deletion

  We need to create a migration to add `ON DELETE CASCADE` to the foreign key constraints for any lessons or other entities that reference the module. This ensures that when a module is deleted, all dependent rows are automatically removed from the database. We also need to put it as a transaction to maintain database integrity.

_Answer:_

- Archive: Your approach preserves history. Remember to update every relevant list, lookup, and route so archived modules are hidden or clearly labelled. An `archivedAt` timestamp can also record when the archive happened.

- Restrict: Checking for dependencies and explaining why deletion is blocked is sensible. Check the full dependency tree — not just lessons — and keep the foreign-key constraint as a final safeguard against deletion slipping through.

- Cascade: You’re right that the foreign-key policy must be reflected in the schema. One important wrinkle: cascading from modules to lessons alone wouldn’t remove progress, quizzes, and video events that refer to those lessons. Each relationship needs an intentional policy. A transaction is essential for explicit multi-step cleanup; a single SQLite delete with configured cascades is atomic on its own.

_Question:_

Questions to your answer:

- Archive: do you mean I need to add `archived` column to all the relevant tables that directly or indirectly reference modules? So when I archive a module, I also need to mark all dependent rows as archived? If so, this action also needs to be done within a transaction to maintain database integrity.

- Cascade: you said "cascading from modules to lessons alone wouldn’t remove progress, quizzes, and video events that refer to those lessons". So if I create a migration that add `ON DELETE CASCADE` to all the foreign keys in the database, does it mean it will ensure all dependent rows are automatically removed when a module is deleted? Basically, what I mean is I will make `ON DELETE CASCADE` as a database-level policy for all relationships.

I think it would be good to have some real examples to demonstrate those scenarios. I don't know how you arrange the lesson progress and content. But it would be good to let me know.

_Question:_

In cascade deletion, if `NO ACTION` edge blocks the statement, does the whole cascade deletion stop? Do I need to wrap this deletion within a transaction since one-line deletion on a row in one table will actually trigger deletions on all dependent rows?

_Answer:_

Yes. If a `NO ACTION` foreign-key constraint is violated anywhere during the cascade, SQLite aborts the entire `DELETE` statement. It rolls back the parent deletion and any cascaded row deletions triggered by that statement, so you don’t get a partial cascade. [SQLite’s foreign-key documentation](https://www.sqlite.org/foreignkeys.html) describes this behavior.

You don’t need to add an explicit transaction just to make that single DELETE statement atomic. The statement itself is atomic, including its cascades. Use an explicit transaction when the operation involves multiple statements that must succeed or fail together—for example, deleting rows in application-controlled steps and then deleting the module.

### Lesson 7

_Practice:_

- Which step creates SQL

  `npm run db:generate`

- Which step changes the database

  `npm run db:migrate`

- What application behavior is still missing after the migration?

  Use the updated database schema in the application to update UI components accordingly.

### Lesson 8

`createTestDb` creates an in-memory test database instance that use the same setup as the main database. This instance can be used for running isolated tests without affecting the actual development or production database.

The module-delete test when progress exists will throw and error, preventing the deletion of the module. The module can still be found in the database after the failed deletion attempt.

_Question:_

In your test example, what does this try to validate?

```ts
expect(testDb.select().from(schema.lessons).all())
  .toContainEqual(expect.objectContaining({ id: lesson.id }));
```

Is it necessary?

_Answer:_

That assertion verifies the lesson row still exists after `deleteModule` throws. It complements the assertion that the module still exists: together, they check that neither row was deleted when the foreign-key constraint blocked the operation.

It’s useful, but not strictly necessary if the test’s only concern is “the module wasn’t deleted.” Since the lesson is the row whose deletion fails, checking that it remains makes the expected database state clearer. You could also assert its exact ID with a `find`/`some` check; `objectContaining` just lets the assertion match the relevant field without comparing every column.

### Lesson 9

My answer to assertions for three policies at the end of the lesson:

- Restrict

  1. Check the deletion itself throws an error
  2. Check that the related rows are not deleted

- Archive

  1. Check the archive action updates related rows accordingly with the archived marker
  2. If the query filters archived rows, ensure the archived rows are correctly included or excluded based on the filter afterwards; if the query doesn't include the logic, check the UI behavior to confirm archived rows are handled appropriately.

- Cascade

  1. Check the cascade action deletes related rows accordingly.
  2. When checking unrelated rows, it is good to use counts to ensure their number remains consistent before and after the cascade deletion.

  _Question:_

  You said "also verify a specific unrelated row remains, so the test confirms the cascade’s scope — not just the total number of rows". I wonder how. Do you mean when we create a test, we also create the unrelated row explicitly and then check that it still exists after the cascade deletion?

  _Answer:_

  Yes

_Question:_

With archive policy, is it good to implement the filter on query level or on the UI level, or implement on both?

Answer:

Usually both. Keep the policy centralized in query/service functions, and use UI logic for presentation.

### Lesson 10

For the practice at the end of the lesson:

1. 401 for authentication failures.
2. 403 for authorization failures.
3. 400 for bad requests.

The order follow the common sense. First, check for authentication since we don't want to handle unsolicited requests from unauthenticated users. Then, check for authorization to ensure the user has the necessary permissions. Finally, validate the request data to catch any bad requests.

_Question:_

You said "Route actions are server-side mutation handlers in React Router’s framework model". From the React Router documentation, it says "Client actions only run in the browser and take priority over a server action when both are defined". In the example of `admin.categories.tsx`, the `action` function is a server-side action. It is invoked when the corresponding route receives a matching request, defined in the route configuration `route("admin/categories", "routes/admin.categories.tsx")`. I am wondering, how does this interact with client actions if they are also defined for the same route? I don't know React Router very much. I am just curious since the documentation talks about priority but doesn't explain the exact interaction in practice. I guess since this is a full-stack project, the `action` will work when the request reaches the server side while the hypothesis `clientAction`, if it exists, will run on the browser if there are some specific requirements on the front-end to deal with. The `clientAction` will replace `action`, but only on browser. When the request goes to the server, the server-side `action` will still be invoked. Am I right?

### Lesson 11

For the practice at the end of the lesson:

The relationship check between course and module is important to ensure that instructors can only modify modules belonging to their own courses. This is the place where the server-side check should stop the write.

The route itself will check if the course is owned by the instructor. But the ownership check ends to this extent and won't automatically validate the module's ownership. Therefore, an additional check is necessary to confirm that the module being modified actually belongs to the instructor's course.

_Question:_

In the lesson it says "Imagine instructor A edits their own course but submits a moduleId belonging to instructor B’s course". I don't think users can do this through the web application.

_Answer:_

Yes, like Postman.

### Lesson 12

For the practice at the end of Lesson 12:

- It should return 404 error
- One database assertion should be module B remains the same. But I am not sure the other one. Do you mean the other is if course A should also remain the same. Yes I think so.
- One allowed request is instructor A modify course A with module A ID.

### Lesson 13

For the practice at the end of Lesson 13:

- UI submit: check if input is empty or same as the previous value. If it is empty or no changes, then no submission. If no submission, the component state doesn't change. So the input will still keep the same as before.

- Route checks: if the UI submit passed, it will go to route check.

  1. Check user authentication
  2. Check the user authorization on the course
  3. Validate the request data through Zod schema
  4. Go to the submission branch by `intent`. Check if the modified module actually belongs to the course being edited.
  5. Perform the submission

- Service/database write: run `updateModuleTitle` from `moduleService.ts`. This will return the updated module object if the update is successful.

- UI update afterwards: the successful update will return `{ success: true, field: "module" }`. I know it will trigger `loader` to update. But I don't know how it only update module title section but not the full page.

- One test is `updateModuleTitle` in `moduleService.test.ts`. Looks like there is not tests for routes and UI in the project yet.

_Answer:_

**Empty input nuance:** the displayed title remains the old value because read mode renders the `value` prop. But `editValue` stays empty, so reopening the editor may show an empty input until the value changes or Cancel resets it. That looks like a small UX edge case in the current component.

### Lesson 14

For the practice at the end of Lesson 14:

The rule is checked in `loader`.

In `action`, it should check if the course is published after checking the existence of the course as it does in `loader`. If not published, it should return a 404 error.

A test for this missing check should be:

- Expect a 404 if the course is not published.
- Make sure the purchase table doesn't have the row with the current userId and the courseId of the unpublished course.
- Make sure the enrolment table doesn't have the row with the current userId and the courseId of the unpublished course.
- If it is a team purchase, make sure no coupon is created.

I first thought since it throws when the course is not published and the code stops running - no submission happened, no need to validate no row insertions in the database for the unpublished course. But then I realized that this assumption was probably too case specific. If the code changes in the future to handle errors differently, this assumption probably wouldn't validate what we expect and could lead to false positives in the tests. So I decided we still need to do no row creation happened check. It's the general core of this validation logic despite the current implementation specifics.

### Lesson 15

For the practice at the end of Lesson 15:

- If `createPurchase` succeeds and `enrollUser` throws, the purchase will be added but the enrolment will not be created.

- The failure-path test should verify that if `enrollUser` throws an error after `createPurchase` succeeds, neither purchase nor the enrolment is created.

- Side effects like email delivery is out of the scope of database transactions. So the rollback itself cannot undo them.

_Question:_

In the reference article Multi-write transaction checklist, what do you mean by "a global db query may escape the transaction"?

_Answer:_

Use this way:

```ts
await db.transaction(async (tx) => {
  tx.insert(purchases).values(...).run();
  tx.insert(enrollments).values(...).run();
});
```

not this way:

```ts
await db.transaction((tx) => {
  tx.insert(purchases).values(...).run();
  enrollUser(...); // internally uses global db
});
```

If a helper called inside that callback uses the imported global `db` instead of `tx`, its query may run outside the transaction.

### Lesson 16

1. What URL receives the form, and what UI mechanism submits it?

   The receiving URL is `courses/:slug/purchase`.

   The submitting mechanism is `<fetcher.Form method="post">`, so it submits to the route action without navigating away.

   _Question:_

   What do you mean by "what UI mechanism submits it"? What do you want me to explain here?

   Do you mean if it uses `<Form>` it will navigate away?

   _Answer:_

   Not necessarily “away” to a different page. A React Router `<Form method="post">` submits to the route action, then normally follows the action’s response—often redirecting or revalidating loader data. If there’s no redirect, the current route can remain displayed.

2. What identity, input, and business-rule checks happen in the action before the write? Which published-course guard is missing?

    It checks:

    - If the course exists
    - If the user is logged in
    - If the submission data is valid
    - If the intent is `confirm-purchase`, check if the user is already enrolled

    It misses the check if the course is published

3. Which service calls write which records, and what does a successful request do next?

    - `createPurchase` is called to write `purchases` row
    - `enrollUser` is called to write `enrollments` row
    - `createTeamPurchase` is called to write `coupons` row

4. If the purchase insert succeeds but enrollment fails today, what partial state may remain? What transaction boundary would protect the invariant?

    - The purchase row will exist in the `purchases` table as partial state
    - The transaction boundary would protect the invariant by ensuring that either both the purchase and enrollment inserts succeed, or neither does.

5. Name one success-path and one failure-path database assertion that would test the intended behavior.

    - The success-path can assert that both the `purchases` and `enrollments` rows exist after a successful purchase.
    - The failure-path can assert that if the enrollment fails, no `purchases` row is created, ensuring the transaction is rolled back.

       _Question:_

       You said "For the failure-path test, force enrollment creation to fail after the purchase insert, then assert that neither row remains.". Does it mean in this transaction, the purchase row was inserted before performing the enrollment insert? We can't see the purchase row from the result because later the enrollment insert fails, and the transaction rolls back the purchase insert. Is this rollback deleting the previously inserted purchase row or just reverting the insert operation on the purchases table? I remember normally the id for a new row is auto generated by incrementing a sequence in a table. So I want to know if this rollback will leave a break in the sequence or if it will be reused for the next insert. For example, if the purchase row was assigned an id of 5 before the rollback, will the next insert get id 5 again or id 6?

       _Answer:_

       Yes—the purchase insert runs first inside the transaction. SQLite assigns it an ID, and code inside the transaction could use or read that row before the enrollment insert. But if enrollment then fails and the transaction rolls back, the purchase insert is undone; afterward, the row is absent as though that insert hadn’t committed.

       For this repo, `purchases.id` is `INTEGER PRIMARY KEY AUTOINCREMENT` in the migration. In your example, if ID 5 was assigned inside the transaction and that transaction rolled back, the next successful insert can get ID 5 again—assuming nothing else has since used it. SQLite’s `AUTOINCREMENT` tracks committed IDs; rolled-back IDs may be reused. A previously committed ID, even if its row was later deleted, won’t be reused. [SQLite’s AUTOINCREMENT documentation](https://www.sqlite.org/autoinc.html)

       So don’t treat IDs as a gapless sequence. The rollback undoes the insert and its transactional sequence update; it isn’t a separate `DELETE`. I added this detail to the [Lesson 15 learning record](/Users/amp_salesforce/ai-coding-crash-course/learning-records/0015-keep-related-writes-together.md).

       _Question:_

       You said "SQLite’s `AUTOINCREMENT` tracks committed IDs; rolled-back IDs may be reused. A previously committed ID, even if its row was later deleted, won’t be reused." Does it mean rolled-back IDs are not considered committed and therefore can be reused for future inserts?

       _Answer:_

       Yes, exactly. A rolled-back ID was never part of a committed transaction, so SQLite’s `AUTOINCREMENT` rule does not reserve it; a future insert can reuse it.

       For example, if an insert gets ID 5 inside a transaction that rolls back, the next insert can get ID 5 again. But if ID 5 was committed and its row later deleted, SQLite won’t reuse 5.

6. Which external side effect would not be undone by a database rollback?

    Any external API calls, emails sent, or notifications triggered would not be undone by a database rollback.

## Codex Context window customization

`~/.codex/config.toml`

In the first section before the project name line, add:

`model_context_window = 1050000`

## Migration Steps

1. Update `app/db/schema.ts`
2. Run `npm run db:generate`
3. Inspect the generated SQL in `drizzle/`
4. Run `npm run db:migrate`
