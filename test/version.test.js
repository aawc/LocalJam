import test from "node:test";
import assert from "node:assert/strict";
import {
  APP_VERSION,
  CURRENT_RELEASE,
  isValidReleaseName,
  formatReleaseName,
  parseReleaseName
} from "../src/version.js";

test("Release Versioning & Naming Convention Suite", async (t) => {
  await t.test("APP_VERSION strictly adheres to YYYY-MM-DD-NNN format", () => {
    assert.ok(isValidReleaseName(APP_VERSION), `${APP_VERSION} must be a valid release name`);
  });

  await t.test("isValidReleaseName accurately validates release name strings", () => {
    assert.equal(isValidReleaseName("2026-09-04-001"), true);
    assert.equal(isValidReleaseName("2026-12-31-999"), true);
    assert.equal(isValidReleaseName("2025-01-01-042"), true);

    // Invalid formats
    assert.equal(isValidReleaseName("v1.0.0"), false);
    assert.equal(isValidReleaseName("2026-9-4-1"), false);
    assert.equal(isValidReleaseName("2026-09-04"), false);
    assert.equal(isValidReleaseName("2026-09-04-1"), false);
    assert.equal(isValidReleaseName("2026-13-01-001"), false); // Invalid month
    assert.equal(isValidReleaseName(null), false);
    assert.equal(isValidReleaseName(""), false);
  });

  await t.test("formatReleaseName generates standardized release string", () => {
    const testDate = new Date(Date.UTC(2026, 8, 4)); // Sept 4, 2026
    assert.equal(formatReleaseName(testDate, 1), "2026-09-04-001");
    assert.equal(formatReleaseName(testDate, 15), "2026-09-04-015");
    assert.equal(formatReleaseName(testDate, 120), "2026-09-04-120");
  });

  await t.test("parseReleaseName decomposes release version into date and sequence", () => {
    const parsed = parseReleaseName("2026-09-04-007");
    assert.ok(parsed);
    assert.equal(parsed.date, "2026-09-04");
    assert.equal(parsed.sequence, 7);

    assert.equal(parseReleaseName("invalid-name"), null);
  });

  await t.test("CURRENT_RELEASE contains valid metadata, commit history, and notes", () => {
    assert.ok(CURRENT_RELEASE);
    assert.ok(isValidReleaseName(CURRENT_RELEASE.version));
    assert.ok(Array.isArray(CURRENT_RELEASE.commits));
    assert.ok(CURRENT_RELEASE.commits.length > 0);

    for (const c of CURRENT_RELEASE.commits) {
      assert.ok(c.hash, "Commit must have hash");
      assert.ok(c.message, "Commit must have message");
    }

    assert.ok(Array.isArray(CURRENT_RELEASE.notes));
    assert.ok(CURRENT_RELEASE.notes.length > 0);
  });
});
