// Refresh the basic manual with real UI screenshots and verify its three-pose exercise.
// Uses the same Three.js and checksum-verified model fixture as browser regressions.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright-core';
const root=resolve('.'),output=resolve(root,'docs/images/basic-manual');
const model=await readFile('.cache/Xbot.glb');
assert.equal(createHash('sha256').update(model).digest('hex'),'002f8d269de68e5dce3d25195caf390d1aa359bbfaae3fcf4c8dc78ec36c3ba5');
await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{
  try{
    const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
    if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}
    res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[extname(path)]||'application/octet-stream'}).end(await readFile(path));
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
const errors=[];
async function open(viewport,mobile=false){
  const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route('https://unpkg.com/three@0.160.0/**',async route=>{
    const suffix=new URL(route.request().url()).pathname.slice('/three@0.160.0/'.length);
    const path=resolve(root,'node_modules/three',suffix);assert.ok(path.startsWith(resolve(root,'node_modules/three')+sep));
    await route.fulfill({body:await readFile(path),contentType:'text/javascript'});
  });
  await page.route('https://threejs.org/examples/models/gltf/Xbot.glb',route=>route.fulfill({body:model,contentType:'model/gltf-binary'}));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForFunction(()=>document.getElementById('loading').style.display==='none');
  const press=async s=>{const el=page.locator(s);await el.scrollIntoViewIfNeeded();if(mobile)await el.tap();else await el.click();};
  const tab=async name=>press(`.tabBtn[data-tab="${name}"]`);
  const shot=async name=>{await page.mouse.move(0,0);await page.waitForTimeout(450);await page.evaluate(()=>document.activeElement?.blur());await page.screenshot({path:resolve(output,name+'.png')});};
  return {context,page,press,tab,shot};
}
try{
  browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']});
  const {context,page,press,tab,shot}=await open({width:1280,height:960});
  await shot('01-interface');
  await tab('fingers');
  const topHandle=await page.locator('#uiResizeHandle').boundingBox();
  await page.mouse.move(topHandle.x+topHandle.width/2,topHandle.y+topHandle.height/2);await page.mouse.down();
  await page.mouse.move(topHandle.x+topHandle.width/2,topHandle.y+topHandle.height/2-80,{steps:8});await page.mouse.up();
  await shot('08-fingertut-inactive');
  await press('#fingerTutToggle');
  assert.equal(await page.locator('#fingerTutToggle').getAttribute('aria-pressed'),'true');
  await shot('02-fingertut');
  await page.locator('#fingerTutPreset').selectOption('in');
  await shot('03-palm-direction');
  await press('button[data-jointkey="rIndex2"]');
  assert.match(await page.locator('#selectedLabel').textContent(),/食指|Index/);
  await shot('04-finger-joint');
  for(const preset of ['down','in','out']){
    await tab('fingers');await page.locator('#fingerTutPreset').selectOption(preset);
    await tab('keyframe');await press('#kfAddBtn');
  }
  assert.match(await page.locator('#kfTotalDuration').textContent(),/3 個姿勢/);
  const handle=await page.locator('#uiResizeHandle').boundingBox();
  await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();
  await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2-180,{steps:8});await page.mouse.up();
  await page.locator('#uiTabBody').evaluate(el=>el.scrollTop=0);
  await shot('05-timeline');
  await press('#kfPlayBtn');assert.match(await page.locator('#kfPlayBtn').textContent(),/停止/);await press('#kfPlayBtn');
  const downloadPromise=page.waitForEvent('download');await press('#kfExportBtn');
  const download=await downloadPromise;const project=JSON.parse(await readFile(await download.path(),'utf8'));
  assert.equal(project.keyframes.length,3);
  assert.notDeepEqual(project.keyframes[0].angles,project.keyframes[1].angles);
  assert.notDeepEqual(project.keyframes[1].angles,project.keyframes[2].angles);
  await press('#kfAddBtn');assert.match(await page.locator('#kfTotalDuration').textContent(),/4 個姿勢/);
  await page.locator('#kfImportFile').setInputFiles({name:'basic-manual-example.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
  await page.waitForFunction(()=>document.getElementById('kfTotalDuration').textContent.startsWith('3 個姿勢'));
  await tab('poseLib');await page.locator('#poseLibNameInput').fill('基礎練習－胸前姿勢');await press('#poseLibSaveBtn');
  assert.match(await page.locator('#poseLibList').textContent(),/基礎練習－胸前姿勢/);
  await shot('06-pose-library');await context.close();
  const mobile=await open({width:390,height:844},true);
  await mobile.tab('fingers');await mobile.press('#fingerTutToggle');await mobile.page.locator('#fingerTutPreset').selectOption('in');
  assert.equal(await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await mobile.shot('07-mobile');
  await mobile.press('#mobilePanelToggle');assert.equal(await mobile.page.locator('#mobilePanelToggle').getAttribute('aria-expanded'),'false');
  await mobile.press('#mobilePanelToggle');await mobile.context.close();
  assert.deepEqual(errors,[]);console.log('PASS: 8 manual screenshots; FingerTut, palm presets, joint selection, 3 distinct poses, playback, JSON export/import, pose library, mobile collapse/expand.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
