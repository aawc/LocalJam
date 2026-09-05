/**
 * LocalJam - Application Version & Release Management
 * Standard format: YYYY-MM-DD-NNN (e.g. 2026-09-04-001)
 */

export const APP_VERSION = "2026-09-04-001";

export const CURRENT_RELEASE = {
  version: "2026-09-04-001",
  releaseDate: "2026-09-04",
  title: "LocalJam 2026-09-04-001",
  commits: [
    {
      hash: "0f064f7",
      message: "fix(player): route radio to web audio graph and eliminate blob cors zeroing"
    },
    {
      hash: "a30d644",
      message: "fix: preserve user gesture activation for radio stream playback"
    },
    {
      hash: "651972a",
      message: "fix: couple audio visualizer strictly to active audio playback"
    },
    {
      hash: "4586919",
      message: "fix(player): resolve visualizer canvas sizing, radio starring, and history timestamp tracking"
    },
    {
      hash: "5da1530",
      message: "fix(storage): implement db.init alias and complete IndexedDB store interface"
    }
  ],
  notes: [
    "Resolved radio playback gesture issue by routing streams into Web Audio and introducing one-time gesture unlock.",
    "Eliminated CORS sample zeroing on local blob audio and coupled visualizer strictly to real Web Audio FFT data.",
    "Added persistent application footer displaying active release ID and release notes with commit details.",
    "Integrated automated release detection with user-friendly refresh prompts for Web and PWA."
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
