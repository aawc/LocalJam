import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  syncVersionJs,
  syncServiceWorker,
  buildVersionJson,
  getRecentCommits,
  syncAllVersionFiles,
  DEFAULT_RELEASE_NOTES
} from "../../scripts/generate-version.js";

test("Deployment Version Synchronizer Script Suite", async (t) => {
  await t.test("syncVersionJs updates APP_VERSION and CURRENT_RELEASE fields cleanly", () => {
    const originalJs = `/**
 * Version config
 */
export const APP_VERSION = "2026-09-04-004";

export const CURRENT_RELEASE = {
  version: "2026-09-04-004",
  releaseDate: "2026-09-04",
  title: "LocalJam 2026-09-04-004",
  commits: [{ hash: "1234567", message: "Initial" }],
  notes: ["Note 1"]
};
`;

    const updated = syncVersionJs(originalJs, {
      tagName: "v2026.09.041",
      releaseDate: "2026-09-08"
    });

    assert.ok(updated.includes('export const APP_VERSION = "v2026.09.041";'), "APP_VERSION must be updated");
    assert.ok(updated.includes('version: "v2026.09.041"'), "CURRENT_RELEASE.version must be updated");
    assert.ok(updated.includes('releaseDate: "2026-09-08"'), "CURRENT_RELEASE.releaseDate must be updated");
    assert.ok(updated.includes('title: "LocalJam v2026.09.041"'), "CURRENT_RELEASE.title must be updated");
    assert.ok(updated.includes('commits: [{ hash: "1234567"'), "Commits array must be preserved");
  });

  await t.test("syncVersionJs handles single-quote and formatting variations", () => {
    const singleQuoteJs = `export const APP_VERSION = 'v2026.09.030';
export const CURRENT_RELEASE = {
  version: 'v2026.09.030',
  releaseDate: '2026-09-01',
  title: 'LocalJam v2026.09.030'
};`;

    const updated = syncVersionJs(singleQuoteJs, {
      tagName: "v2026.09.050",
      releaseDate: "2026-09-10"
    });

    assert.ok(updated.includes('export const APP_VERSION = "v2026.09.050";'));
    assert.ok(updated.includes('version: "v2026.09.050"'));
    assert.ok(updated.includes('releaseDate: "2026-09-10"'));
    assert.ok(updated.includes('title: "LocalJam v2026.09.050"'));
  });

  await t.test("syncServiceWorker updates CACHE_NAME accurately", () => {
    const swOriginal = `/**
 * Service Worker
 */
const CACHE_NAME = 'localjam-v1';
const APP_SHELL_ASSETS = ['./', './index.html'];
`;

    const updated = syncServiceWorker(swOriginal, { tagName: "v2026.09.041" });
    assert.ok(
      updated.includes("const CACHE_NAME = 'localjam-v2026.09.041';"),
      "CACHE_NAME must include the new release tag"
    );
    assert.ok(
      updated.includes("const APP_SHELL_ASSETS = ['./', './index.html'];"),
      "App shell assets must remain untouched"
    );
  });

  await t.test("buildVersionJson creates valid structured metadata object", () => {
    const commits = [
      { hash: "abcdef1", message: "feat: new feature" },
      { hash: "abcdef2", message: "fix: bug fix" }
    ];
    const payload = buildVersionJson({
      tagName: "v2026.09.042",
      releaseDate: "2026-09-09",
      commits,
      notes: ["Highlight 1", "Highlight 2"]
    });

    assert.equal(payload.version, "v2026.09.042");
    assert.equal(payload.releaseDate, "2026-09-09");
    assert.equal(payload.title, "LocalJam v2026.09.042");
    assert.deepEqual(payload.commits, commits);
    assert.deepEqual(payload.notes, ["Highlight 1", "Highlight 2"]);
  });

  await t.test("getRecentCommits returns non-empty commits list with fallback support", () => {
    const commits = getRecentCommits(5, process.cwd(), "fallback123");
    assert.ok(Array.isArray(commits), "Must return array");
    assert.ok(commits.length > 0, "Must contain at least 1 commit");
    assert.ok(typeof commits[0].hash === "string" && commits[0].hash.length > 0, "Hash must be non-empty string");
    assert.ok(typeof commits[0].message === "string" && commits[0].message.length > 0, "Message must be non-empty string");
  });

  await t.test("syncAllVersionFiles writes version.json and updates src/version.js and sw.js on disk", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "localjam-version-test-"));
    try {
      const srcDir = path.join(tempDir, "src");
      fs.mkdirSync(srcDir, { recursive: true });

      const fakeVersionJs = `export const APP_VERSION = "2026-09-04-001";
export const CURRENT_RELEASE = {
  version: "2026-09-04-001",
  releaseDate: "2026-09-04",
  title: "LocalJam 2026-09-04-001"
};`;
      const fakeSw = `const CACHE_NAME = 'localjam-v1';
const ASSETS = [];`;

      fs.writeFileSync(path.join(srcDir, "version.js"), fakeVersionJs, "utf8");
      fs.writeFileSync(path.join(tempDir, "sw.js"), fakeSw, "utf8");

      const result = syncAllVersionFiles({
        rootDir: tempDir,
        tagName: "v2026.09.099",
        releaseDate: "2026-09-30",
        shortSha: "testsha"
      });

      assert.equal(result.payload.version, "v2026.09.099");
      assert.equal(result.payload.releaseDate, "2026-09-30");

      // Verify version.json on disk
      const writtenJson = JSON.parse(fs.readFileSync(result.versionJsonPath, "utf8"));
      assert.equal(writtenJson.version, "v2026.09.099");
      assert.equal(writtenJson.releaseDate, "2026-09-30");
      assert.equal(writtenJson.title, "LocalJam v2026.09.099");
      assert.deepEqual(writtenJson.notes, DEFAULT_RELEASE_NOTES);

      // Verify src/version.js on disk
      const writtenJs = fs.readFileSync(result.versionJsPath, "utf8");
      assert.ok(writtenJs.includes('export const APP_VERSION = "v2026.09.099";'));
      assert.ok(writtenJs.includes('version: "v2026.09.099"'));
      assert.ok(writtenJs.includes('releaseDate: "2026-09-30"'));
      assert.ok(writtenJs.includes('title: "LocalJam v2026.09.099"'));

      // Verify sw.js on disk
      const writtenSw = fs.readFileSync(result.swPath, "utf8");
      assert.ok(writtenSw.includes("const CACHE_NAME = 'localjam-v2026.09.099';"));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
