import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../src/history/history-controller.js';
import { createSnapshots } from '../src/history/snapshot.js';
import { createAutosave } from '../src/storage/autosave.js';
import { createProjectFiles } from '../src/storage/project-file.js';
import { AUTOSAVE_KEY, validateProject } from '../src/storage/project-format.js';

test('history bounds, branching, snapshot isolation and playback guard', () => {
  let state = { angles: [0] }, blocked = false;
  const history = createHistory({ capture: () => state, restore: value => { state = value; }, isBlocked: () => blocked, limit: 3 });
  assert.equal(history.undo(), false);
  history.push(); state.angles[0] = 1; history.push(); state.angles[0] = 2; history.push();
  state.angles[0] = 99;
  blocked = true; assert.equal(history.undo(), false); blocked = false;
  assert.equal(history.undo(), true); assert.deepEqual(state, { angles: [1] });
  state.angles[0] = 88;
  history.redo(); assert.deepEqual(state, { angles: [2] });
  history.undo(); state = { angles: [3] }; history.push();
  assert.equal(history.canRedo, false);
  state = { angles: [4] }; history.push();
  history.undo(); history.undo(); assert.deepEqual(state, { angles: [1] });
  assert.equal(history.canUndo, false);
});
test('restoration suppresses reentrant history recording and recovers after exceptions', () => {
  let value = 0, fail = true, history;
  history = createHistory({ capture: () => value, restore: next => { assert.equal(history.push(), false); if (fail) throw new Error('restore failed'); value = next; } });
  history.push(); value = 1; history.push();
  assert.throws(() => history.undo(), /restore failed/);
  assert.equal(history.canUndo, true);
  fail = false; history.undo(); assert.equal(value, 0);
  value = 2; assert.equal(history.push(), true);
});
function storageHarness(){
  const values = new Map(), jobs = new Map(); let id = 0, state = { schemaVersion: 1, keyframes: [{ angles: { arm: [0] } }] }, saved = 0;
  const errors = [];
  const storage = { setItem: (key, value) => values.set(key, value), getItem: key => values.get(key), removeItem: key => values.delete(key) };
  const autosave = createAutosave({ getStorage: () => storage, capture: () => state, onSaved: () => saved++, onError: error => errors.push(error),
    setTimer: (fn, delay) => { assert.equal(delay, 1500); const ticket = ++id; jobs.set(ticket, () => { jobs.delete(ticket); fn(); }); return ticket; }, clearTimer: id => jobs.delete(id) });
  return { autosave, storage, values, jobs, errors, get saved(){ return saved; }, set state(value){ state = value; } };
}
test('autosave debounces edits, captures current state and retains the existing storage key', () => {
  const h = storageHarness();
  h.autosave.schedule(); h.autosave.schedule(); assert.equal(h.jobs.size, 1);
  h.state = { schemaVersion: 1, keyframes: [{ label: 'latest' }] };
  [...h.jobs.values()][0]();
  assert.equal(h.saved, 1); assert.equal(h.autosave.read().keyframes[0].label, 'latest');
  assert.equal(h.values.has(AUTOSAVE_KEY), true);
  h.autosave.schedule(); h.autosave.cancel(); assert.equal(h.jobs.size, 0);
  h.autosave.clear(); assert.equal(h.autosave.read(), null);
});
test('autosave ignores corrupt or incompatible data and reports quota errors without claiming success', () => {
  const h = storageHarness();
  for (const raw of ['bad JSON', '{}', '{"schemaVersion":2,"keyframes":[{}]}']){
    h.values.set(AUTOSAVE_KEY, raw); assert.equal(h.autosave.read(), null);
  }
  h.storage.setItem = () => { throw new Error('quota'); };
  assert.equal(h.autosave.save(), false); assert.equal(h.saved, 0); assert.equal(h.errors.length, 1);
  assert.equal(validateProject({ schemaVersion: 1, keyframes: [], footPlant: { enabled: true } }, { autosave: true }), null);
  assert.equal(validateProject({ schemaVersion: 1, keyframes: [] }), 'empty');
});
test('project import validates and confirms before restore, then records history and schedules saving', () => {
  const events = []; let accepted = true, frames = [{}];
  const files = createProjectFiles({ getKeyframes: () => frames, snapshotTimelineData: () => ({ schemaVersion: 1, keyframes: frames }),
    readJSONFile: (data, cb) => cb(data), restoreTimelineData: () => events.push('restore'), pushHistory: () => events.push('history'),
    scheduleAutoSave: () => events.push('save'), alert: () => events.push('alert'), confirm: () => { events.push('confirm'); return accepted; },
    downloadJSON: (data, name) => { events.push('download'); assert.match(name, /^tutting編舞_\d+\.json$/); assert.equal(data.schemaVersion, 1); } });
  files.importFile({ schemaVersion: 2, keyframes: [{}] }); assert.deepEqual(events, ['alert']);
  events.length = 0; accepted = false; files.importFile({ schemaVersion: 1, keyframes: [{}] }); assert.deepEqual(events, ['confirm']);
  events.length = 0; accepted = true; files.importFile({ schemaVersion: 1, keyframes: [{}] }); assert.deepEqual(events, ['confirm', 'restore', 'history', 'save']);
  events.length = 0; files.exportFile(); frames = []; files.exportFile(); assert.deepEqual(events, ['download', 'alert']);
});
test('history and project snapshots preserve their distinct contracts and independent project data', () => {
  const copy = value => JSON.parse(JSON.stringify(value));
  const c = { poseController: { snapshotTarget: () => ({ arm: [1, 2, 3] }) }, waveClone: copy, cleanWave: copy, cleanLAPath: copy,
    waveClips: [], waveConfig: {}, laPathConfig: {}, keyframes: [{ angles: { arm: [1, 2, 3] } }], grooveSequence: [],
    kfEditingIndex: 0, poseIndex: -1, kfPendingEasing: 'linear', kfPendingBeats: .5, TRAJ_MODE: { rArm: 'linear' }, TRAJ_CLOSED: { rArm: false },
    bpm: 120, grooveJointSet: new Set(['arm']), grooveCustomParams: {}, grooveSquatEnabled: false, grooveSquatCustom: {},
    grooveWarmupEnabled: true, grooveWarmupBeats: 1.5, grooveWarmupCurve: 'linear', IK_LIMB_KEYS: ['rArm'],
    trajPointMeshes: { rArm: [{ position: { x: 1, y: 2, z: 3 } }] } };
  for (const name of ['snapshotTG', 'snapshotGenerationRules', 'snapshotTorsoLookAt', 'snapshotHandAim', 'snapshotPoleEditor', 'snapshotFootPlant']) c[name] = () => ({});
  const snapshots = createSnapshots(c), history = snapshots.captureHistory(), project = snapshots.captureProject();
  assert.equal(history.target.arm[0], 1); assert.equal('bpm' in history, false);
  assert.equal(project.schemaVersion, 1); assert.deepEqual(project.trajPoints.rArm, [{ x: 1, y: 2, z: 3 }]);
  assert.deepEqual(project.grooveJoints, ['arm']); assert.equal('target' in project, false);
  project.keyframes[0].angles.arm[0] = 99; assert.equal(c.keyframes[0].angles.arm[0], 1);
  c.bpm = 90; assert.equal(snapshots.captureProject().bpm, 90);
});
