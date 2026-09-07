/**
 * LocalJam - Deployment Version Metadata & Asset Synchronizer
 * 
 * Synchronizes version.json, src/version.js, and sw.js with the deployment release tag.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

export const DEFAULT_RELEASE_NOTES = [
  "Fixed SomaFM (Illinois Street Lounge, Secret Agent, Lush, Space Station, Deep Space One, Suburbs of Goa) and BBC Radio 6 stream endpoints.",
  "Categorized radio stations into 10 high-level genre sections with clean navigation and search filtering.",
  "Added fullscreen display mode with keyboard shortcut (F) and canvas double-click to Audio Visualizer.",
  "Streamlined application footer and refined user interface copy across all views.",
  "Continuous automated release detection and one-click refresh notification."
];

/**
 * Retrieves recent git commit history for release notes.
 * @param {number} [count=15]
 * @param {string} [cwd=process.cwd()]
 * @param {string} [fallbackSha=""]
 * @returns {Array<{ hash: string, message: string }>}
 */
export function getRecentCommits(count = 15, cwd = process.cwd(), fallbackSha = "") {
  try {
    const raw = execSync(`git log -n ${count} --pretty=format:%h%x09%s`, {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8"
    }).trim();

    const lines = raw.split("\n").filter(Boolean);
    if (lines.length === 0) {
      return [{ hash: fallbackSha || "main", message: "Deployment update" }];
    }

    return lines.map((line) => {
      const [hash, ...rest] = line.split("\t");
      return {
        hash: (hash || "").trim(),
        message: rest.join("\t").trim()
      };
    });
  } catch (_err) {
    return [{ hash: fallbackSha || "main", message: "Deployment update" }];
  }
}

/**
 * Updates src/version.js content with target version and release date.
 * @param {string} sourceCode
 * @param {{ tagName: string, releaseDate: string }} options
 * @returns {string}
 */
export function syncVersionJs(sourceCode, { tagName, releaseDate }) {
  if (typeof sourceCode !== "string") return sourceCode;

  let result = sourceCode;
  result = result.replace(
    /export const APP_VERSION\s*=\s*["'][^"']+["'];/,
    `export const APP_VERSION = "${tagName}";`
  );
  result = result.replace(
    /(version:\s*)["'][^"']+["']/,
    `$1"${tagName}"`
  );
  result = result.replace(
    /(releaseDate:\s*)["'][^"']+["']/,
    `$1"${releaseDate}"`
  );
  result = result.replace(
    /(title:\s*)["'][^"']+["']/,
    `$1"LocalJam ${tagName}"`
  );
  return result;
}

/**
 * Updates sw.js CACHE_NAME with target version.
 * @param {string} sourceCode
 * @param {{ tagName: string }} options
 * @returns {string}
 */
export function syncServiceWorker(sourceCode, { tagName }) {
  if (typeof sourceCode !== "string") return sourceCode;

  return sourceCode.replace(
    /(const CACHE_NAME\s*=\s*)['"][^'"]+[''];/,
    `$1'localjam-${tagName}';`
  );
}

/**
 * Builds metadata object for version.json.
 * @param {{ tagName: string, releaseDate: string, commits: Array<{ hash: string, message: string }>, notes?: string[] }} options
 * @returns {object}
 */
export function buildVersionJson({ tagName, releaseDate, commits, notes = DEFAULT_RELEASE_NOTES }) {
  return {
    version: tagName,
    releaseDate: releaseDate,
    title: `LocalJam ${tagName}`,
    commits: commits,
    notes: notes
  };
}

/**
 * Synchronizes version.json, src/version.js, and sw.js files on disk.
 * @param {object} [options={}]
 * @param {string} [options.rootDir=process.cwd()]
 * @param {string} [options.tagName]
 * @param {string} [options.releaseDate]
 * @param {string} [options.shortSha]
 * @param {string[]} [options.notes]
 * @returns {{ versionJsonPath: string, versionJsPath: string, swPath: string, payload: object }}
 */
export function syncAllVersionFiles(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const defaultTag = `v${yyyy}.${mm}.001`;
  const defaultDate = now.toISOString().slice(0, 10);

  const tagName = options.tagName || process.env.TAG_NAME || defaultTag;
  const releaseDate = options.releaseDate || process.env.RELEASE_DATE || defaultDate;
  const shortSha = options.shortSha || process.env.SHORT_SHA || "";
  const notes = options.notes || DEFAULT_RELEASE_NOTES;

  const commits = getRecentCommits(15, rootDir, shortSha);
  const payload = buildVersionJson({ tagName, releaseDate, commits, notes });

  const versionJsonPath = path.join(rootDir, "version.json");
  const versionJsPath = path.join(rootDir, "src", "version.js");
  const swPath = path.join(rootDir, "sw.js");

  fs.writeFileSync(versionJsonPath, JSON.stringify(payload, null, 2) + "\n", "utf8");

  if (fs.existsSync(versionJsPath)) {
    const original = fs.readFileSync(versionJsPath, "utf8");
    const updated = syncVersionJs(original, { tagName, releaseDate });
    fs.writeFileSync(versionJsPath, updated, "utf8");
  }

  if (fs.existsSync(swPath)) {
    const original = fs.readFileSync(swPath, "utf8");
    const updated = syncServiceWorker(original, { tagName });
    fs.writeFileSync(swPath, updated, "utf8");
  }

  return {
    versionJsonPath,
    versionJsPath,
    swPath,
    payload
  };
}

// CLI entry point
const isDirectExecution = process.argv[1] && (
  process.argv[1].endsWith("generate-version.js") ||
  process.argv[1].endsWith("scripts/generate-version.js")
);

if (isDirectExecution) {
  try {
    const result = syncAllVersionFiles();
    console.log(`[PASS] Synchronized version metadata for ${result.payload.version} (${result.payload.releaseDate})`);
  } catch (err) {
    console.error(`[FAIL] Failed to synchronize version metadata:`, err);
    process.exit(1);
  }
}
