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
  setIKEnabled, setFingerIKEnabled, setEffectorOrientEnabled:(...args)=>limbController.setEffectorOrientEnabled(...args), setLookAtEnabled, solveHandAim, solveIKAll, updateBones, deleteKeyframe,
  setKfMultiSelectMode, kfMultiSelectAll, copyTimelineSelection, pasteTimelineClipboard,
  copyBeatGridRange, duplicateBeatGridRange, clearBeatGridRange,
  setRange(start, end){ beatGridRangeStart = start; beatGridRangeEnd = end; updateBeatGridRangeUI(); },
  get bones() { return bones; }, get model() { return model; }, get scene(){return scene;},
  get fingerTut(){return fingerTutController;},
  get camera() { return camera; }, get controls() { return controls; },
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
      // Camera presets and floating panel bindings remain functional after extraction.
      const cameraBefore = await page.evaluate(() => window.__smoke.camera.position.toArray());
      await page.locator('#camSelect').selectOption('right');
      await page.waitForTimeout(650);
      assert.notDeepEqual(await page.evaluate(() => window.__smoke.camera.position.toArray()), cameraBefore);
      await page.locator('#camSelect').selectOption('front');
      await page.waitForTimeout(650);
      await page.locator('#uiFloatBtn').click();
      assert.ok(await page.locator('#ui').evaluate(el => el.classList.contains('uiFloating')));
      const handle = await page.locator('#uiDragHandle').boundingBox();
      const panelBefore = await page.locator('#ui').boundingBox();
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
      await page.mouse.down();
      await page.mouse.move(handle.x + handle.width / 2 + 40, handle.y + handle.height / 2 + 20, { steps: 5 });
      await page.mouse.up();
      const panelAfter = await page.locator('#ui').boundingBox();
      assert.ok(Math.abs(panelAfter.x - panelBefore.x) > 5 || Math.abs(panelAfter.y - panelBefore.y) > 5);
      await page.locator('#uiFloatBtn').click();
      assert.equal(await page.locator('#ui').evaluate(el => el.classList.contains('uiFloating')), false);
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
      // New commands use the real UI and preserve the preexisting arm IK workspace.
      await page.locator('.tabBtn[data-tab="grabBox"]').evaluate(el=>el.click());
      await page.evaluate(()=>window.__smoke.setFingerIKEnabled('rIndex',true));
      await page.waitForTimeout(150);
      const beforeQuick=await page.evaluate(()=>window.__smoke.grab.snapshot());
      const gestureBefore=await page.evaluate(()=>Object.fromEntries(Object.entries(window.__smoke.target).filter(([key])=>/^(r|l)(Thumb|Index|Middle|Ring|Pinky)/.test(key))));
      await page.locator('#grabPresetSides').click();
      assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(window.__smoke.target).filter(([key])=>/^(r|l)(Thumb|Index|Middle|Ring|Pinky)/.test(key)))),gestureBefore);
      const quick=await page.evaluate(()=>window.__smoke.grab.snapshot());
      assert.equal(quick.visible,true);assert.equal(quick.preset,'sides');
      assert.equal(beforeQuick.rig.fingers.rIndex.enabled,true);
      assert.equal(quick.rig.fingers.rIndex.enabled,false);
      assert.deepEqual(quick.grabbed,{rArm:true,lArm:true});
      assert.equal(quick.rig.arms.rArm.enabled,true);assert.equal(quick.rig.arms.lArm.enabled,true);
      assert.equal(await page.locator('#grabPresetSides').getAttribute('aria-pressed'),'true');
      await page.evaluate(()=>window.__smoke.undo());
      assert.deepEqual(await page.evaluate(()=>window.__smoke.grab.snapshot()),beforeQuick);
      await page.evaluate(()=>window.__smoke.redo());
      assert.deepEqual(await page.evaluate(()=>window.__smoke.grab.snapshot()),quick);
      await page.evaluate(()=>window.__smoke.setEffectorOrientEnabled('rArm',true));
      await page.locator('#grabPalmAlign').check();
      for(const shape of ['box','sphere','cylinder']){
        await page.locator(`#grabShapeBtns [data-shape="${shape}"]`).click();
        await page.locator('#grabResetDimensions').click();
        for(const preset of ['Sides','Bottom']){
          await page.locator('#grabPreset'+preset).click();
          await page.waitForTimeout(200);
          const contact=await page.evaluate(()=>{
            const app=window.__smoke,s=app.grab.snapshot(),mesh=app.scene.getObjectByName('grabBoxMesh');
            return Object.fromEntries(['rArm','lArm'].map(limb=>{
              const expected=mesh.position.clone().fromArray(s.grabLocal[limb]).applyMatrix4(mesh.matrixWorld);
              const actual=app.bones[limb==='rArm'?'rHand':'lHand'].getWorldPosition(mesh.position.clone());
              return [limb,actual.distanceTo(expected)];
            }));
          });
          assert.ok(contact.rArm<.005&&contact.lArm<.005,`${shape} ${preset}: both hand bones reach the surface: ${JSON.stringify(contact)}`);
          const scores=await page.evaluate(()=>{
            const a=window.__smoke,s=a.grab.snapshot(),m=a.scene.getObjectByName('grabBoxMesh'),rotation=m.getWorldQuaternion(m.quaternion.clone());
            return ['r','l'].map(side=>{
              const point=m.position.clone().fromArray(s.grabLocal[side+'Arm']);
              const normal=s.preset==='sides'?point.clone().set(point.x<0?-1:1,0,0):s.shapeType==='sphere'?point.clone().normalize():point.clone().set(0,-1,0);
              normal.applyQuaternion(rotation).negate();
              const origin=a.bones[side+'Hand'].getWorldPosition(point.clone());
              const finger=a.bones[side+'Middle1'].getWorldPosition(point.clone()).sub(origin).normalize();
              const across=a.bones[side+'Index1'].getWorldPosition(point.clone()).sub(a.bones[side+'Pinky1'].getWorldPosition(point.clone()));
              const palm=across.cross(finger).normalize().multiplyScalar(side==='r'?-1:1);
              return palm.dot(normal);
            });
          });
          assert.ok(scores.every(v=>v>.999),`${shape} ${preset}: both palms align despite preexisting effector orientation: ${scores}`);

        }
      }
      await page.evaluate(()=>{const mesh=window.__smoke.scene.getObjectByName('grabBoxMesh');mesh.position.set(.2,1,.4);mesh.rotation.set(.2,.4,.1);});
      const moved=await page.evaluate(()=>window.__smoke.grab.snapshot());
      await page.locator('#grabRecenter').click();
      const centered=await page.evaluate(()=>window.__smoke.grab.snapshot());
      assert.deepEqual(centered.quaternion,moved.quaternion);assert.notDeepEqual(centered.position,moved.position);
      await page.locator('#grabResetRotation').click();
      const rotated=await page.evaluate(()=>window.__smoke.grab.snapshot());
      assert.deepEqual(rotated.position,centered.position);assert.notDeepEqual(rotated.quaternion,centered.quaternion);
      await page.locator('#grabParam_cylinder_r').fill('0.25');
      await page.locator('#grabResetDimensions').click();
      assert.equal(await page.locator('#grabParamVal_cylinder_r').textContent(),'0.14');
      await page.evaluate(()=>window.__smoke.undo());
      assert.equal(await page.locator('#grabParamVal_cylinder_r').textContent(),'0.25');
      await page.evaluate(()=>window.__smoke.redo());
      const protectedAim=await page.evaluate(()=>{
        const a=window.__smoke;a.setLookAtEnabled('rHand',true);
        const before=a.bones.rHand.quaternion.clone();a.solveHandAim('rHand');
        return before.angleTo(a.bones.rHand.quaternion);
      });
      assert.ok(protectedAim<1e-7,'existing hand aim is suspended for an aligned attached palm');
      await page.locator('#grabPalmTwist_rArm').fill('35');
      await page.locator('#grabPalmTwist_rArm').dispatchEvent('change');
      assert.equal(await page.locator('#grabPalmTwistValue_rArm').textContent(),'35°');
      assert.equal(await page.locator('#grabPalmTwistValue_lArm').textContent(),'0°');
      await page.evaluate(()=>window.__smoke.undo());
      assert.equal(await page.locator('#grabPalmTwistValue_rArm').textContent(),'0°');
      await page.evaluate(()=>window.__smoke.redo());
      assert.equal(await page.locator('#grabPalmTwistValue_rArm').textContent(),'35°');
      // A continuous size gesture commits once, including focused-slider restoration.
      await page.locator('#grabParam_cylinder_r').evaluate(el=>{
        el.focus();for(const v of [.18,.21,.24]){el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));}
        el.dispatchEvent(new Event('change',{bubbles:true}));
      });
      await page.evaluate(()=>window.__smoke.undo());
      assert.equal(await page.locator('#grabParam_cylinder_r').inputValue(),'0.14');
      await page.evaluate(()=>window.__smoke.redo());
      assert.equal(await page.locator('#grabParam_cylinder_r').inputValue(),'0.24');
      await page.locator('#grabHandCb_rArm').uncheck();
      await page.evaluate(()=>window.__smoke.undo());assert.equal(await page.locator('#grabHandCb_rArm').isChecked(),true);
      await page.evaluate(()=>window.__smoke.redo());assert.equal(await page.locator('#grabHandCb_rArm').isChecked(),false);
      await page.locator('#grabHandCb_rArm').check();
      await page.evaluate(()=>{
        const a=window.__smoke,m=a.scene.getObjectByName('grabBoxMesh'),g=a.scene.children.find(x=>x.isTransformControls&&x.object===m);
        g.dispatchEvent({type:'dragging-changed',value:true});m.position.x+=.04;m.rotation.y+=.2;
        g.dispatchEvent({type:'dragging-changed',value:false});
      });
      const workspace=await page.evaluate(()=>window.__smoke.snapshotTimelineData());
      assert.equal(workspace.keyframes.length,0);assert.equal(workspace.grabBox.version,1);
      await page.locator('.tabBtn[data-tab="keyframe"]').evaluate(el=>el.click());
      const [grabDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#kfExportBtn').evaluate(el=>el.click())]);
      const storedGrab=JSON.parse((await readFile(await grabDownload.path())).toString());
      assert.equal(storedGrab.keyframes.length,0);assert.deepEqual(storedGrab.grabBox.position,workspace.grabBox.position);
      await page.evaluate(()=>{const a=window.__smoke;a.grab.setVisible(false);a.grab.setShapeType('box');});
      await page.locator('#kfImportFile').setInputFiles({name:'grab-workspace.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(storedGrab))});
      await page.waitForFunction(()=>window.__smoke.grab.getState().visible&&window.__smoke.grab.getState().shapeType==='cylinder');
      const restoredGrab=await page.evaluate(()=>window.__smoke.grab.snapshot());
      for(const key of ['position','shapeParams','grabbed','palmAligned','palmTwist'])assert.deepEqual(restoredGrab[key],storedGrab.grabBox[key],key+' survives import');
      await page.evaluate(()=>window.__smoke.undo());assert.equal(await page.evaluate(()=>window.__smoke.grab.getState().visible),false);
      await page.evaluate(()=>window.__smoke.redo());assert.equal(await page.evaluate(()=>window.__smoke.grab.getState().visible),true);
      // Wait for this edit, not an earlier visible workspace still in storage.
      await page.waitForFunction(expected=>{
        const saved=JSON.parse(localStorage.getItem('tuttingAutosave_v1')||'null')?.grabBox;
        return saved&&['position','quaternion','shapeType','shapeParams','grabbed','palmAligned','palmTwist'].every(key=>JSON.stringify(saved[key])===JSON.stringify(expected[key]));
      },restoredGrab);
      await page.reload();await page.waitForFunction(()=>document.getElementById('loading').style.display==='none');
      const reloadedGrab=await page.evaluate(()=>window.__smoke.grab.snapshot());
      for(const key of ['position','shapeParams','grabbed','palmAligned','palmTwist'])assert.deepEqual(reloadedGrab[key],storedGrab.grabBox[key],key+' survives autosave reload');
      // Older v1 projects clear live grabs without overriding their timeline body.
      const legacyPositions=await page.evaluate(()=>{
        const a=window.__smoke,data=a.snapshotTimelineData();delete data.grabBox;
        const footPlant=data.footPlant;delete data.footPlant;
        data.keyframes=[{angles:structuredClone(a.target),body:{position:[.2,0,.1],quaternion:[0,0,0,1]}}];
        a.restoreTimelineData(data);const timeline=a.model.position.toArray();
        a.restoreTimelineData({...data,footPlant});
        return {timeline,footWorkspace:a.model.position.toArray(),savedFoot:footPlant.body.position};
      });
      assert.deepEqual(legacyPositions.timeline,[.2,0,.1],'legacy timeline body without foot workspace is preserved');
      assert.deepEqual(legacyPositions.footWorkspace,legacyPositions.savedFoot,'legacy foot workspace body is preserved');
      assert.equal(await page.evaluate(()=>window.__smoke.grab.getState().visible),false);
      assert.deepEqual(await page.evaluate(()=>window.__smoke.grab.getState().grabbed),{rArm:false,lArm:false});
      await page.evaluate(data=>window.__smoke.restoreTimelineData(data),storedGrab);
      await page.locator('.tabBtn[data-tab="grabBox"]').evaluate(el=>el.click());
      await page.locator('#grabPalmAlign').uncheck();
      assert.equal(await page.evaluate(()=>window.__smoke.grab.isPalmAligned('rArm')),false);
      await page.evaluate(()=>{window.__smoke.setLookAtEnabled('rHand',false);window.__smoke.setEffectorOrientEnabled('rArm',false);});
      await page.locator('#grabVisibleBtn').click();
      await page.evaluate(()=>{window.__smoke.setIKEnabled('rArm',false);window.__smoke.setIKEnabled('lArm',false);window.__smoke.fingerTut.enter();});
      const blocked=await page.evaluate(()=>window.__smoke.grab.snapshot());
      await page.locator('#grabPresetSides').click();
      const denied=await page.evaluate(()=>window.__smoke.grab.snapshot());
      assert.match(denied.messageKey,/FingerTut/);
      assert.deepEqual({...denied,messageKey:null},{...blocked,messageKey:null});
      await page.evaluate(()=>window.__smoke.fingerTut.restore());
      await page.locator('.tabBtn[data-tab="ik"]').evaluate(el=>el.click());
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
      console.log(`PASS ${entry}: model, all tabs, IK, grab workspace Undo/Redo and zero-pose JSON/autosave, JSON pose, mirror/symmetry, Tutting preview/commit, Wave restore, history, libraries, clipboard/range editing, clip editing, timeline/audio playback, waveform decode, JSON roundtrip, split view, autosave reload`);
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
  if(process.env.GITHUB_ACTIONS){
    const message=(error.stack||String(error)).replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A');
    console.error('::error title=Browser regression failed::'+message);
  }
  throw error;
} finally {
  await browser?.close();
  server.close();
}
