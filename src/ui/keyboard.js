/**
 * LocalJam - Global Keyboard Shortcut Manager
 * Full keyboard navigation matrix matching Section 7 accessibility specification.
 */

import { audioEngine } from '../player/audio-engine.js';
import { queueManager } from '../player/queue.js';

export class KeyboardManager {
  constructor() {
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.active = false;
  }

  init() {
    if (this.active || typeof window === 'undefined') return;
    window.addEventListener('keydown', this.handleKeyDown);
    this.active = true;
  }

  handleKeyDown(event) {
    // Ignore hotkeys when typing in text fields or inputs
    const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
    const isTyping =
      activeEl &&
      (activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.isContentEditable);

    // Escape always works (closes modals, visualizer, queue drawer, and unfocuses search)
    if (event.key === 'Escape') {
      if (isTyping) {
        activeEl.blur();
        return;
      }
      const closeButtons = typeof document !== 'undefined'
        ? document.querySelectorAll('.modal-overlay .btn-close, .visualizer-overlay .btn-close, .queue-drawer .btn-close, #queue-close-btn')
        : [];
      closeButtons.forEach((btn) => btn.click());
      return;
    }

    if (isTyping) return;

    switch (event.code) {
      case 'Space':
        event.preventDefault();
        audioEngine.togglePlay();
        break;

      case 'ArrowLeft':
        event.preventDefault();
        if (event.shiftKey) {
          audioEngine.previous();
        } else {
          audioEngine.seekRelative(-5);
        }
        break;

      case 'ArrowRight':
        event.preventDefault();
        if (event.shiftKey) {
          audioEngine.next();
        } else {
          audioEngine.seekRelative(5);
        }
        break;

      case 'ArrowUp':
        event.preventDefault();
        audioEngine.setVolume(audioEngine.volume + 0.05);
        break;

      case 'ArrowDown':
        event.preventDefault();
        audioEngine.setVolume(audioEngine.volume - 0.05);
        break;

      case 'KeyM':
        event.preventDefault();
        audioEngine.toggleMute();
        break;

      case 'KeyS':
        event.preventDefault();
        queueManager.toggleShuffle();
        break;

      case 'KeyR':
        event.preventDefault();
        queueManager.cycleRepeat();
        break;

      case 'KeyQ':
        event.preventDefault();
        const queueBtn = typeof document !== 'undefined' ? document.getElementById('btn-toggle-queue') : null;
        if (queueBtn) queueBtn.click();
        break;

      case 'KeyE':
        event.preventDefault();
        const eqBtn = typeof document !== 'undefined' ? document.getElementById('btn-toggle-eq') : null;
        if (eqBtn) eqBtn.click();
        break;

      case 'KeyV':
        event.preventDefault();
        const vizBtn = typeof document !== 'undefined' ? document.getElementById('btn-toggle-viz') : null;
        if (vizBtn) vizBtn.click();
        break;

      case 'Slash':
        event.preventDefault();
        const searchInput = typeof document !== 'undefined' ? document.getElementById('global-search-input') : null;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
        break;

      default:
        // Handle Ctrl+K / Cmd+K
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
          event.preventDefault();
          const search = typeof document !== 'undefined' ? document.getElementById('global-search-input') : null;
          if (search) {
            search.focus();
            search.select();
          }
        }
        break;
    }
  }

  destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.handleKeyDown);
    }
    this.active = false;
  }
}

export const keyboardManager = new KeyboardManager();
