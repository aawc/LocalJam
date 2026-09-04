/**
 * LocalJam - Playback Queue Manager
 * Manages playback queue, track sequencing, Fisher-Yates shuffle, repeat modes, and persistence.
 */

export class QueueManager {
  constructor() {
    /** @type {Array<{ uid: string, trackId: string, track: any }>} */
    this.items = [];
    /** @type {Array<{ uid: string, trackId: string, track: any }>} */
    this.unshuffledItems = [];
    this.currentIndex = -1;
    this.shuffle = false;
    /** @type {'off'|'all'|'one'} */
    this.repeat = 'off';
    /** @type {Set<Function>} */
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this);
      } catch (err) {
        console.error(`[QueueManager] Listener error: ${err?.message}`);
      }
    }
  }

  /**
   * Set a new playlist or track list into the queue
   * @param {Array<any>} tracks
   * @param {number} startIndex
   */
  setQueue(tracks, startIndex = 0) {
    if (!tracks || tracks.length === 0) {
      this.clear();
      return;
    }

    const items = tracks.map((track, i) => ({
      uid: 'q_' + Date.now().toString(36) + '_' + i + '_' + Math.random().toString(36).slice(2, 6),
      trackId: track.id,
      track
    }));

    this.unshuffledItems = [...items];
    this.items = [...items];
    this.currentIndex = Math.max(0, Math.min(startIndex, items.length - 1));

    if (this.shuffle) {
      this.applyShuffle();
    }

    this.notify();
  }

  /**
   * Add a single track or array of tracks
   * @param {any|Array<any>} trackOrTracks
   * @param {boolean} playNext - If true, insert right after current index
   */
  add(trackOrTracks, playNext = false) {
    const newTracks = Array.isArray(trackOrTracks) ? trackOrTracks : [trackOrTracks];
    if (newTracks.length === 0) return;

    const newItems = newTracks.map((track, i) => ({
      uid: 'q_' + Date.now().toString(36) + '_' + (this.items.length + i) + '_' + Math.random().toString(36).slice(2, 6),
      trackId: track.id,
      track
    }));

    if (this.items.length === 0) {
      this.items = [...newItems];
      this.unshuffledItems = [...newItems];
      this.currentIndex = 0;
    } else if (playNext) {
      const insertAt = this.currentIndex + 1;
      this.items.splice(insertAt, 0, ...newItems);
      this.unshuffledItems.splice(insertAt, 0, ...newItems);
    } else {
      this.items.push(...newItems);
      this.unshuffledItems.push(...newItems);
    }

    this.notify();
  }

  remove(uid) {
    const index = this.items.findIndex((item) => item.uid === uid);
    if (index === -1) return;

    this.items.splice(index, 1);
    this.unshuffledItems = this.unshuffledItems.filter((item) => item.uid !== uid);

    if (this.items.length === 0) {
      this.currentIndex = -1;
    } else if (index < this.currentIndex) {
      this.currentIndex--;
    } else if (this.currentIndex >= this.items.length) {
      this.currentIndex = this.items.length - 1;
    }

    this.notify();
  }

  reorder(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= this.items.length || toIndex < 0 || toIndex >= this.items.length) return;
    if (fromIndex === toIndex) return;

    const [moved] = this.items.splice(fromIndex, 1);
    this.items.splice(toIndex, 0, moved);

    if (this.currentIndex === fromIndex) {
      this.currentIndex = toIndex;
    } else if (fromIndex < this.currentIndex && toIndex >= this.currentIndex) {
      this.currentIndex--;
    } else if (fromIndex > this.currentIndex && toIndex <= this.currentIndex) {
      this.currentIndex++;
    }

    this.notify();
  }

  clear() {
    this.items = [];
    this.unshuffledItems = [];
    this.currentIndex = -1;
    this.notify();
  }

  toggleShuffle() {
    this.shuffle = !this.shuffle;
    if (this.shuffle) {
      this.applyShuffle();
    } else {
      // Restore original order
      const currentItem = this.getCurrent();
      this.items = [...this.unshuffledItems];
      if (currentItem) {
        const found = this.items.findIndex((item) => item.uid === currentItem.uid);
        this.currentIndex = found !== -1 ? found : 0;
      }
    }
    this.notify();
    return this.shuffle;
  }

  applyShuffle() {
    if (this.items.length <= 1) return;
    const currentItem = this.getCurrent();
    const remaining = this.items.filter((item) => !currentItem || item.uid !== currentItem.uid);

    // Fisher-Yates shuffle on remaining
    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = remaining[i];
      remaining[i] = remaining[j];
      remaining[j] = temp;
    }

    if (currentItem) {
      this.items = [currentItem, ...remaining];
      this.currentIndex = 0;
    } else {
      this.items = remaining;
      this.currentIndex = 0;
    }
  }

  setRepeat(mode) {
    if (mode === 'off' || mode === 'all' || mode === 'one') {
      this.repeat = mode;
      this.notify();
    }
  }

  cycleRepeat() {
    if (this.repeat === 'off') this.repeat = 'all';
    else if (this.repeat === 'all') this.repeat = 'one';
    else this.repeat = 'off';
    this.notify();
    return this.repeat;
  }

  getCurrent() {
    if (this.currentIndex >= 0 && this.currentIndex < this.items.length) {
      return this.items[this.currentIndex];
    }
    return null;
  }

  next() {
    if (this.items.length === 0) return null;

    if (this.repeat === 'one') {
      return this.getCurrent();
    }

    if (this.currentIndex + 1 < this.items.length) {
      this.currentIndex++;
      this.notify();
      return this.getCurrent();
    }

    if (this.repeat === 'all') {
      this.currentIndex = 0;
      this.notify();
      return this.getCurrent();
    }

    return null; // Reached end of queue with repeat off
  }

  previous(allowSeekRewind = false, currentSeconds = 0) {
    if (this.items.length === 0) return null;

    // If more than 3 seconds in, allow rewinding current track
    if (allowSeekRewind && currentSeconds > 3) {
      return this.getCurrent();
    }

    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.notify();
      return this.getCurrent();
    }

    if (this.repeat === 'all') {
      this.currentIndex = this.items.length - 1;
      this.notify();
      return this.getCurrent();
    }

    return this.getCurrent();
  }

  jumpTo(index) {
    if (index >= 0 && index < this.items.length) {
      this.currentIndex = index;
      this.notify();
      return this.getCurrent();
    }
    return null;
  }
}

export const queueManager = new QueueManager();
