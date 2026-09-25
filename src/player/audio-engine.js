/**
 * LocalJam - Production Audio Playback Engine
 * Hybrid HTMLAudioElement + Web Audio API pipeline with 10-band EQ, FFT Analyser,
 * Object URL lifecycle management, Media Session API, and CORS fallback for Radio.
 */

import { equalizer } from './equalizer.js';
import { queueManager } from './queue.js';
import { sessionRegistry } from '../storage/session-registry.js';
import { db } from '../storage/db.js';
import { CURATED_STATIONS } from '../radio/stations.js';

/**
 * Appends or updates the cache-busting _lj_retry query parameter on a live stream URL.
 * @param {string} baseStreamUrl
 * @param {number} [timestamp=Date.now()]
 * @returns {string} Stream URL with updated _lj_retry parameter
 */
export function getRetryStreamUrl(baseStreamUrl, timestamp = Date.now()) {
  if (!baseStreamUrl || typeof baseStreamUrl !== 'string') return '';
  try {
    const urlObj = new URL(baseStreamUrl);
    urlObj.searchParams.set('_lj_retry', String(timestamp));
    return urlObj.toString();
  } catch {
    const cleanUrl = baseStreamUrl.replace(/([?&])_lj_retry=\d+(&?)/, (match, p1, p2) => (p2 ? p1 : ''));
    const separator = cleanUrl.includes('?') ? '&' : '?';
    return `${cleanUrl}${separator}_lj_retry=${timestamp}`;
  }
}

export class AudioEngine {
  constructor() {
    this.audioA = typeof Audio !== 'undefined' ? new Audio() : null;
    this.audioB = typeof Audio !== 'undefined' ? new Audio() : null;
    this.radioAudio = typeof Audio !== 'undefined' ? new Audio() : null;

    this.activePlayer = 'A'; // 'A' or 'B'
    this.currentTrack = null;
    this.currentStation = null;
    this.stationCatalog = Array.isArray(CURATED_STATIONS) ? [...CURATED_STATIONS] : [];
    this.isPlaying = false;
    this.isRadio = false;
    /** @type {'idle'|'connecting'|'buffering'|'playing'|'error'} */
    this.streamState = 'idle';
    this.isUsingRadioFallback = false;
    this.volume = 0.8;
    this.muted = false;
    this.crossfadeSeconds = 0;

    /** @type {AudioContext|null} */
    this.audioCtx = null;
    this.gainA = null;
    this.gainB = null;
    this.masterGain = null;
    /** @type {AnalyserNode|null} */
    this.analyser = null;
    this.sourceA = null;
    this.sourceB = null;
    this.webAudioInitialized = false;

    // Track active object URLs for memory leak protection
    this.activeObjectUrls = new Set();
    this.currentObjectUrl = null;

    /** @type {Set<Function>} */
    this.stateListeners = new Set();

    // Resilient Radio Stream Controller state
    this.maxReconnectAttempts = 5;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.stallWatchdogTimer = null;
    this.stallThresholdMs = 8000;
    this.watchdogIntervalMs = 2000;
    this.lastPlaybackPosition = -1;
    this.lastPositionUpdateTime = 0;

    // Window network listeners
    this.handleOnline = () => this.onNetworkOnline();
    this.handleOffline = () => this.onNetworkOffline();
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
    }

