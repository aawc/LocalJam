import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../");

test("GitHub Actions Release Workflow Suite (.github/workflows/release.yml)", async (t) => {
  const workflowPath = path.join(ROOT_DIR, ".github/workflows/release.yml");

  await t.test("Release workflow file exists on disk", () => {
    assert.ok(fs.existsSync(workflowPath), ".github/workflows/release.yml must exist");
  });

  const content = fs.readFileSync(workflowPath, "utf8");

  await t.test("Workflow requires write permissions for contents to push tags and releases", () => {
    assert.ok(
      content.includes("contents: write"),
      "Workflow must declare 'contents: write' permission"
    );
  });

  await t.test("Workflow ignores tag pushes to prevent recursive trigger loops", () => {
    assert.ok(
      content.includes("tags-ignore:"),
      "Workflow push trigger must include tags-ignore"
    );
  });

  await t.test("Workflow dynamically generates timestamped semantic tag v$yyyy.$mm.$nnn", () => {
    assert.ok(
      content.includes("date -u +%Y") || content.includes("date +%Y"),
      "Must use bash date command to extract year"
    );
    assert.ok(
      content.includes("date -u +%m") || content.includes("date +%m"),
      "Must use bash date command to extract month"
    );
    assert.ok(
      content.includes('printf "%03d"') && content.includes("github.run_number"),
      "Must zero-pad github.run_number to 3 digits"
    );
    assert.ok(
      content.includes('TAG_NAME="v${YYYY}.${MM}.${NNN}"') ||
        content.includes('TAG_NAME="v${yyyy}.${mm}.${nnn}"'),
      "Tag name must follow v$yyyy.$mm.$nnn pattern"
    );
  });

  await t.test("Workflow tags commit and pushes tag back to repository", () => {
    assert.ok(
      content.includes('git tag "${TAG_NAME}"') ||
        content.includes("git tag $TAG_NAME") ||
        content.includes('git tag "${TAG_NAME}" "${COMMIT_SHA}"'),
      "Workflow must create git tag"
    );
    assert.ok(
      content.includes('git push origin "${TAG_NAME}"') ||
        content.includes("git push origin $TAG_NAME"),
      "Workflow must push tag to origin repository"
    );
  });

  await t.test("Workflow names release title using version/tag and packages zip bundle with tag", () => {
    assert.ok(
      content.includes('RELEASE_TITLE="LocalJam ${TAG_NAME}"') ||
        content.includes('title=${RELEASE_TITLE}') ||
        content.includes('title="LocalJam ${TAG_NAME}"'),
      "Release title must use tag/version instead of commit message subject"
    );
    assert.ok(
      content.includes('LocalJam-${TAG_NAME}.zip') ||
        content.includes('LocalJam-${{ steps.meta.outputs.tag_name }}.zip'),
      "Offline distribution zip must be named with release tag"
    );
    assert.ok(
      content.includes('gh release create "${{ steps.meta.outputs.tag_name }}"'),
      "gh release create must target tag_name output"
    );
  });
});

test("GitHub Actions Pages Deploy Workflow Suite (.github/workflows/deploy.yml)", async (t) => {
  const deployPath = path.join(ROOT_DIR, ".github/workflows/deploy.yml");

  await t.test("Deploy workflow file exists on disk", () => {
    assert.ok(fs.existsSync(deployPath), ".github/workflows/deploy.yml must exist");
  });

  const content = fs.readFileSync(deployPath, "utf8");

  await t.test("Deploy workflow dynamically generates deployment version.json metadata", () => {
    assert.ok(
      content.includes("Generate Deployment Version Metadata"),
      "Workflow must include step to generate deployment version metadata"
    );
    assert.ok(
      content.includes("version.json"),
      "Workflow must write version.json before deploying"
    );
    assert.ok(
      content.includes("TAG_NAME="),
      "Workflow must construct dynamic semantic TAG_NAME"
    );
    assert.ok(
      content.includes("fetch-depth: 0"),
      "Workflow must fetch full git history to build commit log"
    );
    assert.ok(
      content.includes("git log"),
      "Workflow must extract git commits for deployment release notes"
    );
  });
});
