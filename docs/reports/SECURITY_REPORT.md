# LocalJam Security Audit & Vulnerability Assessment Report

**Target Repository:** LocalJam (`aawc/LocalJam`)  
**Deployment Target:** GitHub Pages (`https://varun.khaneja.org/LocalJam/`) & Local Development Server (`server.js`)  
**Audit Date:** 2026-09-05  
**Auditor / Maintainer:** Varun Khaneja <git.bin@khaneja.org> (LocalJam Security Engineering)  
**Classification:** Open Source Security Review  

---

## 1. Executive Summary

A comprehensive security audit of the LocalJam codebase and hosted GitHub Pages environment was conducted. The audit analyzed server-side static file delivery, HTTP security headers, client-side DOM rendering, binary metadata parsers (ID3v2, FLAC, M4A), Web Audio graph integration, Service Worker caching, and CI/CD automation pipelines.

A total of **11 security findings** were identified across four severity tiers:
- **[CRITICAL]** (1 finding): Path Traversal Vulnerability in Local Development Server (`server.js`).
- **[HIGH]** (3 findings): Missing Content Security Policy on hosted GitHub Pages site (`index.html`), DOM-based JavaScript execution via unvalidated station URLs (`station-modal.js`), and inline event handler script injection via template literals (`radio-view.js`).
- **[MEDIUM]** (5 findings): Incomplete HTML entity escaping (`escapeHtml` lacking single-quote and backtick escaping), inline `onclick` event handlers violating strict CSP, unescaped error strings in Router exception views, unvalidated image MIME types in binary audio parsers (`bytesToDataUrl`), and unvalidated custom radio station inputs.
- **[LOW / INFO]** (2 findings): Missing HTTP defense-in-depth headers in `server.js` and internal error string leakage in HTTP 500 responses.

Remediation plans and concrete implementations have been formulated for all identified issues.

---

## 2. Severity Classification Matrix

| Severity | Count | Impact Summary | Status |
| :--- | :---: | :--- | :---: |
| `[CRITICAL]` | 1 | Arbitrary filesystem read outside web root via path traversal in `server.js` | `[RESOLVED]` |
| `[HIGH]` | 3 | Missing CSP on GitHub Pages, DOM XSS via `javascript:` links, inline script injection | `[RESOLVED]` |
| `[MEDIUM]` | 5 | Incomplete escaping, inline event handlers, router XSS sink, unvalidated MIME types/custom stations | `[RESOLVED]` |
| `[LOW]` | 1 | Missing defense-in-depth HTTP headers (`nosniff`, `SAMEORIGIN`, `Permissions-Policy`, `COOP`) | `[RESOLVED]` |
| `[INFO]` | 1 | Error message disclosure in HTTP 500 response bodies | `[RESOLVED]` |

---

## 3. Detailed Vulnerability Inventory & Technical Analysis

### 3.1. [CRITICAL] SEC-01: Path Traversal Vulnerability in `server.js`
- **Component:** `server.js` (lines 79–82)
- **Vulnerability Type:** CWE-22: Improper Limitation of a Pathname to a Restricted Directory ('Path Traversal')
- **Description:**  
  The path normalization logic in `server.js` attempts to sanitize directory traversal sequences using:
  ```javascript
  const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  filePath = path.join(rootDirectory, safePath);
  ```
  When a request with a leading slash followed by traversal tokens is received (e.g. `/foo/../../etc/passwd` or `/../../package.json`), `path.normalize` returns `'/../etc/passwd'`. The regular expression `/^(\.\.[\/\\])+/` checks for leading `..` but fails to match because the string begins with `/`. Consequently, `path.join(rootDirectory, '/../etc/passwd')` resolves to a path outside `rootDirectory` (e.g., parent directories or `/etc/passwd`). Furthermore, the server does not verify that the canonical resolved path (`path.resolve(filePath)`) is within `rootDirectory`.
