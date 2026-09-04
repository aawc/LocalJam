import test from 'node:test';
import assert from 'node:assert/strict';
import { QueueManager } from '../../src/player/queue.js';

test('Queue Manager Suite', async (t) => {
  const sampleTracks = [
    { id: 'trk_1', title: 'Track 1', artist: 'Artist A' },
    { id: 'trk_2', title: 'Track 2', artist: 'Artist A' },
    { id: 'trk_3', title: 'Track 3', artist: 'Artist B' },
    { id: 'trk_4', title: 'Track 4', artist: 'Artist B' }
  ];

  await t.test('Sets queue and sets current index', () => {
    const q = new QueueManager();
    q.setQueue(sampleTracks, 1);
    assert.equal(q.items.length, 4);
    assert.equal(q.currentIndex, 1);
    assert.equal(q.getCurrent().track.id, 'trk_2');
  });

  await t.test('Adds track to end and adds track next', () => {
    const q = new QueueManager();
    q.setQueue([sampleTracks[0], sampleTracks[1]], 0);

    // Add to end
    q.add(sampleTracks[2], false);
    assert.equal(q.items.length, 3);
    assert.equal(q.items[2].track.id, 'trk_3');

    // Add next (after current index 0)
    q.add(sampleTracks[3], true);
    assert.equal(q.items.length, 4);
    assert.equal(q.items[1].track.id, 'trk_4');
  });

  await t.test('Removes track and adjusts current index appropriately', () => {
    const q = new QueueManager();
    q.setQueue(sampleTracks, 2); // Current is trk_3 (index 2)

    // Remove item before current index (index 0)
    const firstUid = q.items[0].uid;
    q.remove(firstUid);
    assert.equal(q.items.length, 3);
    assert.equal(q.currentIndex, 1); // shifted left
    assert.equal(q.getCurrent().track.id, 'trk_3');
  });

  await t.test('Reorders tracks in queue', () => {
    const q = new QueueManager();
    q.setQueue(sampleTracks, 0);

    // Move index 3 (trk_4) to index 1
    q.reorder(3, 1);
    assert.equal(q.items[1].track.id, 'trk_4');
    assert.equal(q.items[2].track.id, 'trk_2');
  });

  await t.test('Performs Fisher-Yates shuffle retaining active track at head, and un-shuffle restores original order', () => {
    const q = new QueueManager();
    q.setQueue(sampleTracks, 2); // trk_3 active
    const activeTrackId = q.getCurrent().track.id;

    q.toggleShuffle();
    assert.equal(q.shuffle, true);
    assert.equal(q.getCurrent().track.id, activeTrackId);
    assert.equal(q.currentIndex, 0); // Active track is at index 0

    // Un-shuffle restores order
    q.toggleShuffle();
    assert.equal(q.shuffle, false);
    assert.equal(q.items[0].track.id, 'trk_1');
    assert.equal(q.items[1].track.id, 'trk_2');
    assert.equal(q.items[2].track.id, 'trk_3');
    assert.equal(q.getCurrent().track.id, activeTrackId);
  });

  await t.test('Next and previous respect repeat modes (off, all, one)', () => {
    const q = new QueueManager();
    q.setQueue([sampleTracks[0], sampleTracks[1]], 0);

    // Repeat off: advance to end and stop
    const next1 = q.next();
    assert.equal(next1.track.id, 'trk_2');
    const next2 = q.next();
    assert.equal(next2, null); // Ended

    // Repeat all: wraps around
    q.setRepeat('all');
    const wrapNext = q.next();
    assert.equal(wrapNext.track.id, 'trk_1');

    // Repeat one: stays on same track
    q.setRepeat('one');
    const oneNext = q.next();
    assert.equal(oneNext.track.id, 'trk_1');
  });

  await t.test('Notifies subscribers on queue mutations and allows unsubscribe', () => {
    const q = new QueueManager();
    let notificationCount = 0;
    const unsubscribe = q.subscribe((instance) => {
      assert.equal(instance, q);
      notificationCount++;
    });

    q.setQueue(sampleTracks, 0);
    assert.equal(notificationCount, 1);

    q.add(sampleTracks[0]);
    assert.equal(notificationCount, 2);

    unsubscribe();
    q.clear();
    assert.equal(notificationCount, 2); // Unsubscribed, no further increment
  });
});
