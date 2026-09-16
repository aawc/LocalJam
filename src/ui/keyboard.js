/**
 * LocalJam - Global Keyboard Shortcut Manager
 * Full keyboard navigation matrix matching §5.2 of the minimalist redesign specification.
 * Supports playback transport, volume/mute with toasts, source toggle (X),
 * layer stack toggling (L, Shift+L, E, Period, Slash), favorite (F), visualizer (V),
 * and typing suppression in text inputs.
 */

import { audioEngine as defaultAudioEngine } from '../player/audio-engine.js';
import { queueManager as defaultQueueManager } from '../player/queue.js';
import { layers as defaultLayers } from './layers.js';
import { showToast as defaultShowToast } from './components/toast.js';

export class KeyboardManager {
  /**
   * @param {{
   *   audioEngine?: object,
   *   queueManager?: object,
   *   layers?: object,
   *   onToast?: (msg: string) => void,
   *   onToggleSource?: () => void,
   *   onToggleVisualizer?: () => void,
   *   onToggleFavorite?: () => void
   * }} [deps]
   */
  constructor(deps = {}) {
    this.deps = deps || {};
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.active = false;
  }

  /**
   * Initializes keyboard shortcut listeners.
   * @param {object} [deps] Optional dependency overrides
   */
  init(deps = {}) {
    if (deps) Object.assign(this.deps = this.deps || {}, deps);
    if (this.active || typeof window === 'undefined') return;
    window.addEventListener('keydown', this.handleKeyDown);
    this.active = true;
  }

  handleKeyDown(event) {
    if (event.defaultPrevented) return;

    const audioEngine = this.deps.audioEngine || defaultAudioEngine;
    const queueManager = this.deps.queueManager || defaultQueueManager;
    const layers = this.deps.layers || defaultLayers;
    const toast = this.deps.onToast || defaultShowToast;

    // Do nothing on Ctrl / Meta / Alt key combinations (preserve browser/OS shortcuts)
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    // Ignore hotkeys when typing in text fields or inputs
    const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
    const isTyping =
      activeEl &&
      (activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        activeEl.isContentEditable);

    // Escape always works: if typing, blur input; if layer open, close topmost layer
    if (event.key === 'Escape') {
      event.preventDefault();
      if (isTyping) {
        if (typeof activeEl.blur === 'function') activeEl.blur();
        return;
      }
      if (layers && layers.top) {
        layers.close();
      }
      return;
    }

    if (isTyping) return;

    switch (event.code) {
      case 'Space':
        event.preventDefault();
        audioEngine?.togglePlay?.();
        break;

      case 'ArrowLeft':
        event.preventDefault();
        if (event.shiftKey) {
          audioEngine?.previous?.();
        } else if (!audioEngine?.isRadio) {
          audioEngine?.seekRelative?.(-5);
        }
        break;

      case 'ArrowRight':
        event.preventDefault();
        if (event.shiftKey) {
          audioEngine?.next?.();
        } else if (!audioEngine?.isRadio) {
          audioEngine?.seekRelative?.(5);
        }
        break;

      case 'ArrowUp':
        event.preventDefault();
        if (audioEngine) {
          const currentVol = audioEngine.volume !== undefined ? audioEngine.volume : 1;
          const newVol = Math.max(0, Math.min(1, Math.round((currentVol + 0.05) * 100) / 100));
          audioEngine.setVolume?.(newVol);
          toast?.(`[VOLUME ${Math.round(newVol * 100)}%]`);
        }
        break;

      case 'ArrowDown':
        event.preventDefault();
        if (audioEngine) {
          const currentVol = audioEngine.volume !== undefined ? audioEngine.volume : 1;
          const newVol = Math.max(0, Math.min(1, Math.round((currentVol - 0.05) * 100) / 100));
          audioEngine.setVolume?.(newVol);
          toast?.(`[VOLUME ${Math.round(newVol * 100)}%]`);
        }
        break;

      case 'KeyM':
        event.preventDefault();
        if (audioEngine) {
          audioEngine.toggleMute?.();
          const isMuted = Boolean(audioEngine.muted);
          toast?.(isMuted ? '[MUTED]' : `[VOLUME ${Math.round((audioEngine.volume ?? 1) * 100)}%]`);
        }
        break;

      case 'KeyX':
        event.preventDefault();
        if (typeof this.deps.onToggleSource === 'function') {
          this.deps.onToggleSource();
        }
        break;

      case 'KeyS':
        event.preventDefault();
        if (!audioEngine?.isRadio && queueManager) {
          const isShuffle = queueManager.toggleShuffle?.();
          toast?.(isShuffle ? '[SHUFFLE ON]' : '[SHUFFLE OFF]');
        }
        break;

      case 'KeyR':
        event.preventDefault();
        if (!audioEngine?.isRadio && queueManager) {
          const mode = queueManager.cycleRepeat?.();
          toast?.(`[REPEAT ${(mode || '').toUpperCase()}]`);
        }
        break;

      case 'KeyF':
        event.preventDefault();
        if (typeof this.deps.onToggleFavorite === 'function') {
          this.deps.onToggleFavorite();
        }
        break;

      case 'KeyE':
        event.preventDefault();
        if (layers) {
          if (layers.top === 'eq') {
            layers.close();
          } else {
            layers.open('eq');
          }
        }
        break;

      case 'KeyV':
        event.preventDefault();
        if (typeof this.deps.onToggleVisualizer === 'function') {
          this.deps.onToggleVisualizer();
        }
        break;

      case 'KeyL':
        event.preventDefault();
        if (layers) {
          if (event.shiftKey) {
            layers.open('browse', { tab: 'radio' });
          } else if (layers.top === 'browse') {
            layers.close();
          } else {
            layers.open('browse', { tab: 'library' });
          }
        }
        break;

      case 'Slash':
        event.preventDefault();
        if (layers) {
          layers.open('browse', { tab: 'library', focusSearch: true });
        }
        break;

      case 'Period':
        event.preventDefault();
        if (layers) {
          if (layers.top === 'overflow') {
            layers.close();
          } else {
            layers.open('overflow');
          }
        }
        break;

      default:
        if (event.key === '.') {
          event.preventDefault();
          if (layers) {
            if (layers.top === 'overflow') layers.close();
            else layers.open('overflow');
          }
        } else if (event.key === '/') {
          event.preventDefault();
          if (layers) {
            layers.open('browse', { tab: 'library', focusSearch: true });
          }
        }
        break;
    }
  }

  /**
   * Cleans up keyboard listeners.
   */
  destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.handleKeyDown);
    }
    this.active = false;
  }
}

export const keyboardManager = new KeyboardManager();