- **Proof of Concept / Exploit Vector:**
  ```http
  GET /dir/../../package.json HTTP/1.1
  Host: localhost:3000
  ```
  Resolves to `path.join(rootDirectory, '/../package.json')` which reads files from the parent directory of the repository root.
- **Remediation Specification:**
  1. Strip leading slashes and decode URI safely.
  2. Compute canonical absolute paths using `path.resolve(rootDirectory, '.' + path.sep + safePath)`.
  3. Verify that `resolvedPath === canonicalRoot || resolvedPath.startsWith(canonicalRoot + path.sep)`.
  4. Return `403 Forbidden` or `404 Not Found` immediately if the path escapes the root directory.

---

### 3.2. [HIGH] SEC-02: Missing Content Security Policy (CSP) Meta Tag in `index.html` (Hosted GitHub Pages)
- **Component:** `index.html` (`<head>`)
- **Vulnerability Type:** CWE-1021 / CWE-79: Improper Restriction of Rendered UI / XSS Mitigation
- **Description:**  
  GitHub Pages serves static files directly from GitHub's CDN without supporting custom HTTP response headers. Without a `<meta http-equiv="Content-Security-Policy">` tag in `index.html`, the live hosted web application runs without CSP protection, leaving clients susceptible to XSS, unauthorized external resource loading, and data exfiltration if any DOM injection occurs.
- **Remediation Specification:**
  Add a strict `<meta http-equiv="Content-Security-Policy">` tag to `index.html`:
  ```html
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; media-src 'self' data: https: http: blob:; connect-src 'self' https: http:; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';" />
  ```

---

### 3.3. [HIGH] SEC-03: DOM-based JavaScript Injection via Unvalidated Station Homepage Links
- **Component:** `src/ui/components/station-modal.js` (line 158)
- **Vulnerability Type:** CWE-79: Cross-Site Scripting (DOM-based XSS via `javascript:` URI)
- **Description:**  
  When opening the Station Details modal, the `homepageUrl` property is assigned directly to the `href` attribute of an anchor tag:
  ```javascript
  if (station.homepageUrl) {
    homepageLink.href = station.homepageUrl;
    homepageLink.style.display = 'inline-flex';
  }
  ```
  If a custom station record or imported station payload contains `homepageUrl: "javascript:alert(document.domain)"` or a malicious protocol, clicking the "Website" link executes arbitrary JavaScript within the application's origin context.
- **Remediation Specification:**
  Implement a strict URL sanitizer function `sanitizeUrl(url)` that validates URLs against an explicit allowlist of safe protocols (`http:`, `https:`). If the protocol is unsupported (e.g. `javascript:`, `data:`, `vbscript:`), reject or default to `#` and suppress link rendering.

---

### 3.4. [HIGH] SEC-04: Inline Event Handler Script Injection via Template Literals
- **Component:** `src/ui/views/radio-view.js` (line 81)
- **Vulnerability Type:** CWE-79: Cross-Site Scripting (Improper Output Handling in Inline Attributes)
- **Description:**  
  In `radio-view.js`, station artwork is rendered using an inline `onerror` attribute with string-interpolated variables:
  ```html
  <img src="${artworkSrc}" alt="${escapeHtml(station.name)}" class="media-card-art" onerror="this.onerror=null; this.src='${fallbackArt}';" />
  ```
  1. `fallbackArt` is an SVG data URI that contains single quotes, which can break out of `'${fallbackArt}'`.
  2. `artworkSrc` was not passed through `escapeHtml(...)`.
  3. Inline `onerror` handlers violate strict Content Security Policies.
- **Remediation Specification:**
  Remove inline `onerror` attributes entirely. Use DOM element event binding (`img.addEventListener('error', ...)`) or standard HTML template escaping with safe SVG fallback rendering.

---

