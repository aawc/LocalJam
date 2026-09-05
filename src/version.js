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
    },
    {
      hash: "f8bd490",
      message: "feat(ui): add application footer with active release badge and release notes modal"
    },
    {
      hash: "4535f30",
      message: "feat(release): standardize release naming convention to YYYY-MM-DD-NNN"
    },
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
    }
  ],
  notes: [
    "Added interactive Radio Station Details Modal on active station click with metadata and controls.",
    "Expanded curated live radio directory with 12 high-fidelity English and instrumental streams.",
    "Added automated background release detection with instant refresh prompt for Web and PWA.",
    "Integrated persistent bottom application footer with active release badge and release notes dialog.",
    "Adopted standardized YYYY-MM-DD-NNN release naming scheme.",
    "Resolved radio playback gesture and Web Audio routing; fixed visualizer audio coupling."
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
