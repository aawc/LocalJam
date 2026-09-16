/**
 * LocalJam - Transient Toast Notification Host & ARIA Live Announcer
 * 1.6s auto-dismissal, replacement debouncing, and single-source screen reader announcements.
 */

import { escapeHtml } from '../../utils/sanitize.js';

export const TOAST_DURATION_MS = 1600;

let activeToastHost = null;

function announceToScreenReader(message) {
  if (typeof document === 'undefined' || typeof document.getElementById !== 'function') {
    return;
  }
  const liveRegion = document.getElementById('aria-live-region');
  if (liveRegion) {
    liveRegion.textContent = message || '';
  }
}

/**
 * Creates and initializes a Toast Host container.
 * Visual container is aria-hidden="true" to prevent double-speaking with #aria-live-region.
 * @returns {{ element: HTMLElement, show: (message: string) => void, destroy: () => void }}
 */
export function createToastHost() {
  const element = document.createElement('div');
  element.className = 'toast-host';
  element.setAttribute('aria-hidden', 'true');

  let timeoutId = null;

  const show = (message) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    const safeMessage = escapeHtml(message || '');
    element.innerHTML = `<div class="toast-item">${safeMessage}</div>`;

    announceToScreenReader(message);

    timeoutId = setTimeout(() => {
      element.innerHTML = '';
      timeoutId = null;
    }, TOAST_DURATION_MS);
  };

  const destroy = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    element.innerHTML = '';
    if (activeToastHost === host) {
      activeToastHost = null;
    }
  };

  const host = { element, show, destroy };
  activeToastHost = host;
  return host;
}

/**
 * Module-level convenience method to display a toast and announce to assistive tech.
 * @param {string} message
 */
export function showToast(message) {
  if (activeToastHost && typeof activeToastHost.show === 'function') {
    activeToastHost.show(message);
  } else {
    // If no visual host is mounted yet, still announce to screen reader
    announceToScreenReader(message);
  }
}
