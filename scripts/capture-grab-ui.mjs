// Capture the current Traditional Chinese Grab box UI using the regression model fixture.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright-core';
const root=resolve('.'),output=resolve(root,'docs/images');
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
  for(const mobile of [false,true]){
    const {context,page,press,tab,shot}=await open(mobile?{width:390,height:844}:{width:1280,height:960},mobile);
    await tab('grabBox');
    if(!mobile){
      const h=await page.locator('#uiResizeHandle').boundingBox();
      await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();
      await page.mouse.move(h.x+h.width/2,h.y+h.height/2-210,{steps:6});await page.mouse.up();
    }
    await press('#grabVisibleBtn');await press('#grabShapeBtns [data-shape="cylinder"]');
    await page.locator('#grabParam_cylinder_r').fill('0.23');await press('#grabModeBtn');
    await press('#grabPresetBottom');await page.locator('#grabPalmAlign').check();
    assert.equal(await page.locator('#grabVisibleBtn').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#grabParamVal_cylinder_r').textContent(),'0.23');
    assert.equal(await page.locator('#grabModeBtn').textContent(),'操作：旋轉');
    assert.equal(await page.locator('#grabHandState_rArm').textContent(),'已啟用');
    assert.equal(await page.locator('#grabHandState_lArm').textContent(),'已啟用');
    assert.equal(await page.locator('#grabPresetBottom').getAttribute('aria-pressed'),'true');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.locator('#uiTabBody').evaluate(el=>el.scrollTop=0);
    await shot(mobile?'grab-ui-mobile':'grab-ui-desktop');
    if(mobile){
      await page.locator('#grabShapeBtns').scrollIntoViewIfNeeded();await shot('grab-ui-mobile-dimensions');
      await page.locator('.grabContactCard').scrollIntoViewIfNeeded();await shot('grab-ui-mobile-contact');
      await page.locator('#grabPalmTwist_rArm').fill('35');await page.locator('#grabPalmTwist_rArm').dispatchEvent('change');
      await page.locator('#grabPalmTwist_lArm').scrollIntoViewIfNeeded();await shot('grab-ui-mobile-palms');
      assert.equal(await page.locator('#grabPalmTwistValue_rArm').textContent(),'35°');
    }
    await press('#grabVisibleBtn');assert.equal(await page.locator('#grabHandCb_rArm').isChecked(),false);
    await context.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS: 5 Grab box screenshots; palm alignment and independent wrist twist; one-click bottom support, visibility, dimensions, rotation, both hand contacts and hide/release.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
