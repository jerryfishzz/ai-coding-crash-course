# Build a feature

## Prompts

Build a course review system with these requirements:

- Students can leave a 1-5 star rating on courses (no written reviews yet)
- Ratings appear as a global average visible to all users
- The average rating displays on both the course list page and the course detail page
- Students should see a way to select a star rating on the course page

## Think About the Feature

Before you write your prompt, consider:

- Where should the star-rating widget appear?

  - `courses.tsx`: should show the average display-only review
  - `courses.$slug.tsx`:
    - Should show the average display-only review.
    - Also have a section for users to leave their own rating. Once user submits a rating successfully, the rating section should disappear and the average rating should update accordingly.

- How should the average rating be calculated and stored?

  It should be calculated based on all student ratings for the course and saved in the `courses` table as the average rating.

- Which database tables and API routes will need to change?

  - `enrollments` table should record the student's rating for each course.
  - Every new rating should trigger an update to the average rating stored in the `courses` table.
  - `getUserEnrolledCourses` is the API route that should be updated to include the user's rating for each course.

- Should there be any restrictions on who can rate (for example, should instructors be able to rate their own courses)?

  Except instructor itself, anybody else can rate the course.

## Observe the baseline

- How many files were modified or created?

  4 modified and 4 created

- What was the quality of the implementation?

  I think the quality is pretty good.

- Did the agent make any assumptions you didn't expect?

  No. It uses a different way from what I initially expected. But I think it works better than my original idea.

- What would you improve about this approach?

  I do need to ask some questions to it on some implementation before I can suggest any improvements.

- Context used

  41.4K

- Most time consuming jobs

  - Failed (exit 130): 17.5s

## Notes

### `onConflictDoUpdate`

```ts
db
.insert(courseRatings)
.values({ courseId, userId, rating })
.onConflictDoUpdate({
  target: [courseRatings.courseId, courseRatings.userId],
  set: { rating },
})
.returning()
.get();
```

### HTML submission string type

HTML forms submit ordinary field values as **strings**, even when the value starts as a number.

In the picker:

```tsx
<button name="rating" value={value}>
```

`value` is a JavaScript number, but the form submits it as text. Selecting five stars produces:

```ts
const rating = form.get("rating"); // "5", not 5
```

`FormData.get()` can return **`string | File | null`**, so this check rules out a file or missing field:

```ts
typeof rating !== "string"
```

After validating the string, we convert it to a number for the service:

```ts
saveCourseRating(course.id, userId, Number(rating));
```

## Questions
