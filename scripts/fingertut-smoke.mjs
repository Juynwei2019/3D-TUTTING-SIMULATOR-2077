import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve,extname,sep } from 'node:path';
import { chromium } from 'playwright-core';
const root=resolve('.'),model=await readFile('.cache/Xbot.glb');
assert.equal(createHash('sha256').update(model).digest('hex'),'002f8d269de68e5dce3d25195caf390d1aa359bbfaae3fcf4c8dc78ec36c3ba5');
const probe=`\nwindow.__fingerTutTest={fingerTutController,poseController,undo,redo,setIKEnabled,setFingerIKEnabled,get bones(){return bones;},get camera(){return camera;},get controls(){return controls;},get playing(){return kfPlaying;},get height(){return modelHeight;},get rig(){return fingerTutController.snapshot().rig;},startPlayback(){const angles=poseController.snapshotTarget();keyframes=[{angles,beats:4,easing:'linear'},{angles,beats:4,easing:'linear'}];toggleKeyframePlayback();}};`;
const server=createServer(async(req,res)=>{try{
  const pathname=new URL(req.url,'http://localhost').pathname,path=resolve(root,'.'+pathname);
  if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}
  let data=await readFile(path);
  if(pathname==='/src/main.js')data=Buffer.from(data.toString()+probe);
  if(pathname==='/dist/index.html'){const text=data.toString(),at=text.lastIndexOf('</script>');data=Buffer.from(text.slice(0,at)+probe+text.slice(at));}
  res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[extname(path)]||'application/octet-stream'}).end(data);
}catch(e){res.writeHead(500).end(String(e));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']});
await mkdir('test-results/fingertut',{recursive:true});
const results=[];
const normalize=value=>JSON.parse(JSON.stringify(value));
const entries=process.env.FINGERTUT_ENTRY?[process.env.FINGERTUT_ENTRY]:['/index.html','/dist/index.html'];
const viewports=[{width:1280,height:900},{width:320,height:568},{width:390,height:844},{width:844,height:390}].filter(v=>!process.env.FINGERTUT_WIDTHS||process.env.FINGERTUT_WIDTHS.split(',').includes(String(v.width)));
assert.ok(viewports.length,'at least one viewport is required');
try{for(const entry of entries)for(const viewport of viewports){
  const mobile=viewport.width!==1280;
  const label=(entry.includes('dist')?'dist':'source')+'-'+(mobile?'mobile-'+viewport.width:'desktop');
  const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://unpkg.com/three@0.160.0/**',async route=>{
    const suffix=new URL(route.request().url()).pathname.slice('/three@0.160.0/'.length);
    const path=resolve(root,'node_modules/three',suffix);assert.ok(path.startsWith(resolve(root,'node_modules/three')+sep));
    await route.fulfill({body:await readFile(path),contentType:'text/javascript'});
  });
  await page.route('https://threejs.org/examples/models/gltf/Xbot.glb',route=>route.fulfill({body:model,contentType:'model/gltf-binary'}));
  try{
    await page.goto(`http://127.0.0.1:${server.address().port}${entry}`);
    await page.waitForFunction(()=>document.getElementById('loading').style.display==='none');
    const press=async selector=>{const el=page.locator(selector);await el.scrollIntoViewIfNeeded();if(mobile)await el.tap();else await el.click();};
    await press('.tabBtn[data-tab=fingers]');
    await page.screenshot({path:`test-results/fingertut/${label}-before.png`});
    // Nontrivial finger pose must survive mode entry, even when IK was enabled.
    await page.evaluate(()=>{
      const t=window.__fingerTutTest;t.poseController.setTarget('rIndex2',[12,4,-8]);t.poseController.applyTargetsToBones();
      t.setIKEnabled('rArm',true);t.setFingerIKEnabled('rPinky',true);
    });
    await page.waitForTimeout(100);
    const before=await page.evaluate(()=>({pose:window.__fingerTutTest.poseController.snapshotTarget(),state:window.__fingerTutTest.fingerTutController.snapshot()}));
    await page.evaluate(()=>window.__fingerTutTest.startPlayback());
    assert.equal(await page.evaluate(()=>window.__fingerTutTest.playing),true);
    await press('#fingerTutToggle');
    assert.equal(await page.evaluate(()=>window.__fingerTutTest.playing),false);
    await page.waitForFunction(()=>document.getElementById('fingerTutToggle').getAttribute('aria-pressed')==='true');
    const enteredBefore=await page.evaluate(()=>window.__fingerTutTest.fingerTutController.snapshot().before);
    before.pose=enteredBefore.pose;before.state.rig=enteredBefore.rig;
    await page.waitForTimeout(250);
    const placed=await page.evaluate(()=>{
      const t=window.__fingerTutTest,point=k=>{const p=t.bones[k].position.clone();t.bones[k].getWorldPosition(p);return p;};
      const c=point('spine2'),right=point('lArm').sub(point('rArm')).normalize(),up=point('neck').sub(point('spine')).normalize(),forward=right.clone().cross(up).normalize();
      return {pose:t.poseController.snapshotTarget(),rig:t.rig,hands:['r','l'].map(s=>{
        const d=point(s+'Hand').sub(c),finger=point(s+'Middle1').sub(point(s+'Hand')).normalize();
        const across=point(s+'Index1').sub(point(s+'Pinky1')).normalize(),palm=finger.clone().cross(across).multiplyScalar(s==='r'?1:-1).normalize();
        return {side:s,height:d.dot(up)/t.height,front:d.dot(forward)/t.height,lateral:d.dot(right)/t.height,palmUp:palm.dot(up),fingerForward:finger.dot(forward)};
      })};
    });
    for(const hand of placed.hands){assert.ok(Math.abs(hand.height+.02)<.015,JSON.stringify(hand));assert.ok(Math.abs(hand.front-.22)<.015,JSON.stringify(hand));assert.ok(Math.abs(Math.abs(hand.lateral)-.12)<.015,JSON.stringify(hand));assert.ok(hand.palmUp<-.9,JSON.stringify(hand));assert.ok(hand.fingerForward>.9,JSON.stringify(hand));}
    for(const key of Object.keys(before.pose).filter(k=>/(Thumb|Index|Middle|Ring|Pinky)/.test(k)))assert.deepEqual(normalize(placed.pose[key]),before.pose[key],key);
    assert.equal(placed.rig.arms.rArm.enabled,false);assert.equal(placed.rig.fingers.rPinky.enabled,false);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal page overflow');
    assert.equal(await page.evaluate(()=>document.getElementById('displayTogglesPanel').classList.contains('collapsed')),true);
    await page.screenshot({path:`test-results/fingertut/${label}-active.png`});
    await page.evaluate(()=>window.__fingerTutTest.undo());
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>window.__fingerTutTest.fingerTutController.active),false);
    assert.deepEqual(await page.evaluate(()=>window.__fingerTutTest.rig),before.state.rig);
    await page.evaluate(()=>window.__fingerTutTest.redo());
    assert.equal(await page.evaluate(()=>window.__fingerTutTest.fingerTutController.active),true);
    await page.locator('#fingerTut_spacing').fill('32');await page.locator('#fingerTut_spacing').dispatchEvent('change');
    assert.equal(await page.locator('#fingerTut_spacingValue').textContent(),'32%');
    await page.evaluate(()=>window.__fingerTutTest.undo());
    assert.equal(await page.locator('#fingerTut_spacing').inputValue(),'24');
    const pose=await page.evaluate(()=>window.__fingerTutTest.poseController.snapshotTarget());
    await press('#fingerTutToggle');assert.deepEqual(normalize(await page.evaluate(()=>window.__fingerTutTest.poseController.snapshotTarget())),normalize(pose),'exit preserves result');
    await page.evaluate(()=>document.getElementById('fingerTutRestore').addEventListener('click',()=>{window.__restoredPose=window.__fingerTutTest.poseController.snapshotTarget();},{once:true}));
    await press('#fingerTutRestore');
    assert.deepEqual(normalize(await page.evaluate(()=>window.__restoredPose)),before.pose,'restore original pose');
    assert.deepEqual(await page.evaluate(()=>window.__fingerTutTest.rig),before.state.rig,'restore original IK targets and flags');
    assert.deepEqual(errors,[]);
    results.push({label,hands:placed.hands,checks:'pose preserved, chest placement, palm down, Undo/Redo, spacing, exit, restore, no runtime errors'});
    console.log('PASS '+label);
  }catch(e){console.error('::error title=FingerTut regression::'+`${label}: ${e.stack||e}`.replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A'));await page.screenshot({path:`test-results/fingertut/${label}-failure.png`});throw e;}finally{await context.close();}
}
await writeFile('test-results/fingertut/results.json',JSON.stringify(results,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
