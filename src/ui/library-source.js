/**
 * LocalJam - Library Source Abstraction
 * Manages directory selection and reconciliation across Tier 1 (Chromium FSAA)
 * and Tier 2 (Session File Registry fallback), with separate rescan logic
 * iterating stored directory handles without popping directory pickers.
 */

import { db as defaultDb } from '../storage/db.js';
import { reconciler as defaultReconciler } from '../storage/reconciler.js';

/**
 * True when the File System Access API is available (Chromium desktop).
 * @returns {boolean}
 */
export function hasFileSystemAccess() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window && typeof window.showDirectoryPicker === 'function';
}

/**
 * Prompts for a music folder and indexes it. On Chromium uses showDirectoryPicker({mode:'read'})
 * + reconciler.reconcileDirectoryHandle; elsewhere uses a FileList from a `webkitdirectory` input
 * passed to reconciler.reconcileFileList.
 * Swallows AbortError (user cancelled) and resolves false; logs and rethrows anything else.
 *
 * @param {{
 *   onProgress?: (p: { parsedCount: number, status?: string }) => void,
 *   fileList?: FileList | Array<File>,
 *   db?: object,
 *   reconciler?: object
 * }} [opts]
 * @returns {Promise<boolean>} true when at least one track was indexed
 */
export async function pickFolder(opts = {}) {
  const reconciler = opts.reconciler || defaultReconciler;

  if (opts.fileList) {
    try {
      const result = await reconciler.reconcileFileList(opts.fileList, opts.onProgress);
      return Boolean(result && (result.scannedCount > 0 || (result.diff && (result.diff.toAdd?.length > 0 || result.diff.added?.length > 0))));
    } catch (err) {
      console.error('[LibrarySource] Failed to reconcile file list:', err);
      throw err;
    }
  }

  if (hasFileSystemAccess()) {
    let dirHandle;
    try {
      dirHandle = await window.showDirectoryPicker({ mode: 'read' });
    } catch (err) {
      if (err && err.name === 'AbortError') {
        return false;
      }
      console.error('[LibrarySource] showDirectoryPicker error:', err);
      throw err;
    }

    try {
      const result = await reconciler.reconcileDirectoryHandle(dirHandle, opts.onProgress);
      return Boolean(result && (result.scannedCount > 0 || (result.diff && (result.diff.toAdd?.length > 0 || result.diff.added?.length > 0))));
    } catch (err) {
      console.error('[LibrarySource] Reconcile directory handle error:', err);
      throw err;
    }
  }

  // Tier 2 Fallback: Create transient file input with webkitdirectory
  if (typeof document !== 'undefined') {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.webkitdirectory = true;
      input.multiple = true;
      input.style.display = 'none';
      document.body.appendChild(input);

      input.addEventListener('change', async () => {
        try {
          const files = Array.from(input.files || []);
          try {
            document.body.removeChild(input);
          } catch (e) {
            console.warn('[LibrarySource] Failed to remove transient input', e);
          }

          if (files.length === 0) {
            resolve(false);
            return;
          }

          const result = await reconciler.reconcileFileList(files, opts.onProgress);
          resolve(Boolean(result && (result.scannedCount > 0 || (result.diff && (result.diff.toAdd?.length > 0 || result.diff.added?.length > 0)))));
        } catch (err) {
          console.error('[LibrarySource] Reconcile file list fallback error:', err);
          reject(err);
        }
      });

      input.addEventListener('cancel', () => {
        try {
          document.body.removeChild(input);
        } catch (e) {
          console.warn('[LibrarySource] Failed to remove transient input on cancel', e);
        }
        resolve(false);
      });

      try {
        input.click();
      } catch (err) {
        console.error('[LibrarySource] Failed to open file picker:', err);
        try {
          document.body.removeChild(input);
        } catch (e) {
          console.warn('[LibrarySource] Failed to remove transient input after picker error', e);
        }
        reject(err);
      }
    });
  }

  return false;
}

/**
 * Re-runs reconciliation against stored directory handles in IndexedDB (`db.getAllDirectoryHandles()`).
 * On Chromium Tier 1: iterates stored roots, checks/requests read permission on each handle, and
 * calls reconciler.reconcileDirectoryHandle(root.handle, onProgress) WITHOUT opening a folder picker.
 * If no stored handles exist or on Tier 2 browsers, falls back to pickFolder(opts).
 *
 * @param {{
 *   onProgress?: (p: { parsedCount: number, status?: string }) => void,
 *   fileList?: FileList | Array<File>,
 *   db?: object,
 *   reconciler?: object
 * }} [opts]
 * @returns {Promise<boolean>}
 */
export async function rescan(opts = {}) {
  const db = opts.db || defaultDb;
  const reconciler = opts.reconciler || defaultReconciler;

  if (hasFileSystemAccess()) {
    let roots = [];
    try {
      if (db && typeof db.getAllDirectoryHandles === 'function') {
        roots = await db.getAllDirectoryHandles();
      }
    } catch (err) {
      console.warn('[LibrarySource] Failed to retrieve stored directory handles:', err);
    }

    const validRoots = (roots || []).filter(
      (r) => r && (r.handle || (typeof r.queryPermission === 'function'))
    );

    if (validRoots.length > 0) {
      let totalScanned = 0;
      for (const root of validRoots) {
        const handle = root.handle || root;
        if (typeof handle.queryPermission === 'function') {
          try {
            const permission = await handle.queryPermission({ mode: 'read' });
            if (permission !== 'granted' && typeof handle.requestPermission === 'function') {
              const requested = await handle.requestPermission({ mode: 'read' });
              if (requested !== 'granted') {
                console.warn('[LibrarySource] Read permission denied for directory handle:', root.name || root.id);
                continue;
              }
            }
          } catch (permErr) {
            console.warn('[LibrarySource] Error verifying handle permissions:', permErr);
          }
        }

        try {
          const result = await reconciler.reconcileDirectoryHandle(handle, opts.onProgress);
          totalScanned += (result?.scannedCount || 0);
        } catch (recErr) {
          console.error('[LibrarySource] Failed to reconcile stored directory handle:', root.name || root.id, recErr);
        }
      }
      return totalScanned > 0;
    }
  }

  // Fallback to pickFolder when no stored handles exist or on Tier 2
  return pickFolder(opts);
}
