import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve,extname,sep } from 'node:path';
import { chromium } from 'playwright-core';
const root=resolve('.'),model=await readFile('.cache/Xbot.glb');
assert.equal(createHash('sha256').update(model).digest('hex'),'002f8d269de68e5dce3d25195caf390d1aa359bbfaae3fcf4c8dc78ec36c3ba5');
const probe=`\nwindow.__fingerTutTest={fingerTutController,poseController,undo,redo,setIKEnabled,setFingerIKEnabled,get bones(){return bones;},get camera(){return camera;},get controls(){return controls;},get playing(){return kfPlaying;},get height(){return modelHeight;},snapshotAngleState,snapshotTimelineData,selectJoint,get rig(){return fingerTutController.snapshot().rig;},startPlayback(){const angles=poseController.snapshotTarget();keyframes=[{angles,beats:4,easing:'linear'},{angles,beats:4,easing:'linear'}];toggleKeyframePlayback();}};`;
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
    assert.equal(await page.evaluate(()=>{
      const selector=document.getElementById('languageSelect');selector.value='en';selector.dispatchEvent(new Event('change',{bubbles:true}));
      const playing=window.__fingerTutTest.playing;selector.value='zh-Hant';selector.dispatchEvent(new Event('change',{bubbles:true}));return playing;
    }),true,'language switching keeps playback running');
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
    const cards=await page.locator('.fingerTutCard').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width};}));
    assert.equal(cards.length,2,'placement and orientation have distinct settings cards');
    if(mobile){assert.ok(Math.abs(cards[0].x-cards[1].x)<1&&cards[1].y>cards[0].y,'mobile cards stack');}
    else{assert.ok(cards[1].x>cards[0].x&&Math.abs(cards[0].y-cards[1].y)<1,'desktop cards sit side by side');}
    const slider=await page.locator('#fingerTut_height').boundingBox();
    assert.ok(slider.height>=(mobile?44:32),'slider has a usable pointer target');
    const help=page.locator('.fingerTutHelp');assert.equal(await help.getAttribute('open'),null,'instructions start collapsed');
    await press('.fingerTutHelp summary');assert.notEqual(await help.getAttribute('open'),null);await press('.fingerTutHelp summary');

    assert.equal(await page.evaluate(()=>document.getElementById('displayTogglesPanel').classList.contains('collapsed')),true);
    await page.locator('#uiTabBody').evaluate(el=>el.scrollTop=0);
    await page.screenshot({path:`test-results/fingertut/${label}-active.png`});
    await page.evaluate(()=>window.__fingerTutTest.undo());
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>window.__fingerTutTest.fingerTutController.active),false);
    assert.deepEqual(await page.evaluate(()=>window.__fingerTutTest.rig),before.state.rig);
    await page.evaluate(()=>window.__fingerTutTest.redo());
    assert.equal(await page.evaluate(()=>window.__fingerTutTest.fingerTutController.active),true);
    // Real wrist directions, fixed palm positions, and untouched finger angles.
    await page.evaluate(()=>{
      window.__readPalms=()=>{
        const t=window.__fingerTutTest,point=k=>t.bones[k].getWorldPosition(t.bones[k].position.clone());
        const right=point('lArm').sub(point('rArm')).normalize(),up=point('neck').sub(point('spine')).normalize();
        return {pose:t.poseController.snapshotTarget(),camera:t.camera.position.toArray(),hands:['r','l'].map(side=>{
          const wrist=point(side+'Hand'),finger=point(side+'Middle1').sub(wrist).normalize();
          const palm=finger.clone().cross(point(side+'Index1').sub(point(side+'Pinky1'))).multiplyScalar(side==='r'?1:-1).normalize();
          const camera=t.camera.position.clone().sub(wrist).normalize();
          return {side,position:wrist.toArray(),quaternion:t.bones[side+'Hand'].getWorldQuaternion(t.bones[side+'Hand'].quaternion.clone()).toArray(),up:palm.dot(up),right:palm.dot(right),camera:palm.dot(camera)};
        })};
      };
    });
    await page.locator('#fingerTutSide').selectOption('r');
    await page.evaluate(()=>{
      window.__fingerTutTest.setFingerIKEnabled('rPinky',true);
      document.getElementById('fingerTutPreset').addEventListener('change',()=>{window.__beforeWristChange=window.__readPalms();},{capture:true,once:true});
    });
    await page.locator('#fingerTutPreset').selectOption('up');
    const conflict=await page.evaluate(()=>({before:window.__beforeWristChange,after:window.__readPalms(),rig:window.__fingerTutTest.rig}));
    assert.equal(conflict.rig.fingers.rPinky.enabled,false,'wrist editing releases selected finger IK');
    for(const key of Object.keys(conflict.before.pose).filter(k=>/(Thumb|Index|Middle|Ring|Pinky)/.test(k)))assert.deepEqual(normalize(conflict.after.pose[key]),normalize(conflict.before.pose[key]),'preserve current finger pose after releasing IK');
    await page.locator('#fingerTutPreset').selectOption('down');
    await page.locator('#fingerTutSide').selectOption('both');
    const originalPalms=await page.evaluate(()=>window.__readPalms());
    for(const preset of ['up','in','out','camera','down']){
      await page.locator('#fingerTutPreset').selectOption(preset);
      const state=await page.evaluate(()=>window.__readPalms());
      for(let i=0;i<2;i++){
        const hand=state.hands[i];
        assert.ok(hand.position.every((v,j)=>Math.abs(v-originalPalms.hands[i].position[j])<1e-6),'wrist position stays fixed');
        if(preset==='up')assert.ok(hand.up>.99);
        if(preset==='down')assert.ok(hand.up<-.99);
        if(preset==='in')assert.ok(hand.right*(hand.side==='r'?1:-1)>.99);
        if(preset==='out')assert.ok(hand.right*(hand.side==='r'?1:-1)<-.99);
        if(preset==='camera')assert.ok(hand.camera>.99);
      }
      for(const key of Object.keys(originalPalms.pose).filter(k=>/(Thumb|Index|Middle|Ring|Pinky)/.test(k)))assert.deepEqual(normalize(state.pose[key]),normalize(originalPalms.pose[key]));
      assert.deepEqual(state.camera,originalPalms.camera,'orientation does not move camera');
    }
    await page.locator('#fingerTutSide').selectOption('r');
    const leftBefore=await page.evaluate(()=>window.__readPalms());
    await page.locator('#fingerTutPreset').selectOption('up');
    const leftAfter=await page.evaluate(()=>window.__readPalms());
    assert.ok(leftAfter.hands[1].quaternion.every((v,j)=>Math.abs(v-leftBefore.hands[1].quaternion[j])<1e-6),'right-hand edit leaves left hand alone');
    assert.deepEqual(normalize(leftAfter.pose.lHand),normalize(leftBefore.pose.lHand),'unselected wrist target is unchanged');
    await page.evaluate(()=>window.__fingerTutTest.undo());
    assert.equal(await page.locator('#fingerTutPreset').inputValue(),'down');
    await page.evaluate(()=>window.__fingerTutTest.redo());
    assert.equal(await page.locator('#fingerTutPreset').inputValue(),'up');
    assert.equal(await page.locator('.fingerTutFineTune').getAttribute('open'),null);
    await press('.fingerTutFineTune summary');
    for(const [key,value]of [['flip','35'],['tilt','20'],['yaw','25']]){
      await page.locator('#fingerTut_'+key).fill(value);await page.locator('#fingerTut_'+key).dispatchEvent('change');
    }
    const rotated=await page.evaluate(()=>window.__readPalms());
    await press('#fingerTutRecenter');
    const recentered=await page.evaluate(()=>window.__readPalms());
    for(let i=0;i<2;i++)assert.ok(recentered.hands[i].quaternion.every((v,j)=>Math.abs(v-rotated.hands[i].quaternion[j])<1e-6),'reposition preserves palm orientation');
    await page.locator('#fingerTutSide').selectOption('both');
    assert.equal(await page.locator('#fingerTutPreset').inputValue(),'mixed');
    assert.equal(await page.locator('#fingerTut_flipValue').textContent(),'不同');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'orientation controls fit the viewport');
    await page.locator('#fingerTutSide').selectOption('r');
    await press('#fingerTutPalmReset');
    assert.equal(await page.locator('#fingerTut_flip').inputValue(),'0');
    await page.evaluate(()=>window.__fingerTutTest.undo());
    assert.equal(await page.locator('#fingerTut_flip').inputValue(),'35');
    await page.locator('#fingerTutPreset').scrollIntoViewIfNeeded();
    await page.screenshot({path:`test-results/fingertut/${label}-orientation.png`});
    // Language switches must preserve the editing session and user-authored text.
    await page.evaluate(()=>{
      window.__fingerTutTest.selectJoint('rIndex2');
      document.getElementById('poseLibNameInput').value='自訂姿勢 English';
      document.getElementById('poseLibSaveBtn').click();
      document.getElementById('poseLibNameInput').value='尚未儲存 English';
    });
    const languageBefore=await page.evaluate(()=>({pose:window.__fingerTutTest.snapshotAngleState(),project:window.__fingerTutTest.snapshotTimelineData(),selected:document.getElementById('selectedLabel').textContent,custom:document.querySelector('#poseLibList .selName').textContent}));
    await page.locator('#languageSelect').selectOption('en');
    assert.equal(await page.locator('html').getAttribute('lang'),'en');
    assert.notEqual(await page.locator('.fingerTutFineTune').getAttribute('open'),null,'language switching preserves expanded fine-tuning');
    assert.equal(await page.locator('.tabBtn[data-tab=fingers]').textContent(),'Fingers');
    assert.equal(await page.locator('#fingerTutToggle').textContent(),'Exit FingerTut');
    assert.equal(await page.locator('#selectedLabel').textContent(),'Right hand Index · Mid');
    assert.equal(await page.locator('.fingerJointBtn[data-jointkey=rIndex2]').textContent(),'Mid');
    assert.match(await page.locator('.fingerJointBtn[data-jointkey=rIndex2]').getAttribute('title'),/Right hand Index/);
    assert.match(await page.locator('#fingerTutStatus').textContent(),/Hands are at chest level/);
    const languageAfter=await page.evaluate(()=>({pose:window.__fingerTutTest.snapshotAngleState(),project:window.__fingerTutTest.snapshotTimelineData(),custom:document.querySelector('#poseLibList .selName').textContent}));
    assert.deepEqual(languageAfter.pose,languageBefore.pose,'language preserves pose, rig, camera, selection and FingerTut revision');
    // Each export records its own timestamp; compare the actual project data.
    delete languageAfter.project.savedAt;delete languageBefore.project.savedAt;
    assert.deepEqual(languageAfter.project,languageBefore.project,'language preserves project schema and timeline');
    assert.equal(languageAfter.custom,languageBefore.custom,'custom library names are not translated');
    assert.equal(await page.locator('#poseLibNameInput').inputValue(),'尚未儲存 English');
    await page.locator('#fingerTutSide').selectOption('both');
    assert.equal(await page.locator('#fingerTut_flipValue').textContent(),'Mixed');
    await page.locator('#fingerTutSide').selectOption('r');
    if(mobile){
      await press('#mobilePanelToggle');
      assert.equal(await page.locator('#mobilePanelToggle').textContent(),'Expand ▴');
      const bounds=await page.locator('#languageSelect').boundingBox();assert.ok(bounds.height>=44&&bounds.x>=0&&bounds.x+bounds.width<=viewport.width);
      assert.equal(await page.evaluate(()=>{
        const panel=document.getElementById('ui').getBoundingClientRect();
        return ['languageSelect','mobilePanelToggle','uiHideBtn'].every(id=>{
          const r=document.getElementById(id).getBoundingClientRect();return r.x>=panel.x&&r.right<=panel.right;
        });
      }),true,'all collapsed drawer controls remain inside the panel');
      await page.locator('#languageSelect').selectOption('zh-Hant');
      assert.equal(await page.locator('#mobilePanelToggle').textContent(),'展開面板 ▴');
      await press('#mobilePanelToggle');await page.locator('#languageSelect').selectOption('en');
    }
    await press('#fingerFloatBtn');
    assert.equal(await page.locator('.floatablePanelTitle').textContent(),'✋ Finger FK / IK');
    await page.locator('#languageSelect').selectOption('zh-Hant');
    assert.equal(await page.locator('.floatablePanelTitle').textContent(),'✋ 手指 FK／IK');
    assert.equal(await page.locator('#fingerFloatBtn').textContent(),'📌 收合回面板');
    // On narrow screens the floating content covers the original tab button.
    await press('.floatablePanelDockBtn');
    await page.locator('#languageSelect').selectOption('en');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'English layout fits viewport');
    assert.equal(await page.evaluate(()=>Array.from(document.querySelectorAll('.fingerTutSlider')).every(label=>{
      const text=label.querySelector('span'),input=label.querySelector('input');
      return text.scrollWidth<=text.clientWidth && text.getBoundingClientRect().right<=input.getBoundingClientRect().left;
    })),true,'English slider labels do not overlap controls');
    await page.locator('#fingerTutPreset').scrollIntoViewIfNeeded();
    await page.screenshot({path:`test-results/fingertut/${label}-english.png`});
    await page.locator('#languageSelect').selectOption('zh-Hant');
    // Existing Undo/Redo assertions below also prove switching adds no history entries.
    const beforeSpacing=await page.evaluate(()=>window.__readPalms());
    await page.locator('#fingerTut_spacing').fill('32');await page.locator('#fingerTut_spacing').dispatchEvent('change');
    assert.equal(await page.locator('#fingerTut_spacingValue').textContent(),'32%');
    const afterSpacing=await page.evaluate(()=>window.__readPalms());
    for(let i=0;i<2;i++)assert.ok(afterSpacing.hands[i].quaternion.every((v,j)=>Math.abs(v-beforeSpacing.hands[i].quaternion[j])<1e-6),'spacing changes preserve palm orientation');
    await page.evaluate(()=>window.__fingerTutTest.undo());
    assert.equal(await page.locator('#fingerTut_spacing').inputValue(),'24');
    const pose=await page.evaluate(()=>window.__fingerTutTest.poseController.snapshotTarget());
    await press('#fingerTutToggle');assert.deepEqual(normalize(await page.evaluate(()=>window.__fingerTutTest.poseController.snapshotTarget())),normalize(pose),'exit preserves result');
    await page.evaluate(()=>document.getElementById('fingerTutRestore').addEventListener('click',()=>{window.__restoredPose=window.__fingerTutTest.poseController.snapshotTarget();},{once:true}));
    await press('#fingerTutRestore');
    assert.deepEqual(normalize(await page.evaluate(()=>window.__restoredPose)),before.pose,'restore original pose');
    assert.deepEqual(await page.evaluate(()=>window.__fingerTutTest.rig),before.state.rig,'restore original IK targets and flags');
    await page.locator('#languageSelect').selectOption('en');
    await page.reload();await page.waitForFunction(()=>document.getElementById('loading').style.display==='none');
    assert.equal(await page.locator('html').getAttribute('lang'),'en','language preference survives reload');
    assert.equal(await page.locator('#languageSelect').inputValue(),'en');
    assert.equal(await page.locator('#fingerTutToggle').textContent(),'Enable FingerTut');
    assert.equal(await page.locator('#spaceBtn').textContent(),'Space: Local');
    await page.locator('#languageSelect').selectOption('zh-Hant');
    assert.equal(await page.locator('html').getAttribute('lang'),'zh-Hant');
    assert.deepEqual(errors,[]);
    results.push({label,hands:placed.hands,checks:'pose preserved, chest placement, palm down, Undo/Redo, spacing, palm presets, single hand, wrist angles, orientation Undo/Redo, reposition preservation, exit, restore, bilingual UI, state and custom name preservation, floating/mobile labels, preference reload, no runtime errors'});
    console.log('PASS '+label);
  }catch(e){console.error('::error title=FingerTut regression::'+`${label}: ${e.stack||e}`.replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A'));await page.screenshot({path:`test-results/fingertut/${label}-failure.png`});throw e;}finally{await context.close();}
}
await writeFile('test-results/fingertut/results.json',JSON.stringify(results,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
