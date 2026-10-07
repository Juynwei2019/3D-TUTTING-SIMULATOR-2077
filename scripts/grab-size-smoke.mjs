import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright-core';
const root=resolve('.'),out=resolve('test-results/grab-size');
await mkdir(out,{recursive:true});
const model=await readFile('.cache/Xbot.glb');
assert.equal(createHash('sha256').update(model).digest('hex'),'002f8d269de68e5dce3d25195caf390d1aa359bbfaae3fcf4c8dc78ec36c3ba5');
// Served test adapter only; never shipped in source or dist.
const probe=`window.__grabTimeline={
 get core(){return grabBoxCore},get frames(){return keyframes},get playing(){return kfPlaying},
 snapshotTimelineData,restoreTimelineData,pushHistory,applyTimelinePreviewAtElapsed,selectKeyframe,undo,redo,
 move(){const box=scene.getObjectByName('grabBoxMesh');grabBoxCore.beginEdit();box.position.y+=.05;box.rotation.z+=.15;grabBoxCore.endEdit();},
 bodyMove(){model.position.x+=.025;},
 inspect(){model.updateWorldMatrix(true,true);const box=scene.getObjectByName('grabBoxMesh'),state=grabBoxCore.snapshot();
 return {shape:state.shapeType,params:state.shapeParams[state.shapeType],sizeTween:state.sizeTween,geometry:box.geometry.id,edges:box.children[0].geometry.id,bounds:box.geometry.boundingBox?.getSize(box.position.clone()).toArray(),position:box.position.toArray(),quaternion:box.quaternion.toArray(),visible:box.visible,body:model.position.toArray(),
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
const close=(a,b,tol=1e-5)=>a.every((v,i)=>Math.abs(v-b[i])<tol);
try{
 browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']});
 for(const entry of (process.env.GRAB_SIZE_ENTRY?[process.env.GRAB_SIZE_ENTRY]:['/index.html','/dist/index.html']))for(const width of (process.env.GRAB_SIZE_WIDTHS||'1280,320,390,844').split(',').map(Number)){
  const context=await browser.newContext({viewport:{width,height:width===1280?900:width===844?390:844},hasTouch:width!==1280,isMobile:width!==1280});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route('https://unpkg.com/three@0.160.0/**',async r=>r.fulfill({body:await readFile(resolve('node_modules/three',new URL(r.request().url()).pathname.slice('/three@0.160.0/'.length))),contentType:'text/javascript'}));
  await page.route('https://threejs.org/examples/models/gltf/Xbot.glb',r=>r.fulfill({body:model,contentType:'model/gltf-binary'}));
  const label=(entry.includes('dist')?'dist':'source')+'-'+width;
  const click=async selector=>{const el=page.locator(selector);await el.scrollIntoViewIfNeeded();if(width===1280)await el.click();else await el.tap();};
  const inspect=()=>page.evaluate(()=>window.__grabTimeline.inspect());
  const sample=async ms=>{await page.evaluate(ms=>window.__grabTimeline.applyTimelinePreviewAtElapsed(ms),ms);return inspect();};
  try{
   await page.goto(`http://127.0.0.1:${server.address().port}${entry}`);await page.waitForFunction(()=>document.getElementById('loading').style.display==='none');
   for(const type of ['box','sphere','cylinder']){
    await page.evaluate(()=>{const p=window.__grabTimeline,d=p.snapshotTimelineData();d.keyframes=[];p.restoreTimelineData(d);p.pushHistory();});
    await click('.tabBtn[data-tab="grabBox"]');await click(`#grabShapeBtns [data-shape="${type}"]`);await click('#grabPresetSides');await page.locator('#grabPalmAlign').check();
    await page.locator('#grabSizeTween').check();await click('#grabTimelineAdd');
    const start=(await inspect()).params;
    for(const [key,v]of Object.entries(start)){
     const input=page.locator(`#grabParam_${type}_${key}`);await input.fill((v+.04).toFixed(2));await input.dispatchEvent('input');await input.dispatchEvent('change');
    }
    await click('#grabTimelineAdd');
    const data=await page.evaluate(()=>window.__grabTimeline.snapshotTimelineData());assert.equal(data.keyframes.length,2);assert.equal(data.keyframes[0].grabBox.sizeTween,true);
    for(const f of data.keyframes){f.easing='linear';f.beats=1;}data.bpm=120;
    await page.evaluate(d=>{window.__grabTimeline.restoreTimelineData(d);window.__grabTimeline.pushHistory();},data);
    const mid=await sample(250);
    for(const [key,v]of Object.entries(start))assert.ok(Math.abs(mid.params[key]-(v+data.keyframes[1].grabBox.shapeParams[type][key])/2)<1e-8,`${type} midpoint ${key}`);
    for(const [i,h]of mid.hands.entries()){assert.ok(h.distance<.015,`${type} contact ${h.distance}`);assert.ok(h.normalDot*(i===0?1:-1)>.98,`${type} palm ${h.normalDot}`);}
    const expected=type==='box'?[mid.params.w,mid.params.h,mid.params.d]:type==='sphere'?[mid.params.r*2,mid.params.r*2,mid.params.r*2]:[mid.params.r*2,mid.params.h,mid.params.r*2];
    assert.ok(close(mid.bounds,expected,1e-6),'geometry follows sampled dimensions');
    await sample(375);await sample(125);const repeated=await sample(250);
    assert.deepEqual(repeated.params,mid.params);assert.equal(repeated.geometry,mid.geometry);assert.equal(repeated.edges,mid.edges);
    if(type==='box'){
     await page.locator('#languageSelect').selectOption('en');assert.match(await page.locator('#grabSizeTween').locator('..').textContent(),/Smooth size change/);
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
     assert.ok((await page.locator('#grabSizeTween').locator('..').boundingBox()).height>=44);
     await page.locator('#grabSizeTween').locator('..').scrollIntoViewIfNeeded();
     await page.mouse.move(900,30);
     await page.screenshot({path:resolve(out,label+'-midpoint.png')});
     await page.locator('#languageSelect').selectOption('zh-Hant');
    }
    const legacy=structuredClone(data);delete legacy.keyframes[0].grabBox.sizeTween;
    await page.evaluate(d=>window.__grabTimeline.restoreTimelineData(d),legacy);assert.deepEqual((await sample(250)).params,start);
    await page.evaluate(d=>window.__grabTimeline.restoreTimelineData(d),data);
   }
   await page.evaluate(()=>window.__grabTimeline.selectKeyframe(0));
   await page.locator('#grabSizeTween').uncheck();await click('#undoBtn');assert.equal(await page.locator('#grabSizeTween').isChecked(),true);await click('#redoBtn');assert.equal(await page.locator('#grabSizeTween').isChecked(),false);
   // Saved starting pose keeps its option until explicitly updated.
   assert.equal(await page.evaluate(()=>window.__grabTimeline.frames[0].grabBox.sizeTween),true);
   await click('#grabTimelineView');await click('#kfPlayBtn');
   await page.waitForTimeout(150);
   const paused=await page.evaluate(()=>{if(window.__grabTimeline.playing)document.getElementById('kfPlayBtn').click();return window.__grabTimeline.inspect();});
   await page.waitForTimeout(140);assert.deepEqual((await inspect()).params,paused.params);
   const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#kfExportBtn').click()]);
   const saved=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(saved.keyframes[0].grabBox.sizeTween,true);
   await page.locator('#kfImportFile').setInputFiles({name:'size.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
   await page.waitForFunction(expected=>JSON.stringify(JSON.parse(localStorage.getItem('tuttingAutosave_v1')||'{}').keyframes)===JSON.stringify(expected),saved.keyframes);
   await page.reload();await page.waitForFunction(()=>document.getElementById('loading').style.display==='none');
   assert.equal(await page.evaluate(()=>window.__grabTimeline.frames[0].grabBox.sizeTween),true);
   assert.equal(await page.locator('#grabSizeTween').isChecked(),true);assert.deepEqual(errors,[]);
   console.log('PASS '+label+': 3 shapes, dimensions, contacts/palms, buffer reuse, seek, legacy, locales, undo/redo, stop, JSON/autosave');
  }catch(e){await page.screenshot({path:resolve(out,label+'-failure.png')});throw e;}finally{await context.close();}
 }
}catch(e){if(process.env.GITHUB_ACTIONS)console.error('::error title=Grab size regression failed::'+(e.stack||String(e)).replaceAll('%','%25').replaceAll('\n','%0A').replaceAll('\r','%0D'));throw e;}
finally{await browser?.close();server.close();}
