# LocalJam - PWA Update Lifecycle & Radio Catalog Investigation Report

**Document Status:** `[COMPLETED]`  
**Date:** 2026-09-07  
**Author:** Varun Khaneja `<git.bin@khaneja.org>`  
**Scope:** Progressive Web App (PWA) Lifecycle, Service Worker Update Detection, Cache Invalidation, IndexedDB Station Sync, Chrome Canary on Android Compatibility.

---

## 1. Executive Summary

This report investigates two critical interrelated issues reported in LocalJam when deployed as a Progressive Web App (PWA) on mobile and desktop environments (specifically verified on Chrome Canary for Android):

1. **Failure of PWA Update Notifications (`[BUG-01]`):** When a new release (e.g. `v2026.09.036`) was deployed to production, an existing client running an older version did not receive any update notification banner, refresh prompt, or automatic update.
2. **Missing Kids & Family and News & Talk Radio Streams (`[BUG-02]`):** The newly added radio catalog expansions (6 Kids & Family streams and 5 News & Talk streams introduced in commit `97dcea4`) were not visible to existing users, who continued to see only the legacy 23 stations.

Our root-cause investigation revealed a cascade of compounding architectural flaws spanning client-side state mutation, Service Worker lifecycle handling, cache management, and UI version reporting.

---

## 2. Root Cause Analysis

### 2.1 Issue 1: Why PWA Update Notifications Failed (`[BUG-01]`)

