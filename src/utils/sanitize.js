/**
 * LocalJam - Security Sanitization & Validation Utilities
 * Zero-dependency robust sanitizers for HTML, URLs, MIME types, and text strings.
 */

const SAFE_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/x-icon'
]);

/**
 * Escapes all HTML entity characters (&, <, >, ", ', `) to prevent HTML and attribute injection.
 * @param {any} str - Input value
 * @returns {string} Fully escaped string
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

/**
 * Validates and sanitizes a URL string, permitting only safe HTTP and HTTPS protocols.
 * Blocks javascript:, data:, vbscript:, and relative/protocol-relative exploit vectors.
 * @param {string} url - Candidate URL string
 * @param {string} [fallback='#'] - Fallback value if URL is invalid or dangerous
 * @returns {string} Sanitized URL or fallback
 */
export function sanitizeUrl(url, fallback = '#') {
  if (!url || typeof url !== 'string') return fallback;
  const trimmed = url.trim();
  if (!trimmed) return fallback;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
    return fallback;
  } catch {
    // Relative URLs or malformed URLs (disallow protocol-relative //)
    if (trimmed.startsWith('./') || (trimmed.startsWith('/') && !trimmed.startsWith('//')) || trimmed.startsWith('#')) {
      return trimmed;
    }
    return fallback;
  }
}

/**
 * Checks whether a given string is a valid absolute HTTP or HTTPS URL.
 * @param {string} url
 * @returns {boolean}
 */
export function isValidHttpUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Sanitizes image MIME types against a strict raster image allowlist.
 * Prevents MIME confusion, executable SVG injections, and HTML type spoofing.
 * @param {string} mimeType
 * @param {string} [defaultType='image/jpeg']
 * @returns {string} Allowlisted MIME type
 */
export function sanitizeMimeType(mimeType, defaultType = 'image/jpeg') {
  if (!mimeType || typeof mimeType !== 'string') return defaultType;
  const clean = mimeType.trim().toLowerCase().split(';')[0];
  if (SAFE_IMAGE_MIME_TYPES.has(clean)) {
    return clean;
  }
  return defaultType;
}

/**
 * Truncates and sanitizes user input text strings.
 * @param {string} str - Raw string
 * @param {number} [maxLength=256] - Maximum allowed length
 * @returns {string} Trimmed and bounded string
 */
export function sanitizeText(str, maxLength = 256) {
  if (!str) return '';
  const trimmed = String(str).trim();
  if (trimmed.length > maxLength) {
    return trimmed.slice(0, maxLength);
  }
  return trimmed;
}
