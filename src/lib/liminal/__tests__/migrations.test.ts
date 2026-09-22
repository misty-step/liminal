import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = () =>
  readFileSync(join(process.cwd(), "migrations/0002_foundations.sql"), "utf8");

describe("production data invariants", () => {
  it("protects retained judgment states without rewriting historical rows", () => {
    const sql = migration();
    expect(sql).toContain("CREATE TRIGGER IF NOT EXISTS judgments_state_insert_guard");
    expect(sql).toContain("NEW.state NOT IN ('inside', 'close', 'outside')");
    expect(sql).not.toMatch(/DROP TABLE\s+judgments/i);
    expect(sql).not.toMatch(/DELETE FROM\s+judgments/i);
  });

  it("adds an idempotent, privacy-bounded product event table", () => {
    const sql = migration();
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS product_events");
    expect(sql).toContain("event_id TEXT PRIMARY KEY");
    expect(sql).toContain("environment IN ('production', 'staging', 'test')");
    expect(sql).toContain("schema_version = 1");
    expect(sql).not.toMatch(/\banswer\b/i);
  });
});
