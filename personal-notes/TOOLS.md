# Tools

## Commands

- `npx drizzle-kit studio`

  Open Drizzle Studio web application

## Codex Context window customization

`~/.codex/config.toml`

In the first section before the project name line, add:

`model_context_window = 1050000`

## Migration Steps

1. Update `app/db/schema.ts`
2. Run `npm run db:generate`
3. Inspect the generated SQL in `drizzle/`
4. Run `npm run db:migrate`
