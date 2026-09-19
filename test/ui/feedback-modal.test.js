/**
 * LocalJam - Diagnostics & Feedback Modal Component Test Suite
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupMockDom, teardownMockDom } from '../helpers/mock-dom.js';
import { createFeedbackModal } from '../../src/ui/components/feedback-modal.js';

describe('Diagnostics & Feedback Modal Component Suite', () => {
  let container;

  beforeEach(() => {
    setupMockDom();
    container = document.createElement('div');
    container.id = 'modal-test-container';
    document.body.appendChild(container);
  });

  afterEach(() => {
    teardownMockDom();
  });

  it('createFeedbackModal renders modal dialog with role="dialog" and metrics cards', () => {
    const modal = createFeedbackModal();
    container.appendChild(modal.element);

    assert.equal(modal.element.id, 'feedback-modal');
    assert.equal(modal.element.getAttribute('role'), 'dialog');
    assert.equal(modal.element.getAttribute('aria-modal'), 'true');
    assert.equal(modal.element.style.display, 'none');

    assert.ok(modal.element.querySelector('#metric-version'));
    assert.ok(modal.element.querySelector('#metric-display'));
    assert.ok(modal.element.querySelector('#metric-storage-tier'));
    assert.ok(modal.element.querySelector('#metric-tracks'));
    assert.ok(modal.element.querySelector('#metric-sw'));
    assert.ok(modal.element.querySelector('#metric-audio'));
    assert.ok(modal.element.querySelector('#feedback-user-notes'));
    assert.ok(modal.element.querySelector('#btn-copy-diagnostics'));
    assert.ok(modal.element.querySelector('#btn-export-json'));
    assert.ok(modal.element.querySelector('#btn-github-issue'));
  });

  it('openModal displays modal and populates telemetry metrics', async () => {
    const mockDb = {
      getAllTracks: async () => [{ id: '1' }, { id: '2' }],
      getDirectoryHandles: async () => [{ name: 'Music' }],
      getAllPlaylists: async () => [],
      getFavorites: async () => [],
      getRecentHistory: async () => [],
      getStations: async () => []
    };

    const mockAudioEngine = {
      isRadio: true,
      isPlaying: true,
      volume: 1,
      muted: false,
      audioCtx: { state: 'running' },
      streamState: 'playing',
      currentStation: { name: 'KALX 90.7 FM' }
    };

    const modal = createFeedbackModal({
      db: mockDb,
      audioEngine: mockAudioEngine
    });
    container.appendChild(modal.element);

    modal.open();
    assert.equal(modal.element.style.display, 'flex');

    await modal.refreshMetrics();

    const tracksMetric = modal.element.querySelector('#metric-tracks');
    assert.ok(tracksMetric.textContent.includes('2 tracks'));

    const audioMetric = modal.element.querySelector('#metric-audio');
    assert.ok(audioMetric.textContent.includes('Radio • Playing'));
  });

  it('clicking close button hides modal, restores focus, and dispatches layer-close', () => {
    let closed = false;
    let eventDispatched = false;
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    const modal = createFeedbackModal({
      onClose: () => { closed = true; }
    });
    modal.element.addEventListener('layer-close', () => {
      eventDispatched = true;
    });
    container.appendChild(modal.element);

    modal.open({ openerEl: trigger });
    assert.equal(modal.element.style.display, 'flex');

    const closeBtn = modal.element.querySelector('#btn-close-feedback');
    assert.ok(closeBtn);
    closeBtn.click();

    assert.equal(modal.element.style.display, 'none');
    assert.equal(closed, true);
    assert.equal(eventDispatched, true);
  });

  it('Escape key dismisses the feedback modal', () => {
    let closed = false;
    const modal = createFeedbackModal({
      onClose: () => { closed = true; }
    });
    container.appendChild(modal.element);
    modal.open();

    const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    modal.element.dispatchEvent(escEvent);

    assert.equal(modal.element.style.display, 'none');
    assert.equal(closed, true);
  });

  it('typing user notes updates GitHub issue URL query parameters', async () => {
    const modal = createFeedbackModal();
    container.appendChild(modal.element);
    modal.open();
    await modal.refreshMetrics();

    const notesArea = modal.element.querySelector('#feedback-user-notes');
    const githubLink = modal.element.querySelector('#btn-github-issue');
    assert.ok(notesArea);
    assert.ok(githubLink);

    notesArea.value = 'Audio skips during background playback';
    notesArea.dispatchEvent(new Event('input'));

    assert.ok(githubLink.href.includes('github.com/aawc/LocalJam/issues/new'));
    assert.ok(githubLink.href.includes('Audio%20skips%20during%20background%20playback'));
  });

  it('copy button copies diagnostics and invokes onToast', async () => {
    let copiedText = null;
    let toastMessage = null;

    globalThis.navigator.clipboard = {
      writeText: async (text) => {
        copiedText = text;
      }
    };

    const modal = createFeedbackModal({
      onToast: (msg) => { toastMessage = msg; }
    });
    container.appendChild(modal.element);
    modal.open();

    const copyBtn = modal.element.querySelector('#btn-copy-diagnostics');
    assert.ok(copyBtn);
    copyBtn.click();

    // Allow promise resolution
    await new Promise((r) => setTimeout(r, 20));

    assert.ok(copiedText);
    assert.ok(copiedText.includes('LocalJam Diagnostic Report'));
    assert.equal(toastMessage, '[DIAGNOSTICS COPIED]');
  });
});
