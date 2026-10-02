import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreferences } from '../src/storage/preferences.js';
import { createRigPreferences } from '../src/storage/rig-preferences.js';
import { createLibraryStore } from '../src/library/library-store.js';
import { createLibraryController } from '../src/library/library-controller.js';
const memory = () => { const data = new Map(); return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), data }; };
test('rig preferences merge partial limits, typed isolation fields and supported collision radii', () => {
  const storage = memory();
  const c = { JOINT_LIMITS_STORAGE_KEY: 'limits', JOINT_LIMIT_KEYS: ['arm'], JOINT_LIMITS: { arm: { x: { enabled: false, min: -180, max: 180 }, y: {}, z: {} } },
    ISOLATION_STORAGE_KEY: 'isolation', isolationSettings: { enabled: false, minGroups: 1, maxGroups: 2, weights: {}, jointWeights: {} },
    HAND_COLLISION_RADII_STORAGE_KEY: 'radii', HAND_COLLISION_RADIUS: .1, TORSO_CAPSULES: [{ radius: .2 }], LEG_CAPSULES: [{ radius: .3 }], HEAD_CAPSULES: [{ radius: .4 }] };
  const rig = createRigPreferences(createPreferences(() => storage), c);
  storage.setItem('limits', JSON.stringify({ arm: { x: { max: 90 } }, unknown: {} }));
  rig.loadJointLimits(); assert.equal(c.JOINT_LIMITS.arm.x.min, -180); assert.equal(c.JOINT_LIMITS.arm.x.max, 90);
  storage.setItem('isolation', JSON.stringify({ enabled: true, minGroups: 'wrong', weights: { arms: 2 } }));
  rig.loadIsolationSettings(); assert.equal(c.isolationSettings.enabled, true); assert.equal(c.isolationSettings.minGroups, 1);
  assert.equal(c.isolationSettings.weights.arms, 2);
  storage.setItem('radii', JSON.stringify({ hand: .5, capsules: [.6, .7], legCapsules: ['wrong'], headRadius: .8 }));
  rig.loadHandCollisionRadii(); assert.equal(c.HAND_COLLISION_RADIUS, .5); assert.equal(c.TORSO_CAPSULES[0].radius, .6); assert.equal(c.LEG_CAPSULES[0].radius, .3);
  rig.saveJointLimits(); rig.saveIsolationSettings(); rig.saveHandCollisionRadii();
  assert.equal(JSON.parse(storage.getItem('radii')).headRadius, .8);
});
test('library store reads legacy and v1 envelopes, estimates UTF-16 bytes and saves v1', () => {
  const storage = memory(), warnings = [];
  const store = createLibraryStore({ getStorage: () => storage, getKeys: () => ['a', 'b'], warn: (...args) => warnings.push(args), downloadJSON(){}, alert(){} });
  storage.setItem('a', '[{"id":"old"}]'); assert.equal(store.loadLibraryFromStorage('a')[0].id, 'old');
  storage.setItem('b', '{"v":1,"items":[{"id":"new"}]}'); assert.equal(store.loadLibraryFromStorage('b')[0].id, 'new');
  assert.equal(store.getTotalLibraryStorageBytes(), (storage.getItem('a').length + storage.getItem('b').length) * 2);
  assert.equal(store.saveLibraryToStorage('a', [{ name: 'test' }]), true);
  assert.deepEqual(JSON.parse(storage.getItem('a')), { v: 1, items: [{ name: 'test' }] });
  storage.setItem('b', 'invalid'); assert.deepEqual(store.loadLibraryFromStorage('b'), []); assert.equal(warnings.length, 1);
});
test('failed library writes export the current in-memory items as a backup', () => {
  const downloads = [], alerts = [];
  const store = createLibraryStore({ getStorage: () => ({ setItem(){ throw new Error('quota'); } }), getKeys: () => [], warn(){},
    downloadJSON: (items, name) => downloads.push({ items, name }), alert: message => alerts.push(message) });
  const items = [{ name: 'unsaved' }]; assert.equal(store.saveLibraryToStorage('a', items), false);
  assert.equal(downloads[0].items, items); assert.match(downloads[0].name, /寫入失敗/); assert.equal(alerts.length, 1);
});
test('shared library controller preserves filtering, apply/history, rename, delete and import modes', () => {
  const rendered = [], saved = [], applied = []; let sequence = 0, merge = true;
  const deps = { document: { getElementById: () => ({ textContent: 'empty', appendChild(){} }), createElement: () => ({}) },
    loadLibraryFromStorage: () => [], saveLibraryToStorage: (key, items) => saved.push(structuredClone(items)),
    renderLibList: (items, list, empty, handlers) => rendered.push({ items, handlers }), pushHistory: () => applied.push('history'),
    makeLibId: () => `id${++sequence}`, downloadJSON(){}, sanitizeFilename: value => value, readJSONFile: (value, cb) => cb(value),
    alert(){}, confirm: () => merge, prompt: () => 'renamed' };
  const library = createLibraryController({ storageKey: 'a', emptyElId: 'empty', listElId: 'list', filePrefix: 'pose', itemLabel: 'pose', captureFn: () => ({ angle: 10 }), applyFn: data => applied.push(data.angle) }, deps);
  library.saveCurrent(' Alpha '); library.saveData('Beta', { angle: 20 });
  library.setFilter('alpha'); assert.equal(rendered.at(-1).items.length, 1);
  const { items, handlers } = rendered.at(-1); handlers.apply(items[0]); assert.deepEqual(applied, [10, 'history']);
  handlers.rename(items[0]); assert.equal(library.getItems()[0].name, 'renamed');
  library.setFilter(''); rendered.at(-1).handlers.del(library.getItems()[0]); assert.equal(library.getItems().length, 1);
  library.importOne({ name: 'imported', data: { angle: 30 } }); assert.equal(library.getItems().length, 2);
  library.importAll([{ name: 'merged', data: {} }, null]); assert.equal(library.getItems().length, 3);
  merge = false; library.importAll([{ name: 'replaced', data: {} }]); assert.equal(library.getItems().length, 1);
  assert.equal(library.getItems()[0].name, 'replaced'); assert.equal(saved.at(-1)[0].name, 'replaced');
});
