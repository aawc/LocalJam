import test from "node:test";
import assert from "node:assert/strict";
import { AudioEngine } from "../../src/player/audio-engine.js";
import { CURATED_STATIONS } from "../../src/radio/stations.js";

test("Radio Navigation & Stream State Suite", async (t) => {
  await t.test("AudioEngine supports setStationCatalog and retrieves current catalog", () => {
    const engine = new AudioEngine();
    const stations = [
      { id: "st_1", name: "Station One", streamUrl: "https://stream1.example.org" },
      { id: "st_2", name: "Station Two", streamUrl: "https://stream2.example.org" },
      { id: "st_3", name: "Station Three", streamUrl: "https://stream3.example.org" }
    ];
    engine.setStationCatalog(stations);
    assert.equal(engine.getStationCatalog().length, 3);
  });

  await t.test("audioEngine.next() cycles forward through radio stations when isRadio is true", async () => {
    const engine = new AudioEngine();
    const stations = [
      { id: "st_1", name: "Station One", streamUrl: "https://stream1.example.org" },
      { id: "st_2", name: "Station Two", streamUrl: "https://stream2.example.org" },
      { id: "st_3", name: "Station Three", streamUrl: "https://stream3.example.org" }
    ];
    engine.setStationCatalog(stations);

    let playedStation = null;
    engine.playRadio = async (st) => {
      playedStation = st;
      engine.isRadio = true;
      engine.currentStation = st;
      engine.isPlaying = true;
    };

    // Start on station 1
    await engine.playRadio(stations[0]);
    assert.equal(engine.currentStation.id, "st_1");

    // Advance to station 2
    await engine.next();
    assert.equal(engine.currentStation.id, "st_2");
    assert.equal(playedStation.id, "st_2");

    // Advance to station 3
    await engine.next();
    assert.equal(engine.currentStation.id, "st_3");

    // Advance past end -> circular wrap back to station 1
    await engine.next();
    assert.equal(engine.currentStation.id, "st_1");
  });

  await t.test("audioEngine.previous() cycles backward through radio stations when isRadio is true", async () => {
    const engine = new AudioEngine();
    const stations = [
      { id: "st_1", name: "Station One", streamUrl: "https://stream1.example.org" },
      { id: "st_2", name: "Station Two", streamUrl: "https://stream2.example.org" },
      { id: "st_3", name: "Station Three", streamUrl: "https://stream3.example.org" }
    ];
    engine.setStationCatalog(stations);

    engine.playRadio = async (st) => {
      engine.isRadio = true;
      engine.currentStation = st;
      engine.isPlaying = true;
    };

    // Start on station 1
    await engine.playRadio(stations[0]);

    // Retreat from station 1 -> circular wrap to station 3
    await engine.previous();
    assert.equal(engine.currentStation.id, "st_3");

    // Retreat to station 2
    await engine.previous();
    assert.equal(engine.currentStation.id, "st_2");
  });

  await t.test("AudioEngine tracks streamState during radio playback lifecycle", async () => {
    const engine = new AudioEngine();
    assert.equal(engine.streamState, "idle");

    let states = [];
    engine.subscribe((s) => {
      states.push(s.streamState);
    });

    const station = { id: "st_test", name: "Test Radio", streamUrl: "https://stream.example.org" };
    
    // Mock radioAudio element for Node environment
    engine.radioAudio = {
      src: '',
      volume: 1,
      removeAttribute: () => {},
      play: async () => Promise.resolve(),
      pause: () => {}
    };
    await engine.playRadio(station);
    assert.equal(engine.streamState, "playing");
    assert.ok(states.includes("connecting") || states.includes("playing"));
  });

  await t.test("AudioEngine defines crossfadeDuration getter and setter", () => {
    const engine = new AudioEngine();
    assert.equal(engine.crossfadeDuration, 0);

    engine.setCrossfadeDuration(3.5);
    assert.equal(engine.crossfadeDuration, 3.5);
    assert.equal(engine.crossfadeSeconds, 3.5);

    // Clamped between 0 and 10
    engine.setCrossfadeDuration(20);
    assert.equal(engine.crossfadeDuration, 10);
    engine.setCrossfadeDuration(-5);
    assert.equal(engine.crossfadeDuration, 0);
  });
});
