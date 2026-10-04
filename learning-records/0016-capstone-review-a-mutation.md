# 0016 — Capstone: review a mutation

## Skill

Independently trace a UI mutation through route mapping, server checks, validation, service/database effects, response behavior, and tests.

## Lesson

[Capstone: review a mutation](../lessons/0016-capstone-review-a-mutation.html)

## Focus

The self-purchase path combines the route and persistence concepts from Lessons 10–15: request submission, server-side rules, multiple writes, transaction boundaries, and assertions about database state.

## Practice

Answer the six prompts in Lesson 16. Review the response for correct request flow, checks before writes, tables affected, possible partial state, and tests that assert invariants.

## Learner response and feedback

The learner correctly identified the route pattern (`/courses/:slug/purchase`), `<fetcher.Form method="post">`, the existence/authentication/input/enrollment checks, the missing published-status guard, and the purchase/enrollment partial-write risk. They proposed the right transaction invariant and identified external APIs, email, and notifications as effects a database rollback cannot undo.

Refinements: the UI submission itself is a fetcher submission (it does not initiate a navigation in the usual way), but after the action succeeds this route throws a redirect to `/courses/${slug}/welcome`, so the user does navigate there. The `createTeamPurchase` call belongs to the separate team-purchase branch; it creates a purchase, obtains/creates the team and membership, and generates coupons, but it does not create an enrollment for the purchaser. For the requested self-purchase trace, the next step after the two writes is the welcome redirect. For a strong transaction failure-path test, force enrollment creation to fail after the purchase insert and assert that neither purchase nor enrollment remains. A complementary assertion can confirm that the intended failure response/error also occurred.
