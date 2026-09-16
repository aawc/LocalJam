/**
 * LocalJam - Library Source Abstraction Unit Test Suite
 * Asserts Tier 1 / Tier 2 detection, folder picking, AbortError swallowing,
 * progress forwarding, and stored directory handle rescan reconciliation.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupMockDom, teardownMockDom } from '../helpers/mock-dom.js';
import {
  hasFileSystemAccess,
  pickFolder,
  rescan
} from '../../src/ui/library-source.js';

describe('Library Source Abstraction', () => {
  let originalWindow;
  let originalShowDirectoryPicker;

  beforeEach(() => {
    setupMockDom();
    originalWindow = globalThis.window;
    originalShowDirectoryPicker = globalThis.window ? globalThis.window.showDirectoryPicker : undefined;
  });

  afterEach(() => {
    if (globalThis.window) {
      if (originalShowDirectoryPicker !== undefined) {
        globalThis.window.showDirectoryPicker = originalShowDirectoryPicker;
      } else {
        delete globalThis.window.showDirectoryPicker;
      }
    }
    teardownMockDom();
  });

  it('hasFileSystemAccess returns false when showDirectoryPicker is absent and true when present', () => {
    if (globalThis.window) {
      delete globalThis.window.showDirectoryPicker;
    }
    assert.equal(hasFileSystemAccess(), false);

    globalThis.window.showDirectoryPicker = async () => {};
    assert.equal(hasFileSystemAccess(), true);
  });

  it('pickFolder resolves false and does not throw when showDirectoryPicker rejects with AbortError', async () => {
    const abortErr = new Error('User cancelled directory selection');
    abortErr.name = 'AbortError';

    globalThis.window.showDirectoryPicker = async () => {
      throw abortErr;
    };

    const result = await pickFolder();
    assert.equal(result, false, 'AbortError must be swallowed and resolve false');
  });

  it('pickFolder rethrows any non-AbortError rejection', async () => {
    const systemErr = new Error('Internal filesystem failure');
    systemErr.name = 'SecurityError';

    globalThis.window.showDirectoryPicker = async () => {
      throw systemErr;
    };

    await assert.rejects(
      async () => {
        await pickFolder();
      },
      (err) => {
        assert.equal(err.name, 'SecurityError');
        assert.equal(err.message, 'Internal filesystem failure');
        return true;
      }
    );
  });

  it('pickFolder({ fileList }) forwards fileList to reconciler.reconcileFileList and reports progress', async () => {
    const dummyFiles = [
      { name: 'song1.mp3', size: 1024, lastModified: 1000 },
      { name: 'song2.flac', size: 2048, lastModified: 2000 }
    ];

    let fileListPassed = null;
    let progressReceived = null;

    const mockReconciler = {
      reconcileFileList: async (files, onProgress) => {
        fileListPassed = files;
        if (onProgress) {
          onProgress({ parsedCount: 2, status: 'indexing' });
        }
        return { scannedCount: 2 };
      }
    };

    const result = await pickFolder({
      fileList: dummyFiles,
      reconciler: mockReconciler,
      onProgress: (p) => {
        progressReceived = p;
      }
    });

    assert.equal(result, true);
    assert.deepEqual(fileListPassed, dummyFiles);
    assert.deepEqual(progressReceived, { parsedCount: 2, status: 'indexing' });
  });

  it('pickFolder invokes showDirectoryPicker and reconciles returned directory handle (F3)', async () => {
    const mockHandle = { name: 'LocalMusic' };
    globalThis.window.showDirectoryPicker = async (options) => {
      assert.deepEqual(options, { mode: 'read' });
      return mockHandle;
    };

    let reconciledHandle = null;
    let progressReported = null;
    const mockReconciler = {
      reconcileDirectoryHandle: async (handle, onProgress) => {
        reconciledHandle = handle;
        if (onProgress) onProgress({ parsedCount: 5 });
        return { scannedCount: 5 };
      }
    };

    const result = await pickFolder({
      reconciler: mockReconciler,
      onProgress: (p) => {
        progressReported = p;
      }
    });

    assert.equal(result, true);
    assert.equal(reconciledHandle, mockHandle);
    assert.deepEqual(progressReported, { parsedCount: 5 });
  });

  it('rescan calls db.getAllDirectoryHandles and invokes reconciler for each stored root without showDirectoryPicker', async () => {
    let showPickerCalled = false;
    globalThis.window.showDirectoryPicker = async () => {
      showPickerCalled = true;
      return { name: 'unexpected' };
    };

    const mockHandle1 = { name: 'MusicFolder1', queryPermission: async () => 'granted' };
    const mockHandle2 = { name: 'MusicFolder2', queryPermission: async () => 'granted' };

    const mockDb = {
      getAllDirectoryHandles: async () => [
        { id: 'root_1', name: 'MusicFolder1', handle: mockHandle1 },
        { id: 'root_2', name: 'MusicFolder2', handle: mockHandle2 }
      ]
    };

    const reconciledHandles = [];
    const mockReconciler = {
      reconcileDirectoryHandle: async (handle, onProgress) => {
        reconciledHandles.push(handle);
        if (onProgress) onProgress({ parsedCount: 10, status: 'done' });
        return { scannedCount: 10 };
      }
    };

    let lastProgress = null;
    const result = await rescan({
      db: mockDb,
      reconciler: mockReconciler,
      onProgress: (p) => {
        lastProgress = p;
      }
    });

    assert.equal(result, true);
    assert.equal(showPickerCalled, false, 'showDirectoryPicker must NOT be called when stored handles exist');
    assert.equal(reconciledHandles.length, 2);
    assert.equal(reconciledHandles[0], mockHandle1);
    assert.equal(reconciledHandles[1], mockHandle2);
    assert.deepEqual(lastProgress, { parsedCount: 10, status: 'done' });
  });

  it('rescan falls back to pickFolder on Tier 1 when stored handles list is empty (F2)', async () => {
    globalThis.window.showDirectoryPicker = async () => {};
    let handlesQueried = false;
    let pickFolderInvoked = false;
    const dummyFiles = [{ name: 'song.mp3' }];

    const mockDb = {
      getAllDirectoryHandles: async () => {
        handlesQueried = true;
        return [];
      }
    };

    const mockReconciler = {
      reconcileFileList: async () => {
        pickFolderInvoked = true;
        return { scannedCount: 1 };
      }
    };

    const result = await rescan({
      db: mockDb,
      reconciler: mockReconciler,
      fileList: dummyFiles
    });

    assert.equal(result, true);
    assert.equal(handlesQueried, true, 'db.getAllDirectoryHandles must be queried on Tier 1');
    assert.equal(pickFolderInvoked, true, 'must fall back to pickFolder when handles are empty');
  });

  it('rescan falls back to pickFolder directly on Tier 2 browsers (F2)', async () => {
    delete globalThis.window.showDirectoryPicker;
    let pickFolderInvoked = false;
    const dummyFiles = [{ name: 'song.mp3' }];

    const mockReconciler = {
      reconcileFileList: async () => {
        pickFolderInvoked = true;
        return { scannedCount: 1 };
      }
    };

    const result = await rescan({
      reconciler: mockReconciler,
      fileList: dummyFiles
    });

    assert.equal(result, true);
    assert.equal(pickFolderInvoked, true);
  });
});
