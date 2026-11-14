import { expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { testTable } from "./schema";

it("preserves existing rows and defaults creation timestamps for new inserts", () => {
  const sqlite = new Database(":memory:");

  try {
    sqlite.exec(
      readFileSync(
        new URL(
          "../../drizzle/0007_watery_silver_samurai.sql",
          import.meta.url
        ),
        "utf8"
      )
    );
    sqlite.exec(
      "INSERT INTO test_table (id, note) VALUES (42, 'Existing row')"
    );

    const before = Date.now();
    sqlite.transaction(() => {
      sqlite.exec(
        readFileSync(
          new URL(
            "../../drizzle/0008_narrow_the_renegades.sql",
            import.meta.url
          ),
          "utf8"
        )
      );
    })();

    const db = drizzle(sqlite);
    const existing = db.select().from(testTable).get()!;
    expect(existing).toMatchObject({ id: 42, note: "Existing row" });

    const inserted = db
      .insert(testTable)
      .values({ note: "New row" })
      .returning()
      .get();
    expect(inserted).toMatchObject({ id: 43, note: "New row" });

    sqlite.exec("INSERT INTO test_table (note) VALUES ('Raw SQL row')");
    const raw = db.select().from(testTable).where(eq(testTable.id, 44)).get()!;
    const after = Date.now();

    for (const row of [existing, inserted, raw]) {
      const createdAt = new Date(row.createdAt);
      expect(createdAt.toISOString()).toBe(row.createdAt);
      expect(createdAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(createdAt.getTime()).toBeLessThanOrEqual(after);
    }

    db.update(testTable)
      .set({ note: "Updated row" })
      .where(eq(testTable.id, inserted.id))
      .run();
    expect(
      db.select().from(testTable).where(eq(testTable.id, inserted.id)).get()
    ).toMatchObject({ note: "Updated row", createdAt: inserted.createdAt });
    expect(() =>
      sqlite.exec("INSERT INTO test_table (created_at) VALUES (NULL)")
    ).toThrow(/NOT NULL/);
  } finally {
    sqlite.close();
  }
});
