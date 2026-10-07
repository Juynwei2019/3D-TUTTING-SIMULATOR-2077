import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright-core';
const root=resolve('.'),out=resolve('test-results/grab-timeline');
await mkdir(out,{recursive:true});
const model=await readFile('.cache/Xbot.glb');
assert.equal(createHash('sha256').update(model).digest('hex'),'002f8d269de68e5dce3d25195caf390d1aa359bbfaae3fcf4c8dc78ec36c3ba5');
// Served test adapter only; never shipped in source or dist.
const probe=`window.__grabTimeline={
 get core(){return grabBoxCore},get frames(){return keyframes},get playing(){return kfPlaying},
 snapshotTimelineData,restoreTimelineData,applyTimelinePreviewAtElapsed,selectKeyframe,undo,redo,
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
const close=(a,b,tol=1e-5)=>a.every((v,i)=>Math.abs(v-b[i])<tol);
try{
 browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']});
 for(const entry of (process.env.GRAB_TIMELINE_ENTRY?[process.env.GRAB_TIMELINE_ENTRY]:['/index.html','/dist/index.html'])){
  for(const width of (process.env.GRAB_TIMELINE_WIDTHS?process.env.GRAB_TIMELINE_WIDTHS.split(',').map(Number):[1280,390])){
  const context=await browser.newContext({viewport:{width,height:width===390?844:900},hasTouch:width===390,isMobile:width===390}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route('https://unpkg.com/three@0.160.0/**',async r=>r.fulfill({body:await readFile(resolve('node_modules/three',new URL(r.request().url()).pathname.slice('/three@0.160.0/'.length))),contentType:'text/javascript'}));
  await page.route('https://threejs.org/examples/models/gltf/Xbot.glb',r=>r.fulfill({body:model,contentType:'model/gltf-binary'}));
  const label=(entry.includes('dist')?'dist':'source')+'-'+width;
  try{
   await page.goto(`http://127.0.0.1:${server.address().port}${entry}`);
   await page.waitForFunction(()=>document.getElementById('loading').style.display==='none');
   await page.locator('.tabBtn[data-tab="grabBox"]').click();await page.locator('#grabPresetSides').click();await page.locator('#grabPalmAlign').check();
   await page.locator('.tabBtn[data-tab="keyframe"]').click();
   await page.locator('#kfAddBtn').click();
   await page.evaluate(()=>{window.__grabTimeline.move();window.__grabTimeline.bodyMove();});
   await page.locator('#kfAddBtn').click();
   await page.evaluate(()=>{const p=window.__grabTimeline;p.core.setGrabHand('rArm',false);p.core.setGrabHand('lArm',false);});
   await page.locator('#kfAddBtn').click();
   const frames=await page.evaluate(()=>window.__grabTimeline.frames);assert.equal(frames.length,3);
   assert.ok(frames[0].grabBox.grabbed.rArm);assert.equal(frames[2].grabBox.grabbed.rArm,false);
   for(const frame of frames){frame.easing='linear';frame.beats=1;}
   await page.evaluate(frames=>{const p=window.__grabTimeline;const data=p.snapshotTimelineData();data.keyframes=frames;data.bpm=120;p.restoreTimelineData(data);},frames);
   const sample=async ms=>{await page.evaluate(ms=>window.__grabTimeline.applyTimelinePreviewAtElapsed(ms),ms);await page.waitForTimeout(80);return page.evaluate(()=>window.__grabTimeline.inspect());};
   const start=await sample(0),mid=await sample(250),again=await sample(250);
   const expected=frames[0].grabBox.position.map((v,i)=>(v+frames[1].grabBox.position[i])/2);
   assert.ok(close(mid.position,expected),'midpoint position');assert.ok(close(mid.position,again.position),'deterministic seek');
   for(const [i,h] of mid.hands.entries()){assert.ok(h.distance<.015,'hand follows box: '+h.distance);assert.ok(h.normalDot*(i===0?1:-1)>.98,'palm surface alignment: '+h.normalDot);}
   console.log(label+' midpoint contact '+JSON.stringify(mid.hands.map(h=>({distance:h.distance,normalDot:h.normalDot}))));
   assert.ok(close(mid.body,frames[0].body.position.map((v,i)=>(v+frames[1].body.position[i])/2),.003),'body animation survives grab state');
   await page.mouse.move(900,30);await page.waitForTimeout(700);
   await page.screenshot({path:resolve(out,label+'-midpoint.png')});
   const end=await sample(1000);assert.ok(end.hands.every(h=>!h.bound&&!h.ik),'release boundary');
   await sample(250);
   // Update a recorded frame and verify actual Undo / Redo buttons restore it.
   await page.evaluate(()=>window.__grabTimeline.selectKeyframe(0));
   await page.evaluate(()=>window.__grabTimeline.move());await page.locator('#kfUpdateBtn').click();
   const changed=await page.evaluate(()=>window.__grabTimeline.frames[0].grabBox.position);
   await page.locator('#undoBtn').click();assert.ok(close(await page.evaluate(()=>window.__grabTimeline.frames[0].grabBox.position),frames[0].grabBox.position));
   await page.locator('#redoBtn').click();assert.ok(close(await page.evaluate(()=>window.__grabTimeline.frames[0].grabBox.position),changed));
   // Real JSON download + file upload, with the existing confirmation dialog.
   const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#kfExportBtn').click()]);
   const downloaded=JSON.parse(await readFile(await download.path(),'utf8'));assert.ok(downloaded.keyframes[0].grabBox);
   await page.locator('#kfImportFile').setInputFiles({name:'grab-timeline.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(downloaded))});
   await page.waitForFunction(()=>window.__grabTimeline.frames.length===3);
   assert.deepEqual(await page.evaluate(()=>window.__grabTimeline.frames.map(f=>f.grabBox)),downloaded.keyframes.map(f=>f.grabBox));
   await page.locator('#kfPlayBtn').click();await page.waitForTimeout(220);await page.locator('#kfPlayBtn').click();
   const paused=await page.evaluate(()=>window.__grabTimeline.inspect());await page.waitForTimeout(140);
   const held=await page.evaluate(()=>window.__grabTimeline.inspect());assert.ok(close(paused.position,held.position));
   assert.ok(paused.hands.every((h,i)=>close(h.quaternion,held.hands[i].quaternion,.003)),'stop holds hand orientation');
   await page.locator('#kfPlayBtn').click();await page.waitForFunction(()=>!window.__grabTimeline.playing);
   const finished=await page.evaluate(()=>window.__grabTimeline.inspect());assert.ok(finished.hands.every(h=>!h.bound&&!h.ik),'natural end releases hands');
   // Autosave must retain per-pose data; reload runs the same import validation.
   await page.waitForFunction(()=>JSON.parse(localStorage.getItem('tuttingAutosave_v1')||'{}').keyframes?.length===3);
   await page.reload();await page.waitForFunction(()=>document.getElementById('loading').style.display==='none');
   assert.equal(await page.evaluate(()=>window.__grabTimeline.frames.filter(f=>f.grabBox).length),3);
   const legacy=await page.evaluate(()=>window.__grabTimeline.snapshotTimelineData());for(const f of legacy.keyframes)delete f.grabBox;delete legacy.grabBox;
   await page.evaluate(data=>window.__grabTimeline.restoreTimelineData(data),legacy);
   await sample(250);assert.equal(await page.evaluate(()=>window.__grabTimeline.inspect().visible),false,'legacy data remains usable');
   assert.deepEqual(errors,[]);console.log('PASS '+label+': recording, movement, palms, body, release, seek, stop, undo/redo, JSON, autosave and legacy');
  }catch(e){await page.screenshot({path:resolve(out,label+'-failure.png')});throw e;}finally{await context.close();}
  }
 }
}catch(e){if(process.env.GITHUB_ACTIONS)console.error('::error title=Grab timeline regression failed::'+(e.stack||String(e)).replaceAll('%','%25').replaceAll('\n','%0A').replaceAll('\r','%0D'));throw e;}
finally{await browser?.close();server.close();}
