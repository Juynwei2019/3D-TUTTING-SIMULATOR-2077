import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright-core';

// Test with the real pinned Three.js package and an official, checksum-verified
// r160 Xbot fixture. Production CDN availability is deliberately a separate check.
const modelPath = resolve(process.env.XBOT_FIXTURE || '.cache/Xbot.glb');
let model;
try { model = await readFile(modelPath); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await mkdir(resolve('.cache'), { recursive: true });
  execFileSync('python3', ['-c',
    'import sys, urllib.request; urllib.request.urlretrieve("https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/models/gltf/Xbot.glb", sys.argv[1])',
    modelPath], { stdio: 'inherit' });
  model = await readFile(modelPath);
}
assert.equal(createHash('sha256').update(model).digest('hex'),
  '002f8d269de68e5dce3d25195caf390d1aa359bbfaae3fcf4c8dc78ec36c3ba5', 'Xbot fixture checksum');

// Inject a read/test adapter into the served module only. No debug globals are
// shipped in the source application or in the generated standalone artifact.
const probe = `
window.__smoke = {
  snapshotTimelineData, restoreTimelineData, setTarget, resetPose, mirrorPose,
  pushHistory, undo, redo, applyTimelinePreviewAtElapsed,
  setIKEnabled, solveIKAll, updateBones, deleteKeyframe,
  setKfMultiSelectMode, kfMultiSelectAll, copyTimelineSelection, pasteTimelineClipboard,
  copyBeatGridRange, duplicateBeatGridRange, clearBeatGridRange,
  setRange(start, end){ beatGridRangeStart = start; beatGridRangeEnd = end; updateBeatGridRangeUI(); },
  get bones() { return bones; }, get model() { return model; },
  get target() { return typeof poseController === "undefined" ? target : poseController.snapshotTarget(); },
  get current() { return typeof poseController === "undefined" ? current : poseController.snapshotState().current; },
  get keyframes() { return keyframes; }, get grab() { return grabBoxCore; },
  get playing() { return kfPlaying; },
  get waveRunning() { return !!waveRun; },
};`;
const root = resolve('.');
const filename = 'index.html';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const baseline = url.pathname === '/__baseline.html' && process.env.BASELINE_HTML;
    let data = await readFile(baseline || path);
    if (url.pathname === '/src/main.js') data = Buffer.from(data.toString() + probe);
    if (baseline || url.pathname === `/dist/${filename}`) {
      const html = data.toString();
      const at = html.lastIndexOf('</script>');
      assert.ok(at >= 0);
      data = Buffer.from(html.slice(0, at) + probe + html.slice(at));
    }
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch (error) {
    res.writeHead(500).end(String(error));
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const results = [];
  const pages = process.env.BASELINE_HTML ? ['/__baseline.html'] : [];
  pages.push(`/${filename}`, `/dist/${filename}`);
  for (const entry of pages) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    const page = await context.newPage();
    const errors = [], failedRequests = [], consoleMessages = [];
    page.on('pageerror', e => { errors.push(e.message); console.error(`${entry}: ${e.message}`); });
    page.on('requestfailed', req => failedRequests.push(`${req.url()}: ${req.failure()?.errorText}`));
    page.on('console', message => consoleMessages.push({ type: message.type(), text: message.text() }));
    page.on('dialog', dialog => dialog.accept());
    try {
      await page.route('https://unpkg.com/three@0.160.0/**', async route => {
        const suffix = new URL(route.request().url()).pathname.slice('/three@0.160.0/'.length);
        const path = resolve(root, 'node_modules/three', suffix);
        assert.ok(path.startsWith(resolve(root, 'node_modules/three') + sep));
        await route.fulfill({ body: await readFile(path), contentType: 'text/javascript' });
      });
      await page.route('https://threejs.org/examples/models/gltf/Xbot.glb', route =>
        route.fulfill({ body: model, contentType: 'model/gltf-binary' }));
      await page.goto(baseURL + entry);
      await page.waitForFunction(() => document.getElementById('loading').style.display === 'none', { timeout: 30000 });
      assert.equal(await page.locator('#canvasHolder canvas').count(), 1);
      const initial = await page.evaluate(() => ({
        bones: Object.keys(window.__smoke.bones).length,
        pose: structuredClone(window.__smoke.target),
        scale: window.__smoke.model.scale.toArray(),
        position: window.__smoke.model.position.toArray(),
        ui: getComputedStyle(document.getElementById('ui')).display,
      }));
      assert.equal(initial.bones, 50);
      assert.notEqual(initial.ui, 'none');
      // Drive the actual panel bindings, not just standalone math routines.
      for (const button of await page.locator('.tabBtn').all()) await button.evaluate(el => el.click());
      await page.locator('.tabBtn[data-tab="ik"]').evaluate(el => el.click());
      await page.locator('#ikBtn_rArm').click();
      assert.ok(await page.locator('#ikBtn_rArm').evaluate(el => el.classList.contains('active')));
      await page.locator('.tabBtn[data-tab="grabBox"]').evaluate(el => el.click());
      await page.locator('#grabVisibleBtn').evaluate(el => {
        for (let parent = el.parentElement; parent; parent = parent.parentElement) {
          if (parent.tagName === 'DETAILS') parent.open = true;
        }
      });
      await page.locator('#grabVisibleBtn').click();
      await page.locator('#grabHandCb_rArm').check();
      const grabbed = await page.evaluate(() => {
        const app = window.__smoke;
        app.grab.updateEachFrame(); app.solveIKAll();
        return app.grab.getState();
      });
      assert.equal(grabbed.grabbed.rArm, true);
      await page.locator('[data-shape="sphere"]').click();
      assert.equal(await page.evaluate(() => window.__smoke.grab.getState().shapeType), 'sphere');
      await page.locator('#grabVisibleBtn').click();
      assert.equal(await page.locator('#grabHandCb_rArm').isChecked(), false);
      await page.locator('.tabBtn[data-tab="ik"]').evaluate(el => el.click());
      await page.locator('#ikBtn_rArm').click();
      // Exercise the pose adapters shared by JSON, mirror, generation and Wave.
      await page.locator('.tabBtn[data-tab="json"]').evaluate(el => el.click());
      await page.locator('#jsonArea').fill(JSON.stringify({ rForeArm: [10, 20, 30], rThumb1: [5, 10, 15] }));
      await page.locator('#applyJsonBtn').click();
      assert.deepEqual(await page.evaluate(() => window.__smoke.target.rForeArm), [10, 20, 30]);
      assert.deepEqual(await page.evaluate(() => window.__smoke.target.rThumb1), [5, 10, 15]);
      await page.locator('#mirrorBtn').click();
      const mirrored = await page.evaluate(() => structuredClone(window.__smoke.target));
      await page.locator('#symmetrizeBtn').click();
      const symmetric = await page.evaluate(() => structuredClone(window.__smoke.target));
      await page.locator('#resetBtn').click();
      await page.locator('.tabBtn[data-tab="tuttingGen"]').evaluate(el => el.click());
      const beforePreview = await page.evaluate(() => structuredClone(window.__smoke.target));
      await page.locator('#tgCapture').click();
      await page.locator('#tgGenerate').click();
      await page.locator('#tgPreviewBtn').click();
      assert.deepEqual(await page.evaluate(() => window.__smoke.target), beforePreview);
      await page.locator('#tgApply').click();
      const generated = await page.evaluate(() => structuredClone(window.__smoke.target));
      assert.notDeepEqual(generated, beforePreview);
      await page.locator('#resetBtn').click();
      await page.locator('.tabBtn[data-tab="waving"]').evaluate(el => el.click());
      const beforeWave = await page.evaluate(() => structuredClone(window.__smoke.target));
      await page.locator('#wavePlay').click();
      assert.equal(await page.evaluate(() => window.__smoke.waveRunning), true);
      await page.locator('#wavePause').click();
      await page.locator('#waveStop').click();
      assert.equal(await page.evaluate(() => window.__smoke.waveRunning), false);
      assert.deepEqual(await page.evaluate(() => window.__smoke.target), beforeWave);
      await page.evaluate(() => {
        const app = window.__smoke;
        app.resetPose(); app.pushHistory();
        app.setTarget('rForeArm', [10, 20, 30]); app.pushHistory();
        app.undo();
      });
      assert.deepEqual(await page.evaluate(() => window.__smoke.target.rForeArm), [0, 0, 0]);
      await page.evaluate(() => window.__smoke.redo());
      assert.deepEqual(await page.evaluate(() => window.__smoke.target.rForeArm), [10, 20, 30]);
      // Save and apply through the shared pose/gesture library controllers.
      await page.locator('.tabBtn[data-tab="poseLib"]').evaluate(el => el.click());
      await page.locator('#poseLibNameInput').fill('smoke pose');
      await page.locator('#poseLibSaveBtn').click();
      await page.locator('.tabBtn[data-tab="gestureLib"]').evaluate(el => el.click());
      await page.locator('#gestureLibNameInput').fill('smoke gesture');
      await page.locator('#gestureLibSaveBtn').click();
      await page.locator('.tabBtn[data-tab="poseLib"]').evaluate(el => el.click());
      await page.evaluate(() => window.__smoke.setTarget('rForeArm', [0, 0, 0]));
      await page.locator('#poseLibList .sel').first().evaluate(el => el.click());
      assert.deepEqual(await page.evaluate(() => window.__smoke.target.rForeArm), [10, 20, 30]);
      const libraryData = await page.evaluate(() => ({
        pose: JSON.parse(localStorage.getItem('tuttingPoseLibrary_v1')),
        gesture: JSON.parse(localStorage.getItem('tuttingGestureLibrary_v1')),
      }));
      assert.equal(libraryData.pose.v, 1); assert.equal(libraryData.gesture.v, 1);
      assert.equal(libraryData.pose.items[0].name, 'smoke pose');
      assert.equal('rThumb1' in libraryData.pose.items[0].data, false);
      assert.equal('rForeArm' in libraryData.gesture.items[0].data, false);
      // Add, play and persist an actual two-pose timeline.
      await page.locator('.tabBtn[data-tab="keyframe"]').evaluate(el => el.click());
      await page.locator('#kfAddBtn').click();
      await page.evaluate(() => { window.__smoke.setTarget('rForeArm', [-20, 10, 45]); });
      await page.locator('#kfAddBtn').click();
      assert.equal(await page.locator('#kfList .kfChip').count(), 2);
      await page.evaluate(() => {
        const app = window.__smoke;
        app.pushHistory();
        app.setKfMultiSelectMode(true); app.kfMultiSelectAll();
        if (!app.copyTimelineSelection() || !app.pasteTimelineClipboard()) throw new Error('multi-select paste failed');
      });
      assert.equal(await page.locator('#kfList .kfChip').count(), 4);
      await page.evaluate(() => { window.__smoke.undo(); window.__smoke.setKfMultiSelectMode(false); });
      assert.equal(await page.locator('#kfList .kfChip').count(), 2);
      await page.evaluate(() => {
        const app = window.__smoke;
        app.setRange(.25, .75);
        if (!app.copyBeatGridRange() || !app.duplicateBeatGridRange()) throw new Error('range duplicate failed');
      });
      assert.equal(await page.locator('#kfList .kfChip').count(), 4);
      await page.evaluate(() => { window.__smoke.undo(); window.__smoke.clearBeatGridRange(); });
      assert.equal(await page.locator('#kfList .kfChip').count(), 2);
      // Exercise the extracted clip UI, then restore the two-frame test timeline.
      // Compact clips hide this button; dispatch its editing callback directly.
      await page.locator('#kfList .kfChip .dup').first().evaluate(el => el.click());
      assert.equal(await page.locator('#kfList .kfChip').count(), 3);
      const duplicated = await page.evaluate(() => structuredClone(window.__smoke.keyframes));
      assert.deepEqual(duplicated[0], duplicated[1]);
      await page.evaluate(() => window.__smoke.deleteKeyframe(1));
      assert.equal(await page.locator('#kfList .kfChip').count(), 2);
      // Real PCM WAV exercises media events and Web Audio decoding without a CDN.
      const samples = 8000 * 4;
      const wav = Buffer.alloc(44 + samples * 2);
      wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
      wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
      wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
      wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
      wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
      await page.locator('#kfMusicFile').setInputFiles({ name: 'smoke.wav', mimeType: 'audio/wav', buffer: wav });
      await page.waitForFunction(() => document.getElementById('kfAudioEl').readyState >= 2 &&
        !document.getElementById('beatGridWaveformTrack').classList.contains('waveformLoading'));
      assert.equal(await page.locator('#beatGridWaveformTrack').evaluate(el => el.classList.contains('waveformError')), false);
      assert.equal(await page.locator('#kfMusicName').textContent(), 'smoke.wav');
      await page.locator('#kfMusicPreviewBtn').evaluate(el => el.click());
      await page.waitForFunction(() => !document.getElementById('kfAudioEl').paused);
      await page.locator('#kfMusicPreviewBtn').evaluate(el => el.click());
      await page.waitForFunction(() => document.getElementById('kfAudioEl').paused);
      await page.locator('#kfLoopBtn').click();
      await page.locator('#kfPlayBtn').click();
      assert.equal(await page.evaluate(() => window.__smoke.playing), true);
      await page.waitForFunction(() => !document.getElementById('kfAudioEl').paused);
      await page.locator('#kfPlayBtn').click();
      assert.equal(await page.evaluate(() => window.__smoke.playing), false);
      await page.locator('#kfLoopBtn').click();
      assert.equal(await page.locator('#kfAudioEl').evaluate(el => el.paused), true);
      await page.locator('#kfMusicRemoveBtn').evaluate(el => el.click());
      assert.equal(await page.locator('#kfAudioEl').getAttribute('src'), null);
      assert.equal(await page.locator('#kfMusicName').textContent(), '尚未匯入音樂');
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#kfExportBtn').click()]);
      const exported = JSON.parse((await readFile(await download.path())).toString());
      assert.equal(exported.keyframes.length, 2);
      assert.equal(exported.schemaVersion, 1);
      const imported = structuredClone(exported);
      imported.keyframes[0].label = 'smoke roundtrip';
      await page.locator('#kfImportFile').setInputFiles({ name: 'roundtrip.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
      await page.waitForFunction(() => window.__smoke.keyframes[0]?.label === 'smoke roundtrip');
      const roundtrip = await page.evaluate(() => window.__smoke.snapshotTimelineData());
      assert.deepEqual(roundtrip.keyframes, imported.keyframes);
      // Drive the frame interpolator at a fixed time for a deterministic comparison.
      const interpolation = await page.evaluate(() => {
        const app = window.__smoke;
        app.applyTimelinePreviewAtElapsed(200);
        return Object.fromEntries(Object.entries(app.bones).map(([key, bone]) => [key, bone.quaternion.toArray()]));
      });
      await page.locator('#showPerfPanelChk').evaluate(el => el.click());
      await page.locator('#splitChk_front').evaluate(el => el.click());
      await page.waitForTimeout(350);
      assert.equal(await page.locator('#splitViewPanes canvas').count(), 1);
      await page.locator('#splitChk_front').evaluate(el => el.click());
      assert.equal(await page.locator('#splitViewPanes canvas').count(), 0);
      await page.waitForFunction(() => {
        const saved = JSON.parse(localStorage.getItem('tuttingAutosave_v1') || 'null');
        return saved?.keyframes?.length === 2 && saved.keyframes[0].label === 'smoke roundtrip';
      });
      await page.reload();
      await page.waitForFunction(() => document.getElementById('loading').style.display === 'none');
      assert.equal(await page.locator('#kfList .kfChip').count(), 2);
      assert.equal(await page.locator('#poseLibList .libChip').count(), 1);
      assert.equal(await page.locator('#gestureLibList .libChip').count(), 1);
      assert.deepEqual(errors, [], `${entry} JavaScript errors`);
      assert.deepEqual(failedRequests, [], `${entry} failed requests`);
      results.push({ initial, mirrored, symmetric, generated, keyframes: exported.keyframes, interpolation });
      await context.tracing.stop();
      console.log(`PASS ${entry}: model, all tabs, IK, grab, JSON pose, mirror/symmetry, Tutting preview/commit, Wave restore, history, libraries, clipboard/range editing, clip editing, timeline/audio playback, waveform decode, JSON roundtrip, split view, autosave reload`);
    } catch (error) {
      const directory = resolve('test-results', entry.replace(/^\//, '').replace(/[^a-zA-Z0-9_.-]/g, '_'));
      await mkdir(directory, { recursive: true });
      // Preserve the original test error even if the browser has crashed and
      // cannot provide one of the diagnostic files.
      const captures = await Promise.allSettled([
        page.screenshot({ path: resolve(directory, 'failure.png'), timeout: 5000 }),
        context.tracing.stop({ path: resolve(directory, 'trace.zip') }),
        writeFile(resolve(directory, 'diagnostics.json'), JSON.stringify({
          entry, error: error.stack || String(error), errors, failedRequests, consoleMessages,
        }, null, 2)),
      ]);
      for (const result of captures) if (result.status === 'rejected') console.error('Diagnostic capture failed:', result.reason);
      throw error;
    } finally {
      await context.close();
    }
  }
  for (const result of results.slice(1)) assert.deepEqual(result, results[0], 'original, modular and standalone behavior must agree');
  console.log(`PASS ${results.length} versions produce identical initial poses, keyframes and sampled bone rotations`);
} catch (error) {
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/failure.txt', error.stack || String(error));
  throw error;
} finally {
  await browser?.close();
  server.close();
}