    if (this.audioA && this.audioB && this.radioAudio) {
      this.initAudioElements();
      this.initMediaSession();
    }
  }


  initAudioElements() {
    [this.audioA, this.audioB, this.radioAudio].forEach((audio, idx) => {
      if (!audio) return;
      audio.preload = idx === 2 ? 'none' : 'metadata';
      audio.playsInline = true;
      if (typeof audio.setAttribute === 'function') {
        audio.setAttribute('playsinline', '');
        audio.setAttribute('webkit-playsinline', '');
      }

      audio.addEventListener('timeupdate', () => {
        if (this.getActiveAudio() === audio) {
          if (this.isRadio) {
            if (audio.currentTime !== this.lastPlaybackPosition) {
              this.lastPlaybackPosition = audio.currentTime;
              this.lastPositionUpdateTime = Date.now();
            }
            if (this.streamState === 'buffering' || this.streamState === 'connecting') {
              this.streamState = 'playing';
            }
          }
          this.notifyState();
          this.syncMediaSessionPosition();
        }
      });

      audio.addEventListener('ended', () => {
        if (this.getActiveAudio() === audio) {
          this.handleTrackEnded();
        }
      });

      audio.addEventListener('waiting', () => {
        if (this.getActiveAudio() === audio && this.isRadio) {
          this.streamState = 'buffering';
          this.notifyState();
        }
      });

      audio.addEventListener('stalled', () => {
        if (this.getActiveAudio() === audio && this.isRadio) {
          this.streamState = 'buffering';
          this.notifyState();
        }
      });

      audio.addEventListener('canplay', () => {
        if (this.getActiveAudio() === audio && this.isRadio) {
          if (this.isPlaying) {
            this.streamState = 'playing';
          }
          this.notifyState();
        }
      });

      audio.addEventListener('error', () => {
        if (this.getActiveAudio() === audio) {
          const err = audio.error;
          console.error(`[AudioEngine] ${idx === 2 ? 'Radio' : idx === 0 ? 'Player A' : 'Player B'} error (code ${err?.code}): ${err?.message}`);
          if (this.isRadio) {
            if (this.streamState !== 'error' && this.reconnectAttempts < this.maxReconnectAttempts) {
              this.handleStreamStall();
            } else {
              this.streamState = 'error';
              this.isPlaying = false;
              this.notifyState();
            }
          } else {
            this.notifyState();
          }
        }
      });

      audio.addEventListener('play', () => {
        if (this.getActiveAudio() === audio) {
          this.isPlaying = true;
          if (this.isRadio) {
            this.streamState = 'playing';
          }
          this.notifyState();
        }
      });

      audio.addEventListener('playing', () => {
        if (this.getActiveAudio() === audio) {
          this.isPlaying = true;
          if (this.isRadio) {
            this.streamState = 'playing';
            this.resetReconnection();
            this.lastPositionUpdateTime = Date.now();
          }
          this.notifyState();
        }
      });


      audio.addEventListener('pause', () => {
        if (this.getActiveAudio() === audio) {
          this.isPlaying = false;
          if (this.isRadio && this.streamState !== 'error') {
            this.streamState = 'idle';
          }
          this.notifyState();
        }
      });
    });
  }

  unlock() {
    this.ensureAudioContextActive().catch(() => {});
  }

  async ensureAudioContextActive() {
    if (!this.webAudioInitialized) {
      await this.initWebAudio();
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try {
        await this.audioCtx.resume();
      } catch (err) {
        console.warn(`[AudioEngine] AudioContext resume warning: ${err?.message}`);
      }
    }
    return this.audioCtx;
  }

  async initWebAudio() {
    if (this.webAudioInitialized) return;
    try {
      const AudioContextClass = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
      if (!AudioContextClass) return;

      this.audioCtx = new AudioContextClass();
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      this.sourceA = this.audioCtx.createMediaElementSource(this.audioA);
      this.sourceB = this.audioCtx.createMediaElementSource(this.audioB);

      this.gainA = this.audioCtx.createGain();
      this.gainB = this.audioCtx.createGain();
      this.masterGain = this.audioCtx.createGain();

      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.85;

      this.sourceA.connect(this.gainA);
      this.sourceB.connect(this.gainB);

      // Connect both gains to EQ input
      const preEqGain = this.audioCtx.createGain();
      this.gainA.connect(preEqGain);
      this.gainB.connect(preEqGain);

      equalizer.connect(this.audioCtx, preEqGain, this.masterGain);

      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);

      this.gainA.gain.value = 1;
      this.gainB.gain.value = 0;
      this.masterGain.gain.value = this.muted ? 0 : this.volume;

      this.webAudioInitialized = true;
    } catch (err) {
      console.error(`[AudioEngine] Web Audio initialization warning: ${err?.message}`);
    }
  }

  getActiveAudio() {
    if (this.isRadio && this.isUsingRadioFallback && this.radioAudio) {
      return this.radioAudio;
    }
    return this.activePlayer === 'A' ? this.audioA : this.audioB;
  }

  getInactiveAudio() {
    return this.activePlayer === 'A' ? this.audioB : this.audioA;
  }

  subscribe(listener) {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  setStationCatalog(stations) {
    if (Array.isArray(stations)) {
      this.stationCatalog = [...stations];
    }
  }

  getStationCatalog() {
    return this.stationCatalog;
  }

  setCrossfadeDuration(seconds) {
    this.crossfadeSeconds = Math.max(0, Math.min(10, parseFloat(seconds) || 0));
  }

  get crossfadeDuration() {
    return this.crossfadeSeconds;
  }

  get currentTime() {
    const audio = this.getActiveAudio();
    return (audio && audio.currentTime) || 0;
  }

  get duration() {
    if (this.isRadio) return 0;
    const audio = this.getActiveAudio();
    return (audio && audio.duration) || (this.currentTrack?.duration) || 0;
  }

  notifyState() {
    const audio = this.getActiveAudio();
    const state = {
      isPlaying: this.isPlaying,
      isRadio: this.isRadio,
      streamState: this.isRadio ? this.streamState : (this.isPlaying ? 'playing' : 'idle'),
      currentTrack: this.currentTrack,
      currentStation: this.currentStation,
      currentTime: (audio && audio.currentTime) || 0,
      duration: this.isRadio ? 0 : ((audio && audio.duration) || (this.currentTrack?.duration) || 0),
      volume: this.volume,
      muted: this.muted,
      repeat: queueManager.repeat,
      shuffle: queueManager.shuffle
    };

    for (const listener of this.stateListeners) {
      try {
        listener(state);
      } catch (err) {
        console.error(`[AudioEngine] State listener error: ${err?.message}`);
      }
    }
  }

  /**
   * Play a track from IndexedDB or File handle/object with A/B switching and crossfade
   * @param {any} track
   * @param {number} [startPosition=0]
   */
  async playTrack(track, startPosition = 0) {
    if (!track) return;
    this.stopStallWatchdog();
    this.resetReconnection();
    await this.initWebAudio();

    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }


    this.isRadio = false;
    this.currentStation = null;
    this.currentTrack = track;
    this.isUsingRadioFallback = false;
    if (this.radioAudio) {
      try {
        if (typeof this.radioAudio.pause === 'function') this.radioAudio.pause();
      } catch (_) {}
      if (typeof this.radioAudio.removeAttribute === 'function') {
        this.radioAudio.removeAttribute('src');
      }
      this.radioAudio.src = '';
      if (typeof this.radioAudio.load === 'function') this.radioAudio.load();
    }

    // Trigger background audio unlock
    this.unlock();

    // Obtain File object
    let file = null;
    try {
      file = sessionRegistry.getFile(track.id);

      // Tier 1: Stored FileSystemFileHandle with permission check
      if (!file && track.handle) {
        try {
          if (typeof track.handle.queryPermission === 'function') {
            let perm = await track.handle.queryPermission({ mode: 'read' });
            if (perm !== 'granted' && typeof track.handle.requestPermission === 'function') {
              perm = await track.handle.requestPermission({ mode: 'read' });
            }
          }
          if (typeof track.handle.getFile === 'function') {
            file = await track.handle.getFile();
          }
        } catch (handleErr) {
          console.warn(`[AudioEngine] Direct handle access failed for ${track.title}: ${handleErr?.message}`);
        }
      }

      // Tier 1 Fallback: Root directory handle traversal from IndexedDB
      if (!file && track.relativePath && db && typeof db.getRoots === 'function') {
        try {
          const roots = await db.getRoots();
          const root = roots.find((r) => r.id === track.rootId) || roots[0];
          if (root && root.handle) {
            if (typeof root.handle.queryPermission === 'function') {
              let perm = await root.handle.queryPermission({ mode: 'read' });
              if (perm !== 'granted' && typeof root.handle.requestPermission === 'function') {
                perm = await root.handle.requestPermission({ mode: 'read' });
              }
            }
            const parts = track.relativePath.split('/').filter(Boolean);
            let currHandle = root.handle;
            for (let i = 0; i < parts.length - 1; i++) {
              if (typeof currHandle.getDirectoryHandle === 'function') {
                currHandle = await currHandle.getDirectoryHandle(parts[i]);
              }
            }
            if (typeof currHandle.getFileHandle === 'function') {
              const fileHandle = await currHandle.getFileHandle(parts[parts.length - 1]);
              file = await fileHandle.getFile();
              track.handle = fileHandle;
              if (typeof db.putTrack === 'function') {
                db.putTrack(track).catch(() => {});
              }
            }
          }
        } catch (rootErr) {
          console.warn(`[AudioEngine] Root directory handle traversal failed for ${track.relativePath}: ${rootErr?.message}`);
        }
      }

      if (file && sessionRegistry && typeof sessionRegistry.registerFile === 'function') {
        sessionRegistry.registerFile(file, track.relativePath || track.filename);
      }
    } catch (err) {
      console.error(`[AudioEngine] Failed to obtain File for track ${track.title}: ${err?.message}`);
    }

    if (!file && !track.src) {
      console.error(`[AudioEngine] Track file unavailable for ${track.title}`);
      this.notifyState();
      return;
    }

    // Clean up previous object URL if any
    if (this.currentObjectUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.activeObjectUrls.delete(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }

    let mediaUrl = track.src;
    if (file && typeof URL !== 'undefined' && URL.createObjectURL) {
      mediaUrl = URL.createObjectURL(file);
      this.currentObjectUrl = mediaUrl;
      this.activeObjectUrls.add(mediaUrl);
    }

    // Dual-Element A/B Crossfade Switching
    const prevAudio = this.getActiveAudio();
    const nextPlayer = this.activePlayer === 'A' ? 'B' : 'A';
    const nextAudio = nextPlayer === 'B' ? this.audioB : this.audioA;
    const nextGain = nextPlayer === 'B' ? this.gainB : this.gainA;
    const prevGain = nextPlayer === 'B' ? this.gainA : this.gainB;

    if (nextAudio) {
      nextAudio.src = mediaUrl;
      if (startPosition > 0) {
        nextAudio.currentTime = startPosition;
      }
    }

    this.activePlayer = nextPlayer;

    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
    }

    if (!this.crossfadeSeconds || this.crossfadeSeconds <= 0) {
      if (nextGain) nextGain.gain.value = 1;
      if (prevGain && prevGain !== nextGain) prevGain.gain.value = 0;
    }

    try {
      if (nextAudio) {
        const playPromise = nextAudio.play();
        if (playPromise !== undefined) {
          await playPromise;
        }
      }

      // Handle Crossfade Gain Transition if Web Audio is active
      if (this.audioCtx && nextGain && prevGain && this.crossfadeSeconds > 0) {
        const now = this.audioCtx.currentTime;
        nextGain.gain.setValueAtTime(0, now);
        nextGain.gain.linearRampToValueAtTime(1, now + this.crossfadeSeconds);

        prevGain.gain.setValueAtTime(1, now);
        prevGain.gain.linearRampToValueAtTime(0, now + this.crossfadeSeconds);

        setTimeout(() => {
          if (prevAudio && prevAudio !== nextAudio) prevAudio.pause();
        }, this.crossfadeSeconds * 1000);
      } else {
        if (nextGain) nextGain.gain.value = 1;
        if (prevGain && prevGain !== nextGain) prevGain.gain.value = 0;
        if (prevAudio && prevAudio !== nextAudio) prevAudio.pause();
      }

      this.isPlaying = true;
      this.updateMediaSessionMetadata(track);
      this.notifyState();

      // Log to play history
      if (db && typeof db.addPlayHistory === 'function') {
        db.addPlayHistory(track.id, 0, false).catch((e) => console.error(e));
      }
    } catch (playErr) {
      console.error(`[AudioEngine] Playback failed: ${playErr?.message}`);
      this.isPlaying = false;
      this.notifyState();
    }
  }

  startStallWatchdog() {
    this.stopStallWatchdog();
    this.lastPositionUpdateTime = Date.now();
    this.stallWatchdogTimer = setInterval(() => {
      this.checkStall();
    }, this.watchdogIntervalMs);
    if (typeof this.stallWatchdogTimer?.unref === 'function') {
      this.stallWatchdogTimer.unref();
    }
  }

  stopStallWatchdog() {
    if (this.stallWatchdogTimer) {
      clearInterval(this.stallWatchdogTimer);
      this.stallWatchdogTimer = null;
    }
  }

  checkStall() {
    if (!this.isRadio || !this.isPlaying || (this.streamState !== 'playing' && this.streamState !== 'buffering')) return;
    const activeAudio = this.getActiveAudio();
    if (activeAudio && !activeAudio.paused) {
      const now = Date.now();
      if (this.lastPositionUpdateTime > 0 && (now - this.lastPositionUpdateTime) >= this.stallThresholdMs) {
        console.warn(`[AudioEngine] Live radio stream stall detected (frozen at ${this.lastPlaybackPosition}s for ${now - this.lastPositionUpdateTime}ms in ${this.streamState} state). Initiating reconnection...`);
        this.handleStreamStall();
      }
    }
  }

  handleStreamStall() {
    this.streamState = 'connecting';
    this.notifyState();
    this.reconnectRadioStream();
  }

  resetReconnection() {
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  getRetryStreamUrl(url, timestamp = Date.now()) {
    return getRetryStreamUrl(url, timestamp);
  }

  async reconnectRadioStream({ force = false, immediate = false } = {}) {
    if (!this.isRadio || !this.currentStation) return;

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.streamState = 'buffering';
      this.notifyState();
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts && !force) {
      console.error(`[AudioEngine] Reached maximum reconnection attempts (${this.maxReconnectAttempts}) for station ${this.currentStation.name}`);
      this.streamState = 'error';
      this.isPlaying = false;
      this.stopStallWatchdog();
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.notifyState();
      return;
    }

    this.reconnectAttempts++;
    this.streamState = 'connecting';
    this.notifyState();

    const delay = immediate ? 0 : Math.min(16000, 1000 * Math.pow(2, this.reconnectAttempts - 1));

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const doReconnect = async () => {
      this.reconnectTimer = null;
      if (!this.isPlaying || !this.isRadio || !this.currentStation) return;

      const baseStreamUrl = this.currentStation.streamUrl || this.currentStation.url;
      const retryUrl = getRetryStreamUrl(baseStreamUrl, Date.now());

      try {
        await this._executeRadioPlayback(this.currentStation, retryUrl);
      } catch (err) {
        console.warn(`[AudioEngine] Reconnect attempt ${this.reconnectAttempts} failed: ${err?.message}`);
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectRadioStream({ immediate: false });
        } else {
          this.streamState = 'error';
          this.isPlaying = false;
          this.stopStallWatchdog();
          this.notifyState();
        }
      }
    };

    if (delay <= 0) {
      await doReconnect();
    } else {
      this.reconnectTimer = setTimeout(doReconnect, delay);
      if (typeof this.reconnectTimer?.unref === 'function') {
        this.reconnectTimer.unref();
      }
    }
  }


  onNetworkOffline() {
    if (this.isRadio && this.isPlaying) {
      console.warn('[AudioEngine] Network disconnected (offline). Pausing stream and waiting for connection...');
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.streamState = 'buffering';
      this.notifyState();
    }
  }

  onNetworkOnline() {
    console.log('[AudioEngine] Network reconnected (online).');
    if (this.isRadio && (this.isPlaying || this.streamState === 'buffering')) {
      if (this.currentStation) {
        console.log('[AudioEngine] Resuming live radio stream following network recovery...');
        this.reconnectAttempts = 0;
        this.reconnectRadioStream({ force: true, immediate: true });
      }
    }
  }

  /**
   * Play Internet Radio Station with Web Audio pipeline & fallback
   * @param {any} station
   * @param {string|null} [customStreamUrl=null]
   */
  async playRadio(station, customStreamUrl = null) {
    if (!station) return;
    const streamUrl = customStreamUrl || station.streamUrl || station.url;
    if (!streamUrl) return;

    this.isRadio = true;
    this.isPlaying = true;
    this.currentStation = station;
    this.currentTrack = null;
    this.isUsingRadioFallback = false;
    this.streamState = 'connecting';
    this.resetReconnection();
    this.notifyState();

    try {
      await this._executeRadioPlayback(station, streamUrl);
    } catch (err) {
      if (err?.name !== 'AbortError') {
        this.isPlaying = false;
        this.streamState = 'error';
        this.stopStallWatchdog();
        this.notifyState();
      }
    }
  }

  async _executeRadioPlayback(station, streamUrl) {
    // Revoke local object URL immediately to prevent memory leaks during radio sessions
    if (this.currentObjectUrl) {
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        try {
          URL.revokeObjectURL(this.currentObjectUrl);
        } catch (_) {}
      }
      this.activeObjectUrls.delete(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }

    if (this.radioAudio && !this.isUsingRadioFallback) {
      try {
        if (typeof this.radioAudio.pause === 'function') this.radioAudio.pause();
      } catch (_) {}
      if (typeof this.radioAudio.removeAttribute === 'function') {
        this.radioAudio.removeAttribute('src');
      }
      this.radioAudio.src = '';
      if (typeof this.radioAudio.load === 'function') this.radioAudio.load();
    }

    await this.ensureAudioContextActive().catch(() => {});

    const prevAudio = this.getActiveAudio();
    const nextPlayer = this.activePlayer === 'A' ? 'B' : 'A';
    const nextAudio = nextPlayer === 'B' ? this.audioB : this.audioA;
    const nextGain = nextPlayer === 'B' ? this.gainB : this.gainA;
    const prevGain = nextPlayer === 'B' ? this.gainA : this.gainB;

    let webAudioError = null;

    if (nextAudio && !this.isUsingRadioFallback) {
      this.activePlayer = nextPlayer;
      try {
        nextAudio.crossOrigin = 'anonymous';
      } catch (_) {}
      nextAudio.src = streamUrl;

      if (this.masterGain) {
        this.masterGain.gain.value = this.muted ? 0 : this.volume;
      }
      if (nextGain) nextGain.gain.value = 1;
      if (prevGain && prevGain !== nextGain) prevGain.gain.value = 0;

      try {
        const playPromise = nextAudio.play();
        if (playPromise !== undefined) {
          await playPromise;
        }

        if (!this.isPlaying || !this.isRadio || this.currentStation?.id !== station?.id) {
          try {
            if (typeof nextAudio.pause === 'function') nextAudio.pause();
          } catch (_) {}
          return;
        }

        if (prevAudio && prevAudio !== nextAudio && typeof prevAudio.pause === 'function') {
          try { prevAudio.pause(); } catch (_) {}
        }

        this.isPlaying = true;
        this.streamState = 'playing';
        this.isUsingRadioFallback = false;
        this.lastPositionUpdateTime = Date.now();
        this.startStallWatchdog();
        this.updateMediaSessionRadio(station);
        this.notifyState();

        if (station && station.id) {
          station.lastPlayedAt = Date.now();
          if (db && typeof db.recordStationPlay === 'function') {
            db.recordStationPlay(station.id).catch(() => {});
          }
        }
        return;
      } catch (err) {
        webAudioError = err;
        console.warn(`[AudioEngine] Web Audio radio playback failed, attempting direct fallback: ${err?.message}`);
        try {
          if (typeof nextAudio.pause === 'function') nextAudio.pause();
        } catch (_) {}
        if (typeof nextAudio.removeAttribute === 'function') {
          nextAudio.removeAttribute('crossOrigin');
          nextAudio.removeAttribute('src');
        }
        nextAudio.src = '';
        if (typeof nextAudio.load === 'function') nextAudio.load();
      }
    }

    // Direct fallback with radioAudio (for non-CORS streams or standalone element)
    if (this.radioAudio) {
      try {
        this.isUsingRadioFallback = true;
        if (typeof this.radioAudio.removeAttribute === 'function') {
          this.radioAudio.removeAttribute('crossOrigin');
        }
        this.radioAudio.src = streamUrl;
        this.radioAudio.volume = this.muted ? 0 : this.volume;
        const fallbackPromise = this.radioAudio.play();
        if (fallbackPromise !== undefined) {
          await fallbackPromise;
        }

        if (!this.isPlaying || !this.isRadio || this.currentStation?.id !== station?.id) {
          try {
            if (typeof this.radioAudio.pause === 'function') this.radioAudio.pause();
          } catch (_) {}
          return;
        }

        if (prevAudio && prevAudio !== this.radioAudio && typeof prevAudio.pause === 'function') {
          try { prevAudio.pause(); } catch (_) {}
        }
        this.isPlaying = true;
        this.streamState = 'playing';
        this.lastPositionUpdateTime = Date.now();
        this.startStallWatchdog();
        this.updateMediaSessionRadio(station);
        this.notifyState();

        if (station && station.id) {
          station.lastPlayedAt = Date.now();
          if (db && typeof db.recordStationPlay === 'function') {
            db.recordStationPlay(station.id).catch(() => {});
          }
        }
        return;
      } catch (fbErr) {
        this.isUsingRadioFallback = false;
        try {
          if (typeof this.radioAudio.pause === 'function') this.radioAudio.pause();
        } catch (_) {}
        if (typeof this.radioAudio.removeAttribute === 'function') {
          this.radioAudio.removeAttribute('src');
        }
        this.radioAudio.src = '';
        if (typeof this.radioAudio.load === 'function') this.radioAudio.load();

        if (fbErr?.name !== 'AbortError') {
          console.error(`[AudioEngine] Radio stream fallback playback failed: ${fbErr?.message}`);
          throw fbErr;
        }
      }
    } else {
      this.isUsingRadioFallback = false;
      throw (webAudioError || new Error('[AudioEngine] No radio audio player available'));
    }
  }

  async play() {
    this.unlock();
    if (this.isRadio) {
      if (this.currentStation) {
        await this.playRadio(this.currentStation);
      }
      return;
    }
    const audio = this.getActiveAudio();
    if (audio && audio.src && audio.src !== (typeof window !== 'undefined' ? window.location.href : '')) {
      try {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          await playPromise;
        }
        this.isPlaying = true;
        this.notifyState();
      } catch (err) {
        console.error(`[AudioEngine] Play error: ${err?.message}`);
      }
    } else {
      let item = queueManager.getCurrent();
      if (!item && db && typeof db.getAllTracks === 'function') {
        try {
          const allTracks = await db.getAllTracks();
          const availableTracks = allTracks.filter((t) => !t.isMissing);
          if (availableTracks.length > 0) {
            queueManager.setQueue(availableTracks, 0);
            item = queueManager.getCurrent();
          }
        } catch (dbErr) {
          console.warn(`[AudioEngine] Failed to auto-populate queue from DB: ${dbErr?.message}`);
        }
      }
      if (item && item.track) {
        await this.playTrack(item.track);
      }
    }
  }

  pause() {
    this.stopStallWatchdog();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    const audio = this.getActiveAudio();
    if (audio && typeof audio.pause === 'function') {
      try { audio.pause(); } catch (_) {}
    }
    if (this.isRadio && this.radioAudio && typeof this.radioAudio.pause === 'function') {
      try { this.radioAudio.pause(); } catch (_) {}
    }
    this.isPlaying = false;
    if (this.isRadio && this.streamState !== 'error') {
      this.streamState = 'idle';
    }
    this.notifyState();
  }

  stop() {
    this.stopStallWatchdog();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    this.pause();
    [this.audioA, this.audioB, this.radioAudio].forEach((audio) => {
      if (!audio) return;
      try {
        if (typeof audio.pause === 'function') audio.pause();
      } catch (_) {}
      if (typeof audio.removeAttribute === 'function') {
        audio.removeAttribute('src');
      }
      audio.src = '';
      if (typeof audio.load === 'function') audio.load();
    });
    this.isUsingRadioFallback = false;
    this.isPlaying = false;
    this.streamState = 'idle';
    this.notifyState();
  }

  destroy() {
    this.stop();
    this.stopStallWatchdog();
    this.resetReconnection();
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }
    this.stateListeners.clear();
  }


  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  seek(seconds) {
    if (this.isRadio || !Number.isFinite(seconds)) return;
    const audio = this.getActiveAudio();
    if (audio) {
      const dur = (!isNaN(audio.duration) && audio.duration > 0)
        ? audio.duration
        : (this.currentTrack?.duration || 0);
      const maxSeconds = (Number.isFinite(dur) && dur > 0) ? dur : Infinity;
      const target = Math.max(0, Number.isFinite(maxSeconds) ? Math.min(seconds, maxSeconds) : seconds);
      if (Number.isFinite(target)) {
        audio.currentTime = target;
        this.notifyState();
        this.syncMediaSessionPosition();
      }
    }
  }

  seekRelative(deltaSeconds) {
    if (this.isRadio) return;
    const delta = Number.isFinite(deltaSeconds) ? deltaSeconds : 0;
    if (delta === 0) return;
    const audio = this.getActiveAudio();
    if (audio) {
      this.seek((audio.currentTime || 0) + delta);
    }
  }

  setVolume(volumeFraction) {
    this.volume = Math.max(0, Math.min(1, volumeFraction));
    if (this.masterGain && this.audioCtx) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.audioCtx.currentTime, 0.05);
    }
    if (this.radioAudio) this.radioAudio.volume = this.muted ? 0 : this.volume;
    if (this.audioA) this.audioA.volume = this.muted ? 0 : this.volume;
    if (this.audioB) this.audioB.volume = this.muted ? 0 : this.volume;
    this.notifyState();
  }

  toggleMute() {
    this.muted = !this.muted;
    this.setVolume(this.volume);
  }

  async next() {
    if (this.isRadio) {
      if (this.stationCatalog && this.stationCatalog.length > 0) {
        const currentId = this.currentStation?.id;
        const currentUrl = this.currentStation?.streamUrl || this.currentStation?.url;
        let index = this.stationCatalog.findIndex((s) => (currentId && s.id === currentId) || (currentUrl && (s.streamUrl === currentUrl || s.url === currentUrl)));
        const nextIndex = index === -1 ? 0 : (index + 1) % this.stationCatalog.length;
        const nextStation = this.stationCatalog[nextIndex];
        if (nextStation) {
          await this.playRadio(nextStation);
        }
      }
      return;
    }
    const nextItem = queueManager.next();
    if (nextItem) {
      await this.playTrack(nextItem.track);
    } else {
      this.pause();
    }
  }

  async previous() {
    if (this.isRadio) {
      if (this.stationCatalog && this.stationCatalog.length > 0) {
        const currentId = this.currentStation?.id;
        const currentUrl = this.currentStation?.streamUrl || this.currentStation?.url;
        let index = this.stationCatalog.findIndex((s) => (currentId && s.id === currentId) || (currentUrl && (s.streamUrl === currentUrl || s.url === currentUrl)));
        const prevIndex = index === -1 ? 0 : (index - 1 + this.stationCatalog.length) % this.stationCatalog.length;
        const prevStation = this.stationCatalog[prevIndex];
        if (prevStation) {
          await this.playRadio(prevStation);
        }
      }
      return;
    }
    const currentAudio = this.getActiveAudio();
    const prevItem = queueManager.previous(true, (currentAudio && currentAudio.currentTime) || 0);
    if (prevItem) {
      await this.playTrack(prevItem.track);
    }
  }

  handleTrackEnded() {
    if (this.currentTrack && db && typeof db.addPlayHistory === 'function') {
      db.addPlayHistory(this.currentTrack.id, this.currentTrack.duration || 0, true).catch((e) => console.error(e));
    }
    if (queueManager.repeat === 'one') {
      const current = queueManager.getCurrent();
      if (current) this.playTrack(current.track);
    } else {
      this.next();
    }
  }

  initMediaSession() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => this.play());
    navigator.mediaSession.setActionHandler('pause', () => this.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => this.previous());
    navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
    navigator.mediaSession.setActionHandler('seekbackward', (details) => this.seekRelative(-(details.seekOffset || 5)));
    navigator.mediaSession.setActionHandler('seekforward', (details) => this.seekRelative(details.seekOffset || 5));
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) this.seek(details.seekTime);
    });
  }

  updateMediaSessionMetadata(track) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;

    const artworkList = [];
    if (track.artwork && track.artwork.dataUrl) {
      artworkList.push(
        { src: track.artwork.dataUrl, sizes: '96x96', type: track.artwork.mimeType || 'image/jpeg' },
        { src: track.artwork.dataUrl, sizes: '256x256', type: track.artwork.mimeType || 'image/jpeg' },
        { src: track.artwork.dataUrl, sizes: '512x512', type: track.artwork.mimeType || 'image/jpeg' }
      );
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || 'Unknown Title',
      artist: track.artist || 'Unknown Artist',
      album: track.album || 'Unknown Album',
      artwork: artworkList
    });
  }

  updateMediaSessionRadio(station) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: station.name || 'Internet Radio',
      artist: station.genre || 'Live Stream',
      album: station.description || 'LocalJam Radio',
      artwork: station.favicon ? [{ src: station.favicon, sizes: '192x192', type: 'image/png' }] : []
    });
  }

  syncMediaSessionPosition() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    const audio = this.getActiveAudio();
    if (!this.isRadio && audio && !isNaN(audio.duration) && audio.duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: audio.duration,
          playbackRate: audio.playbackRate || 1.0,
          position: Math.min(audio.currentTime || 0, audio.duration)
        });
      } catch (e) {
        // Ignored if state changed during seek
      }
    }
  }

  /**
   * Synthesize organic, rhythmically pulsing frequency spectrum data for CORS-isolated radio streams
   * @param {Uint8Array} dataArray
   */
  generateSyntheticRadioFrequencyData(dataArray) {
    const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    const vol = this.muted ? 0 : this.volume;
    const count = dataArray.length;
    for (let i = 0; i < count; i++) {
      const freqNorm = i / count;
      const bassPulse = Math.sin(t * 3.2) * 0.5 + 0.5;
      const midPulse = Math.sin(t * 6.5 + i * 0.1) * 0.5 + 0.5;
      const treblePulse = Math.sin(t * 12.0 + i * 0.3) * 0.5 + 0.5;

      let energy = 0;
      if (freqNorm < 0.15) {
        energy = bassPulse * (1 - freqNorm / 0.15) * 220 + 35;
      } else if (freqNorm < 0.6) {
        energy = midPulse * 160 + 20;
      } else {
        energy = treblePulse * 110 + 10;
      }

      const decay = Math.pow(1 - freqNorm, 0.75);
      dataArray[i] = Math.min(255, Math.max(0, Math.floor(energy * decay * vol)));
    }
  }

  /**
   * Synthesize oscillating time-domain waveform data for radio streams
   * @param {Uint8Array} dataArray
   */
  generateSyntheticRadioTimeDomainData(dataArray) {
    const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    const vol = this.muted ? 0 : this.volume;
    const count = dataArray.length;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 4 + t * 5;
      const wave = Math.sin(angle) * 35 * vol + Math.sin(angle * 2.5) * 15 * vol;
      dataArray[i] = Math.min(255, Math.max(0, Math.floor(128 + wave)));
    }
  }

  /**
   * Get FFT frequency data for real-time visualizers
   * @param {Uint8Array} dataArray
   */
  getByteFrequencyData(dataArray) {
    if (this.isPlaying) {
      if (this.analyser) {
        this.analyser.getByteFrequencyData(dataArray);
      }
      if (this.isRadio) {
        let hasData = false;
        if (this.analyser) {
          for (let i = 0; i < Math.min(32, dataArray.length); i++) {
            if (dataArray[i] > 0) {
              hasData = true;
              break;
            }
          }
        }
        if (!hasData) {
          this.generateSyntheticRadioFrequencyData(dataArray);
        }
      }
    } else {
      dataArray.fill(0);
    }
  }

  /**
   * Get waveform time-domain data for visualizers
   * @param {Uint8Array} dataArray
   */
  getByteTimeDomainData(dataArray) {
    if (this.isPlaying) {
      if (this.analyser) {
        this.analyser.getByteTimeDomainData(dataArray);
      }
      if (this.isRadio) {
        let hasVariation = false;
        if (this.analyser) {
          for (let i = 0; i < Math.min(32, dataArray.length); i++) {
            if (dataArray[i] !== 128) {
              hasVariation = true;
              break;
            }
          }
        }
        if (!hasVariation) {
          this.generateSyntheticRadioTimeDomainData(dataArray);
        }
      }
    } else {
      dataArray.fill(128);
    }
  }
}

export const audioEngine = new AudioEngine();
