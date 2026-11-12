import { afterEach, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import * as schema from "./schema";

const migrationsFolder = fileURLToPath(
  new URL("../../drizzle", import.meta.url)
);
let temporaryFolder: string | undefined;
let sqlite: Database.Database | undefined;

afterEach(() => {
  sqlite?.close();
  if (temporaryFolder) rmSync(temporaryFolder, { recursive: true });
});

it("upgrades a populated pre-discussion database without rebuilding or losing existing relationships", () => {
  temporaryFolder = mkdtempSync(path.join(tmpdir(), "discussion-upgrade-"));
  mkdirSync(path.join(temporaryFolder, "meta"));
  const journal = JSON.parse(
    readFileSync(path.join(migrationsFolder, "meta/_journal.json"), "utf8")
  );
  journal.entries = journal.entries.filter(
    (entry: { idx: number }) => entry.idx < 6
  );
  writeFileSync(
    path.join(temporaryFolder, "meta/_journal.json"),
    JSON.stringify(journal)
  );
  for (const entry of journal.entries)
    copyFileSync(
      path.join(migrationsFolder, `${entry.tag}.sql`),
      path.join(temporaryFolder, `${entry.tag}.sql`)
    );

  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const database = drizzle(sqlite, { schema });
  migrate(database, { migrationsFolder: temporaryFolder });
  sqlite.exec(`
    INSERT INTO users(id,name,email,role,created_at) VALUES (1,'Student','s@test.com','student','2026-01-01'), (2,'Teacher','t@test.com','instructor','2026-01-01');
    INSERT INTO categories(id,name,slug) VALUES (1,'Category','category');
    INSERT INTO courses(id,title,slug,description,instructor_id,category_id,status,created_at,updated_at) VALUES (1,'Existing','existing','Keep this',2,1,'published','2026-01-01','2026-01-02');
    INSERT INTO modules(id,course_id,title,position,created_at) VALUES (1,1,'Module',1,'2026-01-01');
    INSERT INTO lessons(id,module_id,title,position,content,created_at) VALUES (1,1,'Lesson',1,'Keep lesson text','2026-01-01');
    INSERT INTO enrollments(user_id,course_id,enrolled_at) VALUES (1,1,'2026-01-01');
    INSERT INTO course_ratings(course_id,user_id,rating,created_at,updated_at) VALUES (1,1,5,'2026-01-01','2026-01-02');
    INSERT INTO lesson_progress(user_id,lesson_id,status) VALUES (1,1,'completed');
    INSERT INTO purchases(user_id,course_id,price_paid,created_at) VALUES (1,1,1000,'2026-01-01');
  `);

  migrate(database, { migrationsFolder });
  expect(database.select().from(schema.courses).get()).toMatchObject({
    id: 1,
    title: "Existing",
    description: "Keep this",
    discussionOverride: "inherit",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-02",
  });
  expect(database.select().from(schema.lessons).get()).toMatchObject({
    id: 1,
    content: "Keep lesson text",
    discussionPaused: false,
  });
  expect(database.select().from(schema.enrollments).all()).toHaveLength(1);
  expect(database.select().from(schema.courseRatings).get()?.rating).toBe(5);
  expect(database.select().from(schema.lessonProgress).get()?.status).toBe(
    "completed"
  );
  expect(database.select().from(schema.purchases).get()?.pricePaid).toBe(1000);
  expect(database.select().from(schema.discussionSettings).all()).toEqual([
    { id: 1, defaultEnabled: false },
  ]);
  expect(database.select().from(schema.discussionNotifications).all()).toEqual(
    []
  );
  expect(sqlite.pragma("foreign_key_check")).toEqual([]);
  expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);

  database
    .update(schema.courses)
    .set({ discussionOverride: "enabled" })
    .where(eq(schema.courses.id, 1))
    .run();
  migrate(database, { migrationsFolder });
  expect(database.select().from(schema.courses).get()?.discussionOverride).toBe(
    "enabled"
  );
});
