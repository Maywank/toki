import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// .mts marks the actual source as ESM for Node's built-in TypeScript loader,
// without changing Metro's CommonJS package configuration or suppressing warnings.
const fixture = mkdtempSync(join(tmpdir(), 'toki-experience-'));
async function actualModule(name) {
  const target = join(fixture, `${name}.mts`);
  copyFileSync(new URL(`../src/toki/${name}.ts`, import.meta.url), target);
  return import(pathToFileURL(target).href);
}
after(() => rmSync(fixture, { recursive: true, force: true }));
const { InvitationPolicy } = await actualModule('invitation');
const { deviceTitle, emptySaved, parseElapsed, parseFocus, queueSignature, reorderOpenTasks, restoreSaved, sortTasks } = await actualModule('store');

const observation = (changes = {}) => ({ taskKey: '1:task', connected: true, rssi: -52, minutes: 5, maintenance: false, manualDisconnect: false, now: 0, ...changes });
test('short fades and a link that was weak at start do not invite', () => {
  const policy = new InvitationPolicy();
  assert.equal(policy.observe(observation({ rssi: -80 })), null);
  assert.equal(policy.observe(observation({ rssi: -83, now: 100_000 })), null);
  const strong = new InvitationPolicy(); strong.observe(observation());
  assert.equal(strong.observe(observation({ rssi: -80, now: 5_000 })), null);
  assert.equal(strong.observe(observation({ rssi: -68, now: 25_000 })), null);
  assert.equal(strong.observe(observation({ rssi: -80, now: 35_000 })), null);
});
test('sustained relative weakening uses the selected grace and cancels on recovery', () => {
  const policy = new InvitationPolicy(); policy.observe(observation());
  assert.equal(policy.observe(observation({ rssi: -80, now: 5_000 })), null);
  assert.deepEqual(policy.observe(observation({ rssi: -80, now: 35_000 })), { type: 'schedule', seconds: 270 });
  assert.deepEqual(policy.observe(observation({ rssi: -58, now: 40_000 })), { type: 'cancel' });
});
test('gray-zone samples break sustained weakening before a request is scheduled', () => {
  const policy = new InvitationPolicy(); policy.observe(observation());
  policy.observe(observation({ rssi: -80, now: 5_000 }));
  assert.equal(policy.observe(observation({ rssi: -72, now: 40_000 })), null);
  assert.equal(policy.observe(observation({ rssi: -80, now: 45_000 })), null);
});
test('disconnect waits ten minutes; pause, maintenance and deliberate disconnect cancel', () => {
  for (const cancel of [{ taskKey: null }, { maintenance: true }, { manualDisconnect: true }, { minutes: 0 }]) {
    const policy = new InvitationPolicy(); policy.observe(observation({ minutes: 10 }));
    assert.deepEqual(policy.observe(observation({ minutes: 10, connected: false, rssi: undefined, now: 10_000 })), { type: 'schedule', seconds: 600 });
    assert.deepEqual(policy.observe(observation({ minutes: 10, connected: false, now: 20_000, ...cancel })), { type: 'cancel' });
  }
});
test('an invitation is limited to one per run, and a new run may invite', () => {
  const policy = new InvitationPolicy(); policy.observe(observation());
  assert.deepEqual(policy.observe(observation({ connected: false, now: 10_000 })), { type: 'schedule', seconds: 300 });
  policy.observe(observation({ connected: false, now: 310_000 }));
  policy.observe(observation({ now: 320_000 }));
  assert.equal(policy.observe(observation({ connected: false, now: 330_000 })), null);
  policy.observe(observation({ taskKey: null, now: 340_000 }));
  assert.deepEqual(policy.observe(observation({ connected: false, now: 350_000 })), { type: 'schedule', seconds: 300 });
});
const task = (id, order, changes = {}) => ({ id, order, title: id, priority: 2, createdAt: 1, timeSpentSeconds: 0, ...changes });
test('reordering keeps priority and leaves completed history unchanged', () => {
  const tasks = [task('a', 1, { priority: 1 }), task('b', 2, { priority: 3 }), task('done', 0, { completedAt: 10 })];
  const result = reorderOpenTasks(tasks, ['b', 'a']);
  assert.deepEqual(sortTasks(result).map((t) => t.id), ['b', 'a']);
  assert.equal(result[0].priority, 1); assert.equal(result[1].priority, 3);
  assert.deepEqual(result[2], tasks[2]);
  assert.equal(tasks[0].order, 1);
});
test('the four-task queue follows explicit order, excludes done and retains full phone titles', () => {
  const tasks = [task('last', 5), task('important', 2, { priority: 1 }), task('first', 1, { title: 'Café: a longer idea with several small next steps' }), task('done', 0, { completedAt: 10 }), task('third', 3), task('fourth', 4)];
  assert.deepEqual(sortTasks(tasks).map((t) => t.id), ['first', 'important', 'third', 'fourth', 'last']);
  assert.deepEqual(JSON.parse(queueSignature(tasks)).map((pair) => pair[0]), ['first', 'important', 'third', 'fourth']);
  assert.equal(deviceTitle(tasks[2].title).length, 32);
  assert.match(tasks[2].title, /several small next steps$/);
});
test('legacy storage migrates elapsed time while retaining identity, priority and queue', () => {
  const legacy = { ...emptySaved, deviceId: 'known-device', revision: 4, syncedIds: ['abc'], tasks: [task('abc', 1, { priority: 1, timeSpentSeconds: undefined })] };
  const restored = restoreSaved(JSON.stringify(legacy));
  assert.equal(restored.tasks[0].timeSpentSeconds, 0);
  assert.equal(restored.tasks[0].priority, 1);
  assert.equal(restored.deviceId, 'known-device');
  assert.deepEqual(restored.syncedIds, ['abc']);
  assert.deepEqual(restoreSaved(null), emptySaved);
});
test('corrupt storage fails visibly instead of becoming an empty task list', () => {
  for (const raw of ['not json', 'null', '{"tasks":null}', JSON.stringify({ tasks: [task('bad', 0, { timeSpentSeconds: -2 })] }), JSON.stringify({ tasks: [], syncedIds: 'wrong' })]) assert.throws(() => restoreSaved(raw));
});
test('elapsed time and completion remain separate protocol facts', () => {
  assert.deepEqual(parseFocus('F:R:120'), { phase: 'R', elapsedSeconds: 120 });
  assert.deepEqual(parseElapsed('X:0123abcd:120'), { id: '0123abcd', seconds: 120 });
  assert.equal(parseFocus('D:0123abcd'), null);
  assert.equal(parseElapsed('X:notanid:120'), null);
});
