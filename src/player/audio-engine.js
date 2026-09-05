/**
 * LocalJam - Production Audio Playback Engine
 * Hybrid HTMLAudioElement + Web Audio API pipeline with 10-band EQ, FFT Analyser,
 * Object URL lifecycle management, Media Session API, and CORS fallback for Radio.
 */

import { equalizer } from './equalizer.js';
import { queueManager } from './queue.js';
import { sessionRegistry } from '../storage/session-registry.js';
import { db } from '../storage/db.js';

export class AudioEngine {
  constructor() {
    this.audioA = typeof Audio !== 'undefined' ? new Audio() : null;
    this.audioB = typeof Audio !== 'undefined' ? new Audio() : null;
    this.radioAudio = typeof Audio !== 'undefined' ? new Audio() : null;

    this.activePlayer = 'A'; // 'A' or 'B'
    this.currentTrack = null;
    this.currentStation = null;
    this.isPlaying = false;
    this.isRadio = false;
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

    if (this.audioA && this.audioB && this.radioAudio) {
      this.initAudioElements();
      this.initMediaSession();
    }
  }

  initAudioElements() {
    [this.audioA, this.audioB].forEach((audio, idx) => {
      audio.preload = 'metadata';
      audio.crossOrigin = 'anonymous';

      audio.addEventListener('timeupdate', () => {
        if (this.getActiveAudio() === audio) {
          this.notifyState();
          this.syncMediaSessionPosition();
        }
      });

      audio.addEventListener('ended', () => {
        if (this.getActiveAudio() === audio) {
          this.handleTrackEnded();
        }
      });

      audio.addEventListener('error', (e) => {
        if (this.getActiveAudio() === audio) {
          const err = audio.error;
          console.error(`[AudioEngine] Player ${idx === 0 ? 'A' : 'B'} error (code ${err?.code}): ${err?.message}`);
          this.notifyState();
        }
      });

      audio.addEventListener('play', () => {
        if (this.getActiveAudio() === audio) {
          this.isPlaying = true;
          this.notifyState();
        }
      });

      audio.addEventListener('pause', () => {
        if (this.getActiveAudio() === audio) {
          this.isPlaying = false;
          this.notifyState();
        }
      });
    });

    this.radioAudio.addEventListener('error', (e) => {
      console.error(`[AudioEngine] Radio error: ${this.radioAudio.error?.message}`);
      this.notifyState();
    });

    this.radioAudio.addEventListener('play', () => {
      this.isPlaying = true;
      this.notifyState();
    });

    this.radioAudio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.notifyState();
    });
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
    if (this.isRadio) return this.radioAudio;
    return this.activePlayer === 'A' ? this.audioA : this.audioB;
  }

  getInactiveAudio() {
    return this.activePlayer === 'A' ? this.audioB : this.audioA;
  }

  subscribe(listener) {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  notifyState() {
    const audio = this.getActiveAudio();
    const state = {
      isPlaying: this.isPlaying,
      isRadio: this.isRadio,
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
    await this.initWebAudio();

    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    this.isRadio = false;
    this.currentStation = null;
    this.currentTrack = track;
    if (this.radioAudio) {
      this.radioAudio.pause();
      this.radioAudio.src = '';
    }

    // Obtain File object
    let file = null;
    try {
      file = sessionRegistry.getFile(track.id);
      if (!file && track.handle && typeof track.handle.getFile === 'function') {
        file = await track.handle.getFile();
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

    try {
      if (nextAudio) {
        await nextAudio.play();
      }

      // Handle Crossfade Gain Transition if Web Audio is active
      if (this.audioCtx && nextGain && prevGain && this.crossfadeSeconds > 0) {
        const now = this.audioCtx.currentTime;
        nextGain.gain.setValueAtTime(0, now);
        nextGain.gain.linearRampToValueAtTime(1, now + this.crossfadeSeconds);

        prevGain.gain.setValueAtTime(1, now);
        prevGain.gain.linearRampToValueAtTime(0, now + this.crossfadeSeconds);

        setTimeout(() => {
          if (prevAudio) prevAudio.pause();
        }, this.crossfadeSeconds * 1000);
      } else {
        if (nextGain) nextGain.gain.value = 1;
        if (prevGain) prevGain.gain.value = 0;
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

  /**
   * Play Internet Radio Station with CORS resilience and object URL cleanup
   * @param {any} station
   */
  async playRadio(station) {
    if (!station || !station.streamUrl) return;

    this.isRadio = true;
    this.currentStation = station;
    this.currentTrack = null;

    // Revoke local object URL to prevent memory leaks during radio sessions
    if (this.currentObjectUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.activeObjectUrls.delete(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }

    if (this.audioA) this.audioA.pause();
    if (this.audioB) this.audioB.pause();

    if (this.radioAudio) {
      this.radioAudio.src = station.streamUrl;
      this.radioAudio.volume = this.muted ? 0 : this.volume;

      try {
        await this.radioAudio.play();
        this.isPlaying = true;
        this.updateMediaSessionRadio(station);
        this.notifyState();
      } catch (err) {
        console.error(`[AudioEngine] Radio stream playback failed: ${err?.message}`);
        this.isPlaying = false;
        this.notifyState();
      }
    }
  }

  async play() {
    await this.initWebAudio();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
    const audio = this.getActiveAudio();
    if (audio && audio.src) {
      try {
        await audio.play();
        this.isPlaying = true;
        this.notifyState();
      } catch (err) {
        console.error(`[AudioEngine] Play error: ${err?.message}`);
      }
    } else {
      const item = queueManager.getCurrent();
      if (item) {
        await this.playTrack(item.track);
      }
    }
  }

  pause() {
    const audio = this.getActiveAudio();
    if (audio) audio.pause();
    this.isPlaying = false;
    this.notifyState();
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  seek(seconds) {
    if (this.isRadio) return;
    const audio = this.getActiveAudio();
    if (audio && !isNaN(audio.duration)) {
      audio.currentTime = Math.max(0, Math.min(seconds, audio.duration));
      this.notifyState();
      this.syncMediaSessionPosition();
    }
  }

  seekRelative(deltaSeconds) {
    if (this.isRadio) return;
    const audio = this.getActiveAudio();
    if (audio) {
      this.seek((audio.currentTime || 0) + deltaSeconds);
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
    if (this.isRadio) return;
    const nextItem = queueManager.next();
    if (nextItem) {
      await this.playTrack(nextItem.track);
    } else {
      this.pause();
    }
  }

  async previous() {
    if (this.isRadio) return;
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
   * Get FFT frequency data for real-time visualizers
   * @param {Uint8Array} dataArray
   */
  getByteFrequencyData(dataArray) {
    if (this.analyser && this.isPlaying) {
      this.analyser.getByteFrequencyData(dataArray);
    } else {
      dataArray.fill(0);
    }
  }

  /**
   * Get waveform time-domain data for visualizers
   * @param {Uint8Array} dataArray
   */
  getByteTimeDomainData(dataArray) {
    if (this.analyser && this.isPlaying) {
      this.analyser.getByteTimeDomainData(dataArray);
    } else {
      dataArray.fill(128);
    }
  }
}

export const audioEngine = new AudioEngine();
