import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve,extname,sep } from 'node:path';
import { chromium } from 'playwright-core';
const root=resolve('.'),model=await readFile('.cache/Xbot.glb');
assert.equal(createHash('sha256').update(model).digest('hex'),'002f8d269de68e5dce3d25195caf390d1aa359bbfaae3fcf4c8dc78ec36c3ba5');
const probe=`\nwindow.__languageTest={renderer,snapshotAngleState,snapshotTimelineData,poseController,addKeyframe,selectKeyframe,setKfMultiSelectMode,toggleKfMultiSelectItem,copyTimelineSelection,setIKEnabled,tuttingController,waveController,groovePanelController,orientationController,history,undo,redo,get grabBoxCore(){return grabBoxCore;},get poseLibCtrl(){return poseLibCtrl;},get grooveLibCtrl(){return grooveLibCtrl;},get playing(){return kfPlaying;},get waveRun(){return waveRun;},get candidates(){return tgCandidates;},get clipboard(){return timelineClipboard;},get rangeClipboard(){return beatGridRangeClipboard;},toggleKeyframePlayback};`;

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

const entries=process.env.LANGUAGE_ENTRY?[process.env.LANGUAGE_ENTRY]:['/index.html','/dist/index.html'];
const widths=(process.env.LANGUAGE_WIDTHS||'1280,320,390,844').split(',').map(Number);
const viewports=[{width:1280,height:900},{width:320,height:568},{width:390,height:844},{width:844,height:390}].filter(v=>widths.includes(v.width));
assert.ok(viewports.length,'at least one viewport required');
await mkdir('test-results/language',{recursive:true});
try{for(const entry of entries)for(const viewport of viewports){
 const mobile=viewport.width!==1280,label=(entry.includes('dist')?'dist':'source')+'-'+viewport.width;
 const caseStarted=Date.now();
 const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack||e.message));const dialogs=[];page.on('dialog',d=>{dialogs.push(d.message());d.accept();});const consoleErrors=[];page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
 await page.route('https://unpkg.com/three@0.160.0/**',async route=>{
   const suffix=new URL(route.request().url()).pathname.slice('/three@0.160.0/'.length);
   await route.fulfill({body:await readFile(resolve(root,'node_modules/three',suffix)),contentType:'text/javascript'});
 });
 await page.route('https://threejs.org/examples/models/gltf/Xbot.glb',route=>route.fulfill({body:model,contentType:'model/gltf-binary'}));
 const press=async selector=>{const el=page.locator(selector);await el.scrollIntoViewIfNeeded();if(mobile)await el.tap();else await el.click();};
 try{
   await page.goto(`http://127.0.0.1:${server.address().port}${entry}`);
   await page.waitForFunction(()=>document.getElementById('loading').style.display==='none');
   await page.evaluate(()=>{
     // Lower only WebGL backing resolution; CSS viewport, picking and DOM checks stay unchanged.
     window.__languageTest.renderer.setPixelRatio(0.5);
     const a=window.__languageTest;a.poseController.setTarget('rIndex2',[12,4,-8]);
     a.addKeyframe();a.poseController.setTarget('rArm',[12,18,30]);a.addKeyframe();a.history.push();a.addKeyframe();a.selectKeyframe(1);a.history.push();
     a.poseLibCtrl.saveCurrent('自訂名稱 My pose');
     a.grooveLibCtrl.saveCurrent('律動名稱 My groove');
     document.getElementById('poseLibNameInput').value='尚未儲存 Draft';
     document.getElementById('tgSeed').value='2468';document.getElementById('grooveGenSeedInput').value='1234';
     window.__controlRefs=Array.from(document.querySelectorAll('input,select,button'));
     window.__project=()=>{const data=a.snapshotTimelineData();delete data.savedAt;return data;};
     window.__switchAndCompare=locale=>{
       const snapshot=()=>JSON.stringify({pose:a.snapshotAngleState(),project:window.__project(),clipboard:a.clipboard,rangeClipboard:a.rangeClipboard,playing:a.playing,preview:a.waveRun&&{phase:a.waveRun.phase,playing:a.waveRun.playing,config:a.waveRun.config},canUndo:a.history.canUndo,canRedo:a.history.canRedo});
       const before=snapshot(),select=document.getElementById('languageSelect');select.value=locale;select.dispatchEvent(new Event('change',{bubbles:true}));
       return {same:snapshot()===before,controls:window.__controlRefs.every(node=>node.isConnected),locale:document.documentElement.lang};
     };
   });
   assert.deepEqual(await page.evaluate(()=>window.__switchAndCompare('en')),{same:true,controls:true,locale:'en'});
   if(mobile)assert.equal(await page.locator('#languageSelect').evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===el||el.contains(hit);}),true,'language selector is not covered by the Display overlay');
   assert.equal(await page.locator('#poseLibNameInput').inputValue(),'尚未儲存 Draft');
   assert.equal(await page.locator('#tgSeed').inputValue(),'2468');
   assert.equal(await page.locator('#kfEasingSelect').inputValue(),'easeInOutQuad');
   assert.equal(await page.locator('#poseLibList .selName').textContent(),'自訂名稱 My pose');
   assert.equal(await page.locator('#grooveLibList .selName').textContent(),'律動名稱 My groove');
   assert.match(await page.locator('#kfTotalDuration').textContent(),/3 poses/);
   assert.match(await page.locator('#kfInspectorMode').textContent(),/Transition/);
   assert.equal(await page.locator('#poseLibNameInput').getAttribute('placeholder'),'Enter pose name…');
   assert.equal(await page.locator('#kfEasingSelect optgroup').first().getAttribute('label'),'Basic');
   // Every requested panel's visible labels and descriptions must be English.
   for(const tab of ['poseLib','gestureLib','moveLib','keyframe','groove','waving','ik','lookAt','tuttingGen','json','splitView','grabBox','fingers','traj','overview','jointLimits','easingGallery']){
     await press(`.tabBtn[data-tab="${tab}"]`);
     const untranslated=await page.locator('.tabPanel.active').evaluate(panel=>{
       const walker=document.createTreeWalker(panel,NodeFilter.SHOW_TEXT),out=[];
       for(let node;node=walker.nextNode();){
         const parent=node.parentElement;
         if(parent.closest('.selName,.kfLabelBtn,#grooveSeqList select'))continue;
         if(parent.getClientRects().length&&/[\u4e00-\u9fff]/.test(node.textContent))out.push(node.textContent.trim());
       }return out;
     });
     assert.deepEqual(untranslated,[],`${tab}: all displayed labels translated`);
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${tab}: no page overflow`);
   }
   await press('.tabBtn[data-tab="keyframe"]');
   await page.screenshot({path:`test-results/language/${label}-timeline-en.png`});
   // A locale change must not insert an undo entry: the prior edit had two poses.
   await page.evaluate(()=>window.__languageTest.undo());
   assert.match(await page.locator('#kfTotalDuration').textContent(),/2 poses/);
   await page.evaluate(()=>window.__languageTest.redo());
   assert.match(await page.locator('#kfTotalDuration').textContent(),/3 poses/);
   // JSON drafts and validation feedback must update without rewriting the editor.
   await press('.tabBtn[data-tab="json"]');
   const draft='{ "rArm": [12,';
   await page.locator('#jsonArea').fill(draft);
   assert.match(await page.locator('.jrVal').first().textContent(),/incomplete|syntax/);
   assert.equal((await page.evaluate(()=>window.__switchAndCompare('zh-Hant'))).same,true);
   assert.equal(await page.locator('#jsonArea').inputValue(),draft);
   assert.match(await page.locator('.jrVal').first().textContent(),/JSON 尚未/);
   await press('#applyJsonBtn');assert.match(dialogs.at(-1),/JSON 格式錯誤/);
   await page.evaluate(()=>window.__switchAndCompare('en'));
   await press('#applyJsonBtn');assert.match(dialogs.at(-1),/Invalid JSON/);
   const validDraft='{ "rArm": [1,2,3], "備註": "自訂內容" }';
   await page.locator('#jsonArea').fill(validDraft);
   const valueRow=page.locator('.jrRow').filter({has:page.locator('.jrKey', {hasText:/^rArm$/})}).locator('.jrVal');
   assert.match(await valueRow.textContent(),/X 1\.0/);
   await page.evaluate(()=>window.__switchAndCompare('zh-Hant'));
   assert.equal(await page.locator('#jsonArea').inputValue(),validDraft);
   assert.match(await valueRow.textContent(),/X 1\.0/,'old validation errors cannot overwrite valid values');
   await page.evaluate(()=>window.__switchAndCompare('en'));
   await page.screenshot({path:`test-results/language/${label}-json-en.png`});
   // Joint names are searchable in either language, independently of current locale.
   await press('.tabBtn[data-tab="overview"]');await page.locator('#ovFilterInput').fill('right arm');
   assert.ok(await page.locator('#overviewGroups .ovRow').count()>0);
   await page.evaluate(()=>window.__switchAndCompare('zh-Hant'));
   await page.locator('#ovFilterInput').fill('right ar');
   assert.ok(await page.locator('#overviewGroups .ovRow').count()>0);
   await page.locator('#ovFilterInput').fill('右手');assert.ok(await page.locator('#overviewGroups .ovRow').count()>0);
   await page.locator('#ovFilterInput').fill('');await page.evaluate(()=>window.__switchAndCompare('en'));
   await press('.tabBtn[data-tab="jointLimits"]');await press('#jlAdvancedToggleBtn');
   await page.locator('#jlFilterInput').fill('right arm');
   assert.ok(await page.locator('#jointLimitGroups .jlJointBlock').count()>0);
   await page.evaluate(()=>{
     window.__limitRefs=Array.from(document.querySelectorAll('#jointLimitGroups input'));
     window.__limitRefs[0].value='37';
   });
   await page.evaluate(()=>window.__switchAndCompare('zh-Hant'));
   assert.equal(await page.evaluate(()=>window.__limitRefs.every(node=>node.isConnected)&&window.__limitRefs[0].value==='37'),true);
   await page.evaluate(()=>window.__switchAndCompare('en'));
   assert.match(await page.locator('#jointLimitGroups input').first().getAttribute('aria-label'),/Right arm/i);
   await page.screenshot({path:`test-results/language/${label}-limits-en.png`});
   await page.locator('#jlFilterInput').fill('');
   // A migrated icon tooltip keeps its localized accessible name, without a native title.
   const tooltip=page.locator('#jointLimitGroups input').first();await tooltip.scrollIntoViewIfNeeded();await tooltip.focus();
   await page.waitForFunction(()=>document.querySelector('.customTooltip.visible'));
   await page.evaluate(()=>window.__switchAndCompare('zh-Hant'));
   assert.equal(await tooltip.getAttribute('title'),null);
   await tooltip.focus();await page.evaluate(()=>window.__switchAndCompare('en'));
   assert.equal(await tooltip.getAttribute('title'),null);
   // Grab shape sliders and hand contacts keep their DOM and core state.
   await press('.tabBtn[data-tab="grabBox"]');await press('#grabShapeBtns [data-shape="cylinder"]');
   await page.locator('#grabParam_cylinder_r').fill('0.23');
   await page.locator('#grabHandCb_rArm').check();
   const grab=await page.evaluate(()=>JSON.stringify(window.__languageTest.grabBoxCore.getState()));
   await page.evaluate(()=>{window.__grabSlider=document.getElementById('grabParam_cylinder_r');});
   assert.equal((await page.evaluate(()=>window.__switchAndCompare('zh-Hant'))).same,true);
   assert.equal(await page.evaluate(()=>window.__grabSlider===document.getElementById('grabParam_cylinder_r')),true);
   assert.equal(await page.evaluate(()=>JSON.stringify(window.__languageTest.grabBoxCore.getState())),grab);
   await page.evaluate(()=>window.__switchAndCompare('en'));
   await page.screenshot({path:`test-results/language/${label}-grab-en.png`});
   await page.locator('#grabHandCb_rArm').uncheck();
   await page.evaluate(()=>window.__languageTest.setIKEnabled('rArm',false));
   // Trajectory configuration and point controls survive language updates.
   await press('.tabBtn[data-tab="traj"]');await page.locator('#trajShapeTypeSelect').selectOption('ellipse');
   assert.match(await page.locator('#trajShapeRadiusLabel').textContent(),/Major radius/);
   await page.locator('#trajShapeRadiusInput').fill('0.234');await press('#trajGenShapeBtn');
   const pointCount=await page.locator('#trajPointList button').count();assert.ok(pointCount>=4);
   await page.evaluate(()=>window.__switchAndCompare('zh-Hant'));
   assert.match(await page.locator('#trajShapeRadiusLabel').textContent(),/長半徑/);
   assert.equal(await page.locator('#trajShapeRadiusInput').inputValue(),'0.234');
   assert.equal(await page.locator('#trajPointList button').count(),pointCount);
   await page.evaluate(()=>window.__switchAndCompare('en'));
   assert.match(await page.locator('#trajPointList .del').first().getAttribute('aria-label'),/Delete control point/);
   // Keep Easing animation running and SVG references connected across languages.
   await press('.tabBtn[data-tab="easingGallery"]');await press('#egPlayBtn');
   await page.evaluate(()=>{window.__easingDot=document.querySelector('.egDot');window.__easingCard=window.__easingDot.closest('.egCard');});
   await page.evaluate(()=>window.__switchAndCompare('zh-Hant'));
   assert.match(await page.locator('#egPlayBtn').textContent(),/暫停/);
   await page.evaluate(()=>window.__switchAndCompare('en'));
   assert.match(await page.locator('#egPlayBtn').textContent(),/Pause/);
   assert.equal(await page.evaluate(()=>window.__easingDot.isConnected&&window.__easingCard===window.__easingDot.closest('.egCard')),true);
   await press('#egPlayBtn');await press('.tabBtn[data-tab="keyframe"]');
   // Multi-select and clipboard remain unchanged across language switches.
   await page.evaluate(()=>{const a=window.__languageTest;a.setKfMultiSelectMode(true);a.toggleKfMultiSelectItem(0);a.toggleKfMultiSelectItem(1);a.copyTimelineSelection();});
   assert.match(await page.locator('#kfMultiSelectCount').textContent(),/Selected/);
   assert.equal((await page.evaluate(()=>window.__switchAndCompare('zh-Hant'))).same,true);
   assert.match(await page.locator('#kfMultiSelectCount').textContent(),/已選/);
   await page.evaluate(()=>window.__languageTest.setKfMultiSelectMode(false));
   assert.equal((await page.evaluate(()=>window.__switchAndCompare('en'))).same,true);
   await page.evaluate(()=>window.__languageTest.toggleKeyframePlayback());
   assert.equal(await page.evaluate(()=>window.__languageTest.playing),true);
   assert.equal((await page.evaluate(()=>window.__switchAndCompare('zh-Hant'))).same,true);
   assert.equal((await page.evaluate(()=>window.__switchAndCompare('en'))).same,true);
   await page.evaluate(()=>window.__languageTest.toggleKeyframePlayback());
   // Generate candidates: seed and pending candidates survive text-only updates.
   await press('.tabBtn[data-tab="tuttingGen"]');await press('#tgGenerate');
   assert.ok(await page.evaluate(()=>window.__languageTest.candidates.length>0));
   assert.match(await page.locator('#tgCandidateInfo').textContent(),/Candidate/);
   const candidates=await page.evaluate(()=>JSON.stringify(window.__languageTest.candidates));
   assert.equal((await page.evaluate(()=>window.__switchAndCompare('zh-Hant'))).same,true);
   assert.match(await page.locator('#tgCandidateInfo').textContent(),/候選/);
   assert.match(await page.locator('#tgStatus').textContent(),/產生/);
   assert.equal(await page.evaluate(()=>JSON.stringify(window.__languageTest.candidates)),candidates);
   await page.locator('#languageSelect').selectOption('en');
   await page.screenshot({path:`test-results/language/${label}-generator-en.png`});
   // Groove generator metadata and joint toggles also update without rebuilding.
   await press('.tabBtn[data-tab="groove"]');
   await page.evaluate(()=>{document.getElementById('grooveGenAutoPreviewChk').checked=false;});
   await press('#grooveGenRollBtn');
   assert.match(await page.locator('#grooveGenResult').textContent(),/Seed/);
   await page.evaluate(()=>window.__switchAndCompare('zh-Hant'));
   assert.match(await page.locator('#grooveGenResult').textContent(),/種子/);
   await page.evaluate(()=>window.__switchAndCompare('en'));
   // Wave can keep playing; compare snapshots in one event turn to exclude clock progression.
   await press('.tabBtn[data-tab="waving"]');await press('#wavePlay');
   assert.equal(await page.evaluate(()=>window.__languageTest.waveRun?.playing),true);
   assert.equal((await page.evaluate(()=>window.__switchAndCompare('zh-Hant'))).same,true);
   assert.match(await page.locator('#waveStatus').textContent(),/播放中/);
   assert.equal((await page.evaluate(()=>window.__switchAndCompare('en'))).same,true);
   assert.match(await page.locator('#waveStatus').textContent(),/Playing/);
   assert.match(await page.locator('#waveRouteHint').textContent(),/Left/);
   await press('#wavePause');
   await page.screenshot({path:`test-results/language/${label}-wave-en.png`});
   await press('#waveStop');
   await page.evaluate(()=>window.__switchAndCompare('zh-Hant'));
   assert.match(await page.locator('#waveStatus').textContent(),/已停止/);
   await page.evaluate(()=>window.__switchAndCompare('en'));
   // IK state and LookAt point controls retain their values and identity.
   await press('.tabBtn[data-tab="ik"]');await press('#ikBtn_rArm');
   assert.equal((await page.evaluate(()=>window.__switchAndCompare('zh-Hant'))).same,true);
   await page.evaluate(()=>window.__switchAndCompare('en'));
   await press('.tabBtn[data-tab="lookAt"]');await page.locator('#laPathShape').selectOption('custom');await press('#laCustomSquare');
   const points=await page.locator('#laCustomList button').count();assert.ok(points>=4);
   await page.evaluate(()=>window.__switchAndCompare('zh-Hant'));
   assert.equal(await page.locator('#laCustomList button').count(),points,'language does not erase editable control points');
   await page.locator('#languageSelect').selectOption('en');
   await page.reload();await page.waitForFunction(()=>document.getElementById('loading').style.display==='none');
   assert.equal(await page.locator('html').getAttribute('lang'),'en');
   assert.match(await page.locator('#poseLibList .selName').textContent(),/自訂名稱 My pose/);
   assert.match(await page.locator('#kfTotalDuration').textContent(),/poses/);
   assert.deepEqual(errors,[]);
   console.log('PASS language '+label+': 17 tabs, JSON drafts/errors, bilingual search, limits/tooltips, grab, trajectory, Easing, history/playback, libraries, clipboard, generators, IK/LookAt, reload ('+((Date.now()-caseStarted)/1000).toFixed(1)+'s)');
 }catch(error){
   console.error('Browser errors:',JSON.stringify({errors,consoleErrors}));
   console.error('::error title=Language regression::'+`${label}: ${error.stack||error}`.replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A'));
   await page.screenshot({path:`test-results/language/${label}-failure.png`});throw error;
 }finally{await context.close();}
}}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
