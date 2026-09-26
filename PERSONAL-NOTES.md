# Personal Notes

## Commands

- `npx drizzle-kit studio`

  Open Drizzle Studio web application

## Teach me

### Question 1

`$teach` Teach me about this repo. Something about me: I've been working as a software developer in New Zealand for around seven years. I started in web development, working with technologies like React and JavaScript, and over time I moved more into cross-platform mobile development, first with React Native and more recently Flutter.

### Question 2

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

## Codex Context window customization

`~/.codex/config.toml`

In the first section before the project name line, add:

`model_context_window = 1050000`
