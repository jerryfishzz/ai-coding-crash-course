# Teaching notes

- The learner has around seven years of professional software development experience in New Zealand.
- Background includes web development with React and JavaScript, React Native, and more recently Flutter.
- TypeScript is familiar. React knowledge is rusty after about two years away; React Router and Next.js are at a basic understanding level. This repository uses React Router, not Next.js.
- Backend is a growth area: some small Node.js/Express projects, basic SQL database experience, and less confidence with complex backend/database tasks. Drizzle is new to the learner.
- Teach at an experienced developer level: connect new framework patterns to familiar component and client/server concepts; avoid introductory programming explanations.
- Prefer a practical repo path with an honest, provisional skill profile. Calibrate by asking the learner to trace code and explain their reasoning rather than assuming skill from years worked.
- Calibration evidence: correctly traced the DevUI form to the `/api/switch-user` route and identified `parseFormData`/Zod validation. The proposed `users` column came from noticing there is no `sessions` table and trying to follow existing persistence; explain that cookie-backed storage is why the table is absent. For category creation, correctly identified the UI trigger, admin check, Zod schema, service, and why inserting a row needs no migration. Initially mistook the service's duplicate-slug pre-check for the database constraint; reinforce the difference between friendly application checks and schema-enforced invariants.
- Further evidence: correctly diagnosed why module deletion can fail due to foreign-key dependencies. Refine the relationship direction: `deleteModule` removes lessons first; progress, quiz, and video-event rows reference lesson IDs and block deleting those lessons. The courses-to-module reference is not the immediate blocker after lessons are deleted.
- Current aim: build a useful mental model of this repository and become comfortable navigating it.
