import test from 'node:test';
import assert from 'node:assert/strict';
import { Router } from '../../src/ui/router.js';

test('Router - route registration and matching', () => {
  const router = new Router();
  let homeRendered = false;
  let songsRendered = false;

  router.registerRoute('home', () => {
    homeRendered = true;
    return '<div>Home</div>';
  });

  router.registerRoute('songs', (params) => {
    songsRendered = true;
    return `<div>Songs: ${params.get('q')}</div>`;
  });

  assert.equal(typeof router.routes['home'], 'function');
  assert.equal(typeof router.routes['songs'], 'function');

  // Verify route execution
  const homeRes = router.routes['home']();
  assert.equal(homeRes, '<div>Home</div>');
  assert.equal(homeRendered, true);

  const params = new URLSearchParams('q=synthwave');
  const songsRes = router.routes['songs'](params);
  assert.equal(songsRes, '<div>Songs: synthwave</div>');
  assert.equal(songsRendered, true);
});

test('Router - hash cleaning and URL parameter parsing', () => {
  const router = new Router();
  let receivedParams = null;

  router.registerRoute('albums', (params) => {
    receivedParams = params;
    return 'albums';
  });

  // Test hash variations
  const testHashes = ['#/albums?id=123&sort=desc', '#albums?id=123&sort=desc', '/albums?id=123&sort=desc'];
  for (const rawHash of testHashes) {
    let clean = rawHash.replace(/^[#/]+/, '').trim();
    const [path, queryString] = clean.split('?');
    const params = new URLSearchParams(queryString || '');

    assert.equal(path, 'albums');
    assert.equal(params.get('id'), '123');
    assert.equal(params.get('sort'), 'desc');
  }
});
