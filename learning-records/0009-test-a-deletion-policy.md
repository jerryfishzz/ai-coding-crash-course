# 0009 — Turn deletion policy into tests

## Skill

Translate a data-retention policy into observable test assertions, including preserved history and unrelated rows.

## Lesson

[Turn deletion policy into tests](../lessons/0009-test-a-deletion-policy.html)

## Repo example

The module tree can include lessons, lesson progress, quizzes and attempts, and video-watch events. Their expected fate depends on product policy.

## Durable insight

Test both what changes and what must not change. Restriction should preserve all rows on failure; archive should preserve history and alter read visibility; cascade should remove intended descendants while preserving unrelated data.

## Next useful challenge

Choose one policy for a hypothetical module and specify exact post-operation assertions. Keep the exercise separate from deciding the actual product requirement.

## Practice response

The learner proposed checking that restriction throws and related rows survive; archive updates and subsequent visibility behavior; cascade removes dependent rows; and unrelated-row counts remain stable.

Refinements:

- **Restrict:** assert the expected error and query the database to verify the module, lesson, and history remain.
- **Archive:** first choose the archive model. If only the module is marked archived, dependent rows remain unchanged; test the archive marker and the service/query visibility rules. Marking all child rows archived is another possible design, but adds writes and should be transactional. Test a user-facing UI separately if needed; a service/query test should directly verify its returned records.
- **Cascade:** assert specific intended descendants are gone and a known unrelated record remains. Counts are useful, but pair them with IDs or sentinel rows so an incorrect deletion cannot accidentally leave the same total.