### 3.5. [MEDIUM] SEC-05: Incomplete HTML Entity Escaping Utility
- **Component:** All UI views and components (`home-view.js`, `songs-view.js`, `albums-view.js`, `artists-view.js`, `playlists-view.js`, `favorites-view.js`, `history-view.js`, `radio-view.js`, `settings-view.js`, `app-footer.js`, `queue-drawer.js`)
- **Vulnerability Type:** CWE-116: Improper Encoding or Escaping of Output
- **Description:**  
  The localized `escapeHtml` function implemented across various files only replaced `&`, `<`, `>`, and `"`:
  ```javascript
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  ```
  Single quotes (`'`) and backticks (`` ` ``) were not escaped. When user-controlled metadata (e.g., track title, artist, playlist name) is placed inside single-quoted HTML attributes or template literals, attribute breakout or delimiter injection can occur.
- **Remediation Specification:**
  Create a centralized `src/utils/sanitize.js` module exporting a comprehensive `escapeHtml(str)` that escapes `&`, `<`, `>`, `"`, `'` (`&#39;`), and `` ` `` (`&#96;`). Replace all duplicate localized implementations with the centralized utility.

---

### 3.6. [MEDIUM] SEC-06: Inline `onclick` Event Handlers Violating Strict CSP
- **Component:** `src/ui/views/home-view.js` (lines 64, 68, 72, 76) & `src/ui/views/playlists-view.js` (line 130)
- **Vulnerability Type:** CWE-1021: Inline Event Handler Usage
- **Description:**  
  Stat cards and back buttons used inline HTML event attributes such as `onclick="window.location.hash='#/songs'"`. Under standard strict CSP (`script-src 'self'`), inline event handlers are blocked by the browser, causing silent UI failure.
- **Remediation Specification:**
  Replace inline `onclick` attributes with standard semantic anchor tags (`<a href="#/songs">`) or add programmatic event listeners during DOM view mounting.

---

### 3.7. [MEDIUM] SEC-07: Unescaped Exception Message in Router Error View
- **Component:** `src/ui/router.js` (line 79)
- **Vulnerability Type:** CWE-79: Cross-Site Scripting (Unescaped Exception Rendering)
- **Description:**  
  When a route rendering function throws an error, the error message was interpolated directly into `this.contentContainer.innerHTML`:
  ```javascript
  this.contentContainer.innerHTML = `
    <div style="padding: 40px; text-align: center;">
      <h2>Unable to load page</h2>
      <p style="color: var(--text-secondary); margin-top: 8px;">${err?.message}</p>
    </div>
  `;
  ```
  If an error message contains unescaped HTML characters or attacker-controlled parameters from the URL hash, it creates an XSS injection sink.
- **Remediation Specification:**
  Pass `err?.message` through `escapeHtml(...)` or create DOM nodes using `textContent`.

---

### 3.8. [MEDIUM] SEC-08: Unvalidated Picture MIME Types in Audio Metadata Parsers
- **Component:** `src/metadata/id3v2.js` (line 72), `src/metadata/flac.js` (line 198), `src/metadata/m4a.js` (line 168)
- **Vulnerability Type:** CWE-434: Unrestricted Upload of File with Dangerous Type / MIME Confusion
- **Description:**  
  In `bytesToDataUrl(bytes, mimeType)`, the `mimeType` extracted from untrusted audio file headers (e.g. ID3v2 APIC frame or FLAC PICTURE block) was interpolated directly into `data:${mimeType};base64,...` without validation. A crafted audio file with a malicious MIME type string (such as `text/html`, `image/svg+xml;utf8,<script>`, or embedded quotes) could cause MIME confusion or script execution if rendered in permissive contexts.
- **Remediation Specification:**
  Implement `sanitizeMimeType(mimeType)` that enforces an allowlist of safe raster image MIME types (`image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/avif`) and defaults to `image/jpeg` for any invalid or unrecognized MIME type.

---

### 3.9. [MEDIUM] SEC-09: Unvalidated Custom Radio Station Inputs
- **Component:** `src/radio/stations.js` (`addCustomStation`) & `src/ui/views/radio-view.js`
- **Vulnerability Type:** CWE-20: Improper Input Validation
- **Description:**  
  `addCustomStation` only checked `station.streamUrl.startsWith('https://')` without verifying complete URL validity via the `URL` constructor. Additional fields (`name`, `description`, `genre`, `country`, `bitrate`, `favicon`, `homepageUrl`) were not validated for types, lengths, or protocol constraints before saving to IndexedDB.
- **Remediation Specification:**
  Enforce strict schema validation on all fields: parse URLs with `new URL()`, require `https:` or `http:` protocols, trim strings, enforce reasonable maximum lengths, and reject malformed payloads.

---

### 3.10. [LOW] SEC-10: Missing Defense-in-Depth HTTP Headers in `server.js`
- **Component:** `server.js`
- **Vulnerability Type:** CWE-16: Configuration / Missing Security Headers
- **Description:**  
  The development server lacked standard defensive HTTP security headers:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()`
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Resource-Policy: same-origin`
  - `Content-Security-Policy`
- **Remediation Specification:**
  Set these defense-in-depth headers on all HTTP responses in `server.js`.

---

### 3.11. [INFO] SEC-11: Detailed Internal Error Message Disclosure in 500 Responses
- **Component:** `server.js` (lines 165, 190, 199)
- **Vulnerability Type:** CWE-209: Generation of Error Message Containing Sensitive Information
- **Description:**  
  In `server.js`, stream errors and uncaught exceptions returned `res.end('Internal Server Error: ' + err.message)`. Error messages can reveal local file paths, stack traces, and environment details.
- **Remediation Specification:**
  Log detailed error traces to the server console while responding to HTTP clients with generic `500 Internal Server Error` strings.

---

## 4. Verification & Testing Strategy

A dedicated automated test suite `test/security.test.js` will verify all security fixes:
1. **Path Traversal Tests:** Attempt requests with traversal sequences (`/../package.json`, `/%2e%2e/package.json`, `/foo/../../etc/passwd`, `/....//....//etc/passwd`) and assert HTTP 403 / 404 responses.
2. **HTTP Security Headers Tests:** Verify presence and values of `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, and `Content-Security-Policy`.
3. **CSP Meta Tag Test:** Verify `<meta http-equiv="Content-Security-Policy">` exists and is well-formed in `index.html`.
4. **HTML Entity Escaping Tests:** Verify `escapeHtml` escapes `&`, `<`, `>`, `"`, `'`, and `` ` `` with concrete assertions.
5. **URL Sanitization Tests:** Verify `sanitizeUrl` permits valid `http:` and `https:` URLs while rejecting `javascript:`, `data:`, `vbscript:`, and malformed protocols.
6. **MIME Type Sanitizer Tests:** Verify `sanitizeMimeType` allowlists `image/jpeg`, `image/png`, `image/webp` and rejects dangerous types.
7. **Custom Station Validation Tests:** Verify `addCustomStation` rejects invalid payloads, unparsable URLs, and non-HTTPS stream URLs.

---

## 5. Remediation Roadmap & Execution Plan
 
- `[x]` **Task 1:** Complete Security Audit and Commit `SECURITY_REPORT.md`.
- `[x]` **Task 2:** Create Centralized Sanitization Library (`src/utils/sanitize.js`).
- `[x]` **Task 3:** Fix Server Vulnerabilities & Add HTTP Security Headers in `server.js`.
- `[x]` **Task 4:** Add Content-Security-Policy `<meta>` Tag in `index.html`.
- `[x]` **Task 5:** Fix DOM XSS and Escaping in UI Components & Views (`station-modal.js`, `radio-view.js`, `home-view.js`, `playlists-view.js`, `router.js`, etc.).
- `[x]` **Task 6:** Fix MIME Type Validation & Audio Parser Bounds in `id3v2.js`, `flac.js`, `m4a.js`, and `stations.js`.
- `[x]` **Task 7:** Add Comprehensive Automated Security Test Suite (`test/security.test.js`) and Verify 100% Pass.
- `[x]` **Task 8:** Perform Subagent Code Review, Create Atomic Commits, and Push to Remote.
