import test from 'node:test';
import assert from 'node:assert/strict';
import { createStationModal } from '../../src/ui/components/station-modal.js';

test('Radio Station Details Modal Suite', async (t) => {
  const prevDoc = globalThis.document;
  try {
    const listeners = {};
    const createdElements = [];

    globalThis.document = {
      activeElement: null,
      createElement: (tag) => {
        const children = [];
        const elementMap = {};

        const el = {
          tagName: tag.toUpperCase(),
          id: '',
          className: '',
          style: { display: 'none' },
          innerHTML: '',
          value: '',
          dataset: {},
          querySelector: (sel) => {
            if (sel === '#station-modal-title') return { textContent: '' };
            if (sel === '#station-modal-subtitle') return { textContent: '' };
            if (sel === '#station-modal-description') return { textContent: '' };
            if (sel === '#station-modal-genre') return { textContent: '' };
            if (sel === '#station-modal-country') return { textContent: '' };
            if (sel === '#station-modal-bitrate') return { textContent: '' };
            if (sel === '#station-modal-pipeline') return { textContent: '' };
            if (sel === '#station-modal-favicon') return { src: '' };
            if (sel === '#station-modal-url-input') return { value: '', select: () => {} };
            if (sel === '#btn-copy-stream-url') return { addEventListener: (evt, fn) => { listeners['copy'] = fn; } };
            if (sel === '#station-copy-feedback') return { style: { display: 'none' } };
            if (sel === '#station-modal-homepage-link') return { href: '', style: { display: 'none' } };
            if (sel === '#btn-modal-star') return { textContent: '', style: {}, addEventListener: (evt, fn) => { listeners['star'] = fn; } };
            if (sel === '#btn-modal-eq') return { addEventListener: (evt, fn) => { listeners['eq'] = fn; } };
            if (sel === '#btn-modal-viz') return { addEventListener: (evt, fn) => { listeners['viz'] = fn; } };
            if (sel === '#btn-close-station-modal') return { addEventListener: (evt, fn) => { listeners['close'] = fn; } };
            if (sel === '#btn-done-station-modal') return { addEventListener: (evt, fn) => { listeners['done'] = fn; }, focus: () => {} };
            return null;
          },
          querySelectorAll: () => [],
          appendChild: (c) => children.push(c),
          addEventListener: (evt, fn) => { listeners[evt] = fn; },
          setAttribute: () => {},
          getAttribute: () => null
        };
        createdElements.push(el);
        return el;
      }
    };

    let eqToggled = false;
    let vizToggled = false;

    const modal = createStationModal({
      onToggleEq: () => { eqToggled = true; },
      onToggleViz: () => { vizToggled = true; }
    });

    assert.ok(modal.element);
    assert.equal(typeof modal.open, 'function');
    assert.equal(typeof modal.close, 'function');

    const sampleStation = {
      id: 'soma_defcon',
      name: 'SomaFM: DEF CON Radio',
      description: 'Music for hacking and late-night focus.',
      streamUrl: 'https://ice1.somafm.com/defcon-256-mp3',
      homepageUrl: 'https://somafm.com/defcon/',
      genre: 'Electronic / Industrial',
      country: 'USA',
      bitrate: '256 kbps',
      favicon: 'https://somafm.com/favicon.ico',
      isFavorite: true
    };

    modal.open(sampleStation);
    assert.equal(modal.element.style.display, 'flex');

    // Verify Equalizer shortcut triggers callback and closes modal
    if (listeners['eq']) {
      listeners['eq']();
      assert.equal(eqToggled, true);
      assert.equal(modal.element.style.display, 'none');
    }

    // Re-open and verify Visualizer shortcut
    modal.open(sampleStation);
    assert.equal(modal.element.style.display, 'flex');
    if (listeners['viz']) {
      listeners['viz']();
      assert.equal(vizToggled, true);
      assert.equal(modal.element.style.display, 'none');
    }

    modal.open(sampleStation);
    modal.close();
    assert.equal(modal.element.style.display, 'none');
  } finally {
    globalThis.document = prevDoc;
  }
});