#### A. Premature Remote Version Mutation Overwriting Local Baseline
In [`src/main.js:L80-L111`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/src/main.js#L80-L111), the application initialization logic executed an asynchronous fetch to `./version.json` to retrieve release metadata:

```javascript
// [ORIGINAL FLAWED LOGIC] src/main.js:L80-L107
let updateCheckerInstance = null;
let activeDeployedVersion = APP_VERSION;

if (typeof fetch === 'function') {
  fetch(`./version.json?_t=${Date.now()}`, { cache: 'no-cache' })
    .then((res) => (res.ok ? res.json() : null))
    .then((verData) => {
      if (verData && verData.version) {
        activeDeployedVersion = verData.version; // [- BUG: Overwrote local baseline with server version! -]
        if (updateCheckerInstance && typeof updateCheckerInstance.setActiveVersion === 'function') {
          updateCheckerInstance.setActiveVersion(verData.version); // [- BUG: Nullified diff against server! -]
        }
      }
    });
}
```

When an existing client running an older cached JavaScript bundle opened the app:
1. `APP_VERSION` in memory was the old compile-time version (e.g., `2026-09-04-004`).
2. The network fetch immediately retrieved the new server version (`v2026.09.036`).
3. `activeDeployedVersion` and `updateCheckerInstance.activeVersion` were immediately overwritten with `"v2026.09.036"`.
4. When `initUpdateChecker` subsequently executed `checkRemoteVersion(activeVersion)` during periodic polling or window focus ([`src/ui/components/update-banner.js:L81-L100`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/src/ui/components/update-banner.js#L81-L100)), it compared `data.version` (`"v2026.09.036"`) against `activeVersion` (`"v2026.09.036"`).
5. The comparison `data.version !== currentVersion` evaluated to `false`.
6. **Result:** The update banner was suppressed indefinitely because the client self-sabotaged its own version comparator.

#### B. Deceptive UI Reporting in Settings and Footer
In [`src/main.js:L95-L102`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/src/main.js#L95-L102) and [`src/ui/views/settings-view.js:L22-L27`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/src/ui/views/settings-view.js#L22-L27), the UI directly displayed `verData.version` as the active application version:

```javascript
// [ORIGINAL FLAWED LOGIC] src/main.js:L95-L98
const settingsAppVer = document.getElementById('settings-app-version');
if (settingsAppVer) {
  settingsAppVer.textContent = verData.version; // [- BUG: UI falsely displayed remote version -]
}
```

This created an illusory state: the Settings view claimed the app was running `v2026.09.036`, but the browser tab was actually executing legacy cached ES modules. The user was misled into believing they were on the new release while executing stale code.

#### C. Service Worker `self.skipWaiting()` Race Condition & Missing `controllerchange` Handler
In [`sw.js:L53-L59`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/sw.js#L53-L59):

```javascript
// [ORIGINAL FLAWED LOGIC] sw.js:L53-L59
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL_ASSETS);
    }).then(() => self.skipWaiting()) // [- BUG: Immediate skipWaiting bypasses waiting state -]
  );
});
```

1. Standard PWA update detection relies on a new Service Worker entering the `waiting` state (`registration.waiting`).
2. Calling `self.skipWaiting()` unconditionally inside the `install` handler caused the new Service Worker to bypass `waiting` and immediately attempt `activate` and `clients.claim()`.
3. In [`src/ui/components/update-banner.js:L130-L141`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/src/ui/components/update-banner.js#L130-L141), `updatefound` was listening for `installing.state === 'installed'`. Because `skipWaiting()` forced instant activation, the state transition was missed.
4. Furthermore, neither `src/main.js` nor `update-banner.js` registered a listener for `navigator.serviceWorker.addEventListener('controllerchange')`. As a result, when the new worker activated, the active window never reloaded or prompted the user.

#### D. Missing Core Module Precaching in Service Worker (`sw.js`)
Inspection of `APP_SHELL_ASSETS` in [`sw.js:L8-L51`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/sw.js#L8-L51) revealed that `./src/utils/sanitize.js` was completely omitted from the precache manifest. Because `stations.js`, `radio-view.js`, `station-modal.js`, and `router.js` all depend directly on `sanitize.js`, any offline load or cache-only environment experienced module resolution failures.

---

### 2.2 Issue 2: Why Kids & Family and News & Talk Stations Were Missing (`[BUG-02]`)

#### A. Stale ES Module Execution
Because of the PWA update failure (`[BUG-01]`), the user's browser ran the old cached `src/radio/stations.js` file from `localjam-v1` cache. The legacy file only defined 23 curated stations and lacked the definitions for the 6 Kids & Family stations and 5 News & Talk stations.

#### B. Incomplete Station Metadata Synchronization in `loadStations`
In [`src/radio/stations.js:L779-L799`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/src/radio/stations.js#L779-L799), `loadStations(db)` inspected existing IndexedDB records:

```javascript
// [ORIGINAL LOGIC] src/radio/stations.js:L784-L790
if (
  station.streamUrl !== curated.streamUrl ||
  station.name !== curated.name ||
  station.genre !== curated.genre ||
  station.favicon !== curated.favicon ||
  station.bitrate !== curated.bitrate
) { ... }
```

The check omitted `description`, `country`, and `homepageUrl`. When curated station metadata evolved, these fields remained out of sync in client IndexedDB storage.

---

## 3. Remediation Architecture & Implementation Strategy

### 3.1 PWA Service Worker Lifecycle Alignment

```
[Server Deployed]  --->  Browser fetches sw.js (byte-diff detected)
                                 |
                                 v
                          sw.js: install event
                     (Precache APP_SHELL_ASSETS including sanitize.js)
                     (NO automatic skipWaiting - stays in WAITING state)
                                 |
                                 v
                       registration.waiting
                                 |
                                 v
              Client UI detects waiting worker / remote version diff
                                 |
                                 v
                  [UPDATE AVAILABLE] Banner Displayed
                 "A new version of LocalJam (v...) is ready."
                                 |
                      +----------+----------+
                      |                     |
             [User clicks "Later"]   [User clicks "Refresh Now"]
                      |                     |
               (Banner closes)       (postMessage { type: 'SKIP_WAITING' })
                                            |
                                            v
                                     sw.js: skipWaiting()
                                            |
                                            v
                                     sw.js: activate event
                                     (Purges legacy caches, clients.claim())
                                            |
                                            v
                              navigator.serviceWorker 'controllerchange'
                                            |
                                            v
                                     window.location.reload()
                                            |
                                            v
                              [New App Bundle Executing]
```

### 3.2 Key Technical Modifications

| Component | Target File | Description of Modification | Status |
| :--- | :--- | :--- | :--- |
| **Service Worker Precaching** | [`sw.js:L8-L51`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/sw.js#L8-L51) | Add `./src/utils/sanitize.js` to `APP_SHELL_ASSETS`. | `[PASS]` |
| **Service Worker Lifecycle** | [`sw.js:L53-L77`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/sw.js#L53-L77) | Remove `self.skipWaiting()` from `install` handler; rely strictly on `message` event `{ type: 'SKIP_WAITING' }`. | `[PASS]` |
| **App Bootstrapper** | [`src/main.js:L80-L200`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/src/main.js#L80-L200) | Preserve `APP_VERSION` as authoritative running version; remove premature `activeDeployedVersion` mutation; add `controllerchange` reload listener; call `registration.update()` on load. | `[PASS]` |
| **Update Detection & Banner** | [`src/ui/components/update-banner.js:L39-L198`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/src/ui/components/update-banner.js#L39-L198) | Enhance update polling to check against `APP_VERSION`; handle `registration.waiting` and `installing` state transitions cleanly; post `SKIP_WAITING` on "Refresh Now". | `[PASS]` |
| **Settings & Footer Display** | [`src/ui/views/settings-view.js:L22-L51`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/src/ui/views/settings-view.js#L22-L51) | Display `APP_VERSION` as true running version; show `[UPDATE AVAILABLE]` indicator with action trigger when remote release is newer. | `[PASS]` |
| **Radio Station Sync** | [`src/radio/stations.js:L767-L822`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/src/radio/stations.js#L767-L822) | Comprehensive sync of all 34 curated stations (all fields) while preserving user custom streams and starred status. | `[PASS]` |

---

## 4. Before / After Comparison Blocks

### Comparison 1: `sw.js` Install Event & Asset Manifest
```diff
--- a/sw.js:L45-L59
+++ b/sw.js:L45-L59
@@ -45,15 +45,15 @@
   './src/storage/session-registry.js',
   './src/metadata/index.js',
   './src/metadata/id3v2.js',
   './src/metadata/flac.js',
   './src/metadata/m4a.js',
-  './src/metadata/filename-parser.js'
+  './src/metadata/filename-parser.js',
+  './src/utils/sanitize.js'
 ];
 
 self.addEventListener('install', (event) => {
   event.waitUntil(
     caches.open(CACHE_NAME).then((cache) => {
       return cache.addAll(APP_SHELL_ASSETS);
-    }).then(() => self.skipWaiting())
+    })
   );
 });
```

### Comparison 2: `src/main.js` Update Initialization & Controller Handling
```diff
--- a/src/main.js:L80-L111
+++ b/src/main.js:L80-L111
@@ -80,29 +80,32 @@
-    let activeDeployedVersion = APP_VERSION;
-
-    // Dynamically fetch deployed version.json to synchronize runtime release display
-    if (typeof fetch === 'function') {
-      fetch(`./version.json?_t=${Date.now()}`, { cache: 'no-cache' })
-        .then((res) => (res.ok ? res.json() : null))
-        .then((verData) => {
-          if (verData && verData.version) {
-            activeDeployedVersion = verData.version;
-            if (typeof window !== 'undefined') {
-              window.localjamActiveVersionData = verData;
-            }
-            if (typeof releaseNotesModal.updateVersion === 'function') {
-              releaseNotesModal.updateVersion(verData);
-            }
-            const settingsAppVer = document.getElementById('settings-app-version');
-            if (settingsAppVer) {
-              settingsAppVer.textContent = verData.version;
-            }
-            const settingsReleaseDate = document.getElementById('settings-release-date');
-            if (settingsReleaseDate && verData.releaseDate) {
-              settingsReleaseDate.textContent = verData.releaseDate;
-            }
-            if (updateCheckerInstance && typeof updateCheckerInstance.setActiveVersion === 'function') {
-              updateCheckerInstance.setActiveVersion(verData.version);
-            }
-          }
-        })
+    // Authoritative runtime version remains compile-time APP_VERSION
+    const runningVersion = APP_VERSION;
+    const updateBanner = createUpdateBanner();
+    document.body.appendChild(updateBanner.element);
+
+    // Listen for Service Worker controller changes to auto-reload when new worker takes over
+    let refreshing = false;
+    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
+      navigator.serviceWorker.addEventListener('controllerchange', () => {
+        if (refreshing) return;
+        refreshing = true;
+        if (typeof window !== 'undefined' && window.location) {
+          window.location.reload();
+        }
+      });
+    }
```

---

## 5. Verification & Test Plan

1. **Unit & Integration Tests (`node --test`):**
   - Verify `sw.js` asset declarations and precache integrity (`test/pwa/pwa-assets.test.js`).
   - Verify update detection when remote version differs from running `APP_VERSION` (`test/ui/update-banner.test.js`).
   - Verify Service Worker `waiting` and `updatefound` notification triggering (`test/ui/update-banner.test.js`).
   - Verify `SKIP_WAITING` postMessage dispatch on "Refresh Now" (`test/ui/update-banner.test.js`).
   - Verify `loadStations(db)` seamless merge of all 34 curated streams with pre-existing DB data (`test/radio/stations.test.js`).
2. **End-to-End PWA Simulation:**
   - Pre-populate IndexedDB with 23 legacy stations and simulate app startup on older version.
   - Verify that when new version is available, update banner is rendered.
   - Verify that clicking "Refresh Now" activates new Service Worker and reloads.
   - Verify that upon reload, all 34 stations (including 6 Kids & Family and 5 News & Talk) are loaded into the catalog and IndexedDB.

---
