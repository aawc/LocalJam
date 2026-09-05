import test from "node:test";
import assert from "node:assert/strict";
import {
  APP_VERSION,
  CURRENT_RELEASE,
  isValidReleaseName,
  formatReleaseName,
  parseReleaseName,
  isValidSemanticTag,
  formatSemanticTag,
  parseSemanticTag
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

  await t.test("formatSemanticTag and isValidSemanticTag handle vYYYY.MM.NNN semantic tags", () => {
    const testDate = new Date(Date.UTC(2026, 8, 4)); // Sept 4, 2026
    assert.equal(formatSemanticTag(testDate, 1), "v2026.09.001");
    assert.equal(formatSemanticTag(testDate, 42), "v2026.09.042");
    assert.equal(formatSemanticTag(testDate, 1005), "v2026.09.1005");

    assert.equal(isValidSemanticTag("v2026.09.001"), true);
    assert.equal(isValidSemanticTag("v2026.12.042"), true);
    assert.equal(isValidSemanticTag("v2026.09.1005"), true);

    // Invalid semantic tags
    assert.equal(isValidSemanticTag("2026-09-04-001"), false);
    assert.equal(isValidSemanticTag("v1.0.0"), false);
    assert.equal(isValidSemanticTag("v2026.13.001"), false); // Invalid month
    assert.equal(isValidSemanticTag("v2026.9.1"), false);
    assert.equal(isValidSemanticTag(null), false);
    assert.equal(isValidSemanticTag(""), false);

    const parsed = parseSemanticTag("v2026.09.042");
    assert.ok(parsed);
    assert.equal(parsed.year, "2026");
    assert.equal(parsed.month, "09");
    assert.equal(parsed.runNumber, 42);

    assert.equal(parseSemanticTag("invalid"), null);
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
