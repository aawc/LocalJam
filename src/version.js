/**
 * LocalJam - Application Version & Release Management
 * Standard format: YYYY-MM-DD-NNN (e.g. 2026-09-04-001)
 */

export const APP_VERSION = "2026-09-04-004";

export const CURRENT_RELEASE = {
  version: "2026-09-04-004",
  releaseDate: "2026-09-04",
  title: "LocalJam 2026-09-04-004",
  commits: [
    {
      hash: "6c6aec9",
      message: "refactor(ui): refine user-facing copy across views to professional tone"
    },
    {
      hash: "f2d3b90",
      message: "feat(ui): add fullscreen display mode and keyboard toggle to audio visualizer"
    },
    {
      hash: "2731460",
      message: "feat(radio): categorize radio stations into high-level genre sections and filter pills"
    },
    {
      hash: "5beae4c",
      message: "fix(ui): streamline application footer by removing promotional badge, tagline, and external link"
    },
    {
      hash: "a5096df",
      message: "docs: synchronize task execution checklist with recent atomic commits"
    },
    {
      hash: "2ab1654",
      message: "feat(ui): add radio search filtering, multi-criteria sorting, and starred stations grouping"
    },
    {
      hash: "e09a85b",
      message: "feat(radio): expand curated streams, fix station endpoints, and add SVG fallback artwork"
    },
    {
      hash: "a145b10",
      message: "feat(version): dynamically synchronize runtime release metadata from deployed version.json"
    },
    {
      hash: "7df8d9d",
      message: "fix(ci): format release notes generation as indented block and update checklist"
    },
    {
      hash: "b7e58e6",
      message: "release: bump version to 2026-09-04-002 and update release notes"
    },
    {
      hash: "0fbf4ff",
      message: "ci(release): generate dynamic semantic tag v$yyyy.$mm.$nnn and push tag to repository"
    },
    {
      hash: "1809639",
      message: "docs: synchronize documentation, version metadata, and task checklist"
    },
    {
      hash: "0e42f2e",
      message: "feat(ui): add radio station details modal triggered on active station click"
    },
    {
      hash: "dda7bd2",
      message: "feat(radio): expand curated internet radio streams with English and instrumental stations"
    },
    {
      hash: "47d22ee",
      message: "feat(pwa): add automatic release update detection and refresh prompt"
    }
  ],
  notes: [
    "Fixed SomaFM (Illinois Street Lounge, Secret Agent, Lush, Space Station, Deep Space One, Suburbs of Goa) and BBC Radio 6 stream endpoints.",
    "Categorized radio stations into 10 high-level genre sections with clean navigation and search filtering.",
    "Added fullscreen display mode with keyboard shortcut (F) and canvas double-click to Audio Visualizer.",
    "Streamlined application footer and refined user interface copy across all views.",
    "Continuous automated release detection and one-click refresh notification."
  ]
};

/**
 * Validates if a release version string conforms strictly to the YYYY-MM-DD-NNN pattern.
 * @param {string} version
 * @returns {boolean}
 */
export function isValidReleaseName(version) {
  if (typeof version !== "string") return false;
  return /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])-\d{3}$/.test(version);
}

/**
 * Formats a release name given a date and sequence number.
 * @param {Date} [date=new Date()]
 * @param {number} [sequence=1]
 * @returns {string}
 */
export function formatReleaseName(date = new Date(), sequence = 1) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const seq = String(Math.max(1, Math.min(999, sequence))).padStart(3, "0");
  return `${year}-${month}-${day}-${seq}`;
}

/**
 * Parses a release name into date and sequence number components.
 * @param {string} version
 * @returns {{ date: string, sequence: number } | null}
 */
export function parseReleaseName(version) {
  if (!isValidReleaseName(version)) return null;
  const parts = version.split("-");
  return {
    date: `${parts[0]}-${parts[1]}-${parts[2]}`,
    sequence: parseInt(parts[3], 10)
  };
}

/**
 * Validates if a semantic release tag conforms to vYYYY.MM.NNN pattern.
 * @param {string} tag
 * @returns {boolean}
 */
export function isValidSemanticTag(tag) {
  if (typeof tag !== "string") return false;
  return /^v\d{4}\.(?:0[1-9]|1[0-2])\.\d{3,}$/.test(tag);
}

/**
 * Formats a semantic release tag from a date and run number.
 * @param {Date} [date=new Date()]
 * @param {number} [runNumber=1]
 * @returns {string}
 */
export function formatSemanticTag(date = new Date(), runNumber = 1) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const seq = String(Math.max(1, runNumber)).padStart(3, "0");
  return `v${year}.${month}.${seq}`;
}

/**
 * Parses a semantic release tag into year, month, and sequence number.
 * @param {string} tag
 * @returns {{ year: string, month: string, runNumber: number } | null}
 */
export function parseSemanticTag(tag) {
  if (!isValidSemanticTag(tag)) return null;
  const match = tag.match(/^v(\d{4})\.(\d{2})\.(\d+)$/);
  if (!match) return null;
  return {
    year: match[1],
    month: match[2],
    runNumber: parseInt(match[3], 10)
  };
}

/**
 * Validates if a version string is either a valid release name (YYYY-MM-DD-NNN) or semantic tag (vYYYY.MM.NNN).
 * @param {string} version
 * @returns {boolean}
 */
export function isValidVersion(version) {
  return isValidReleaseName(version) || isValidSemanticTag(version);
}
