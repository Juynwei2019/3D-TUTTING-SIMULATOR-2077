import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright-core';
const root=resolve('.'),out=resolve('test-results/grab-usability');
await mkdir(out,{recursive:true});
const model=await readFile('.cache/Xbot.glb');
assert.equal(createHash('sha256').update(model).digest('hex'),'002f8d269de68e5dce3d25195caf390d1aa359bbfaae3fcf4c8dc78ec36c3ba5');
// Served test adapter only; never shipped in source or dist.
const probe=`window.__grabTimeline={
 get tools(){return grabTimelineUI},get core(){return grabBoxCore},
 setRange(a,b){beatGridRangeStart=a;beatGridRangeEnd=b;updateBeatGridRangeUI();},
 get clipboard(){return timelineClipboard},get rangeClipboard(){return beatGridRangeClipboard},
 reorderKeyframe,copyTimelineSelection,pasteTimelineClipboard,duplicateKeyframe,
 updateRaw:()=>updateKeyframe(),get frames(){return keyframes},get playing(){return kfPlaying},
 pushHistory,snapshotTimelineData,restoreTimelineData,applyTimelinePreviewAtElapsed,selectKeyframe,undo,redo,
 move(){const box=scene.getObjectByName('grabBoxMesh');grabBoxCore.beginEdit();box.position.y+=.05;box.rotation.z+=.15;grabBoxCore.endEdit();},
 bodyMove(){model.position.x+=.025;},
 inspect(){model.updateWorldMatrix(true,true);const box=scene.getObjectByName('grabBoxMesh'),state=grabBoxCore.snapshot();
 return {position:box.position.toArray(),quaternion:box.quaternion.toArray(),visible:box.visible,body:model.position.toArray(),
 hands:['rArm','lArm'].map(limb=>{const side=limb[0],hand=bones[side+'Hand'],p=hand.getWorldPosition(hand.position.clone());
 const target=state.grabLocal[limb]?p.clone().fromArray(state.grabLocal[limb]).applyMatrix4(box.matrixWorld):null;
 const finger=bones[side+'Middle1'].getWorldPosition(p.clone()).sub(p).normalize(),across=bones[side+'Index1'].getWorldPosition(p.clone()).sub(bones[side+'Pinky1'].getWorldPosition(p.clone())).normalize();
 const normal=across.clone().cross(finger).normalize(),outward=p.clone().set(Math.sign(state.grabLocal[limb]?.[0]||0),0,0).applyQuaternion(box.quaternion);
 return {bound:state.grabbed[limb],distance:target?p.distanceTo(target):null,normalDot:normal.dot(outward),quaternion:hand.quaternion.toArray(),ik:ikEnabled[limb]};})};}
};`;
const server=createServer(async(req,res)=>{try{
 const name=new URL(req.url,'http://localhost').pathname,path=resolve(root,'.'+name);
 if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}
 let data=await readFile(path);
 if(name==='/src/main.js')data=Buffer.from(data.toString()+probe);
 if(name==='/dist/index.html'){const html=data.toString(),at=html.lastIndexOf('</script>');assert.ok(at>0);data=Buffer.from(html.slice(0,at)+probe+html.slice(at));}
 res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[extname(path)]||'application/octet-stream'}).end(data);
}catch(e){res.writeHead(500).end(String(e));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
const close=(a,b)=>a.every((v,i)=>Math.abs(v-b[i])<1e-5);
try{
 browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']});
 for(const entry of (process.env.GRAB_UI_ENTRY?[process.env.GRAB_UI_ENTRY]:['/index.html','/dist/index.html'])){
  for(const viewport of [{width:1280,height:900},{width:320,height:568},{width:390,height:844},{width:844,height:390}].filter(v=>!process.env.GRAB_UI_WIDTHS||process.env.GRAB_UI_WIDTHS.split(',').includes(String(v.width)))){
   const mobile=viewport.width!==1280,context=await browser.newContext({viewport,hasTouch:mobile,isMobile:mobile}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   await page.route('https://unpkg.com/three@0.160.0/**',async r=>r.fulfill({body:await readFile(resolve('node_modules/three',new URL(r.request().url()).pathname.slice('/three@0.160.0/'.length))),contentType:'text/javascript'}));
   await page.route('https://threejs.org/examples/models/gltf/Xbot.glb',r=>r.fulfill({body:model,contentType:'model/gltf-binary'}));
   const label=(entry.includes('dist')?'dist':'source')+'-'+viewport.width;
   const click=selector=>mobile?page.locator(selector).tap():page.locator(selector).click();
   const frames=()=>page.evaluate(()=>window.__grabTimeline.frames);
   const restore=data=>page.evaluate(data=>{window.__grabTimeline.restoreTimelineData(data);window.__grabTimeline.pushHistory();},data);
   const waitDirty=dirty=>page.waitForFunction(dirty=>!!document.getElementById('grabTimelineDirty').textContent===dirty,dirty);
   try{
    await page.goto(`http://127.0.0.1:${server.address().port}${entry}`);await page.waitForFunction(()=>document.getElementById('loading').style.display==='none');
    await click('.tabBtn[data-tab="grabBox"]');
    assert.equal(await page.locator('#grabTimelineUpdate').isDisabled(),true);
    await click('#grabPresetSides');await page.locator('#grabPalmAlign').check();
    await click('#grabTimelineAdd');assert.equal((await frames()).length,1);await waitDirty(false);
    await page.evaluate(()=>{const p=window.__grabTimeline;p.frames[0].label='keep';p.frames[0].easing='linear';p.frames[0].beats=2;p.move();});
    await waitDirty(true);
    await page.evaluate(()=>window.__grabTimeline.core.beginEdit());
    await page.waitForFunction(()=>document.getElementById('grabTimelineAdd').disabled);
    await page.evaluate(()=>window.__grabTimeline.core.endEdit());
    await page.waitForFunction(()=>!document.getElementById('grabTimelineUpdate').disabled);
    const before=(await frames())[0].grabBox.position;
    await click('#grabTimelineUpdate');await waitDirty(false);const updated=(await frames())[0];
    assert.ok(!close(before,updated.grabBox.position));assert.equal(updated.label,'keep');assert.equal(updated.beats,2);assert.equal(updated.easing,'linear');
    await click('#undoBtn');assert.ok(close((await frames())[0].grabBox.position,before));await waitDirty(true);
    await click('#redoBtn');assert.ok(close((await frames())[0].grabBox.position,updated.grabBox.position));await waitDirty(false);
    await page.evaluate(()=>window.__grabTimeline.move());await click('#grabTimelineAdd');
    await page.locator('#grabHandCb_rArm').uncheck();await page.locator('#grabHandCb_lArm').uncheck();await click('#grabTimelineAdd');
    const baseline=await page.evaluate(()=>window.__grabTimeline.snapshotTimelineData());assert.equal(baseline.keyframes.length,3);
    await page.waitForFunction(()=>document.getElementById('kfGrabSummary').textContent.includes('雙手放手'));
    await page.locator('#languageSelect').selectOption('en');
    await page.waitForFunction(()=>document.getElementById('grabTimelineTarget').textContent.includes('Selected: F3'));
    assert.ok((await page.locator('#kfGrabSummary').textContent()).includes('Both hands release'));
    assert.equal(await page.locator('#grabTimelineAdd').textContent(),'+ Add pose');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no page overflow');
    for(const button of await page.locator('.grabTimelineActions button').all())assert.ok((await button.boundingBox()).height>=44);
    await page.mouse.move(900,20);await page.screenshot({path:resolve(out,label+'-quick-en.png')});
    await page.locator('#languageSelect').selectOption('zh-Hant');await click('#grabTimelineView');
    assert.equal(await page.locator('.tabBtn[data-tab="keyframe"]').getAttribute('class').then(x=>x.includes('active')),true);
    assert.equal(await page.locator('.kfGrabTag').count(),3);
    assert.ok((await page.locator('#kfList .sel').last().getAttribute('aria-label')).includes('雙手放手'));
    await click('#kfList .kfChip:first-child .sel');
    await page.evaluate(()=>window.__grabTimeline.applyTimelinePreviewAtElapsed(250));
    assert.equal(await page.locator('#kfUpdateBtn').isDisabled(),true);
    const original=await frames();await page.evaluate(()=>window.__grabTimeline.updateRaw());assert.deepEqual(await frames(),original);
    await click('.tabBtn[data-tab="grabBox"]');assert.equal(await page.locator('#grabTimelineUpdate').isDisabled(),true);
    assert.ok((await page.locator('#grabTimelineHint').textContent()).includes('重新選取'));
    await click('#grabTimelineAdd');assert.equal((await frames()).length,4);assert.equal(await page.locator('#grabTimelineUpdate').isDisabled(),false);
    await click('#undoBtn');assert.equal((await frames()).length,3);await click('#redoBtn');assert.equal((await frames()).length,4);
    await restore(baseline);await click('#grabTimelineView');
    await page.evaluate(()=>window.__grabTimeline.setRange(.5,2.5));await click('#beatGridRangeCopyBtn');
    const range=await page.evaluate(()=>window.__grabTimeline.rangeClipboard.poseItems);assert.equal(range.length,3);assert.deepEqual(range.map(f=>f.grabBox),baseline.keyframes.map(f=>f.grabBox));
    assert.ok((await page.locator('#timelineDragHud').textContent()).includes('3 個 POSE'));
    await click('#beatGridRangeDuplicateBtn');assert.equal((await frames()).length,6);
    assert.equal((await frames())[5].grabBox.grabbed.rArm,false);await click('#undoBtn');assert.equal((await frames()).length,3);await click('#redoBtn');assert.equal((await frames()).length,6);
    await page.evaluate(()=>{window.__grabTimeline.frames[3].grabBox.palmTwist.rArm=90;});
    assert.equal((await frames())[0].grabBox.palmTwist.rArm,0);assert.equal((await page.evaluate(()=>window.__grabTimeline.rangeClipboard.poseItems))[0].grabBox.palmTwist.rArm,0);
    await restore(baseline);
    await click('#kfMultiSelectBtn');await click('#kfMultiSelectAllBtn');await click('#kfMultiSelectCopyBtn');await click('#kfMultiSelectPasteBtn');assert.equal((await frames()).length,6);
    await click('.tabBtn[data-tab="grabBox"]');await page.waitForFunction(()=>document.getElementById('grabTimelineAdd').disabled&&document.getElementById('grabTimelineUpdate').disabled);
    await click('#grabTimelineView');await click('#kfMultiSelectBtn');
    await restore(baseline);
    // Reordering changes derived release events; no stale event metadata is stored.
    await page.evaluate(()=>{window.__grabTimeline.reorderKeyframe(2,0);window.__grabTimeline.selectKeyframe(0);});
    assert.ok(!(await page.locator('#kfGrabSummary').textContent()).includes('雙手放手'));
    await page.evaluate(()=>window.__grabTimeline.selectKeyframe(1));assert.ok((await page.locator('#kfGrabSummary').textContent()).includes('雙手開始扶握'));
    await restore(baseline);await click('#kfPlayBtn');await click('.tabBtn[data-tab="grabBox"]');
    await page.waitForFunction(()=>document.getElementById('grabTimelineAdd').disabled);await click('#grabTimelineView');
    await page.evaluate(()=>{if(window.__grabTimeline.playing)document.getElementById('kfPlayBtn').click();});
    await page.waitForFunction(()=>!window.__grabTimeline.playing);
    await page.evaluate(()=>window.__grabTimeline.selectKeyframe(2));
    await page.mouse.move(900,20);await page.screenshot({path:resolve(out,label+'-timeline-zh.png')});
    await click('.tabBtn[data-tab="grabBox"]');
    if(viewport.width===1280){
     await click('#uiFloatBtn');const r=await page.locator('#uiFloatResizeHandle').boundingBox();
     await page.mouse.move(r.x+10,r.y+10);await page.mouse.down();await page.mouse.move(r.x-130,r.y+170,{steps:4});await page.mouse.up();
     assert.equal(Math.round((await page.locator('#ui').boundingBox()).width),300);
     await page.locator('#languageSelect').selectOption('en');await click('#grabTimelineAdd');assert.equal((await frames()).length,4);
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
     await page.screenshot({path:resolve(out,label+'-floating-300.png')});await click('#uiFloatBtn');
    }
    // Actual file round trip and fresh autosave load keep animation data, not UI metadata.
    await click('#grabTimelineView');const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#kfExportBtn').click()]);
    const saved=JSON.parse(await readFile(await download.path(),'utf8'));assert.ok(saved.keyframes.every(f=>!('grabStatus' in f)&&!('grabEvents' in f)));
    await page.locator('#kfImportFile').setInputFiles({name:'grab-ui.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
    await page.waitForFunction(()=>!window.__grabTimeline.tools.preview);
    const restoredFrames=await frames();
    await page.waitForFunction(expected=>JSON.stringify(JSON.parse(localStorage.getItem('tuttingAutosave_v1')||'{}').keyframes)===JSON.stringify(expected),restoredFrames);
    await page.reload();await page.waitForFunction(()=>document.getElementById('loading').style.display==='none');
    assert.deepEqual((await frames()).map(f=>f.grabBox),saved.keyframes.map(f=>f.grabBox));
    assert.deepEqual(errors,[]);console.log('PASS '+label+': touch/click shortcuts, draft, metadata, single undo, preview guard, badges/events, Range, multiselect, reorder, playback guards, locales, file/autosave'+(viewport.width===1280?', 300px float':''));
   }catch(e){await page.screenshot({path:resolve(out,label+'-failure.png')});throw e;}finally{await context.close();}
  }
 }
}catch(e){if(process.env.GITHUB_ACTIONS)console.error('::error title=Grab usability regression failed::'+(e.stack||String(e)).replaceAll('%','%25').replaceAll('\n','%0A').replaceAll('\r','%0D'));throw e;}
finally{await browser?.close();server.close();}
