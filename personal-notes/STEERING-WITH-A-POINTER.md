# Steering with a Pointer

`npm run cherry-pick writing-for-agents-skill`

- Prompt from Matt

> I would like you to take the AGENTS.md file, especially the stuff about the database migrations and all of those steps, and put that behind a context pointer. It's just a little bit too large right now, and I don't want to have this in every model provider request.

> Update the description of the pointer in AGENTS.md to be a bit broader to say: whenever we make a database change, follow these steps.

- Prompt from me

> You can see there is a Database Migrations section in AGENTS.md. I don't think it is a good idea to leave so much content in the agent context always since not all the issues we deal with are related to database migration. I want to move this section to another place and leave a reference in the agent context so you can invoke it when it is needed. We can move it to the docs folder in the repo root. Tell me what's your plan then we can start.
