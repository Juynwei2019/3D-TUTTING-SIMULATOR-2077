import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright-core';
const root=resolve('.');
const model=await readFile(resolve('.cache/Xbot.glb'));
assert.equal(createHash('sha256').update(model).digest('hex'),'002f8d269de68e5dce3d25195caf390d1aa359bbfaae3fcf4c8dc78ec36c3ba5');
const server=createServer(async(req,res)=>{
  try{
    const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
    if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}
    res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[extname(path)]||'application/octet-stream'});
    res.end(await readFile(path));
  }catch(error){res.writeHead(500).end(String(error));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
  browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']});
  for(const entry of ['/index.html','/dist/index.html']){
    for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]){
      const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,deviceScaleFactor:1});
      context.setDefaultTimeout(30000);
      const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
      page.on('dialog',d=>d.accept());
      await page.route('https://unpkg.com/three@0.160.0/**',async route=>{
        const suffix=new URL(route.request().url()).pathname.slice('/three@0.160.0/'.length);
        await route.fulfill({body:await readFile(resolve(root,'node_modules/three',suffix)),contentType:'text/javascript'});
      });
      await page.route('https://threejs.org/examples/models/gltf/Xbot.glb',r=>r.fulfill({body:model,contentType:'model/gltf-binary'}));
      try{
        // Saved desktop float dimensions must not expand a mobile viewport.
        await page.addInitScript(()=>{localStorage.setItem('tuttingUIFloating','1');localStorage.setItem('tuttingUIFloatRect',JSON.stringify({left:24,top:64,width:900,height:650}));});
        await page.goto(`http://127.0.0.1:${server.address().port}${entry}`);
        await page.waitForFunction(()=>document.getElementById('loading').style.display==='none');
        const layout=()=>page.evaluate(()=>{const r=document.getElementById('ui').getBoundingClientRect();return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,panel:{x:r.x,y:r.y,width:r.width,height:r.height},viewportHeight:innerHeight};});
        const initial=await layout();assert.equal(initial.width,viewport.width);assert.ok(initial.scrollWidth<=viewport.width,JSON.stringify(initial));
        assert.ok(initial.panel.x>=0&&initial.panel.y>=0);assert.ok(initial.panel.height<=viewport.height);
        if(viewport.width<641)assert.ok(initial.panel.y>=viewport.height*0.35);else assert.ok(initial.panel.x>=viewport.width*0.5);
        const canvasRect=await page.locator('#canvasHolder').boundingBox();
        if(viewport.width<641)assert.ok(canvasRect.y+canvasRect.height<=initial.panel.y+1);
        else assert.ok(canvasRect.x+canvasRect.width<=initial.panel.x+1);
        for(const button of await page.locator('.tabBtn').all()){
          await button.scrollIntoViewIfNeeded();await button.tap();
          assert.ok((await layout()).scrollWidth<=viewport.width,await button.textContent());
          const rect=await button.boundingBox();assert.ok(rect.width>=44&&rect.height>=44, JSON.stringify({label:await button.textContent(),rect}));
        }
        await page.locator('.tabBtn[data-tab="keyframe"]').scrollIntoViewIfNeeded();
        await page.locator('.tabBtn[data-tab="keyframe"]').tap();
        await page.locator('#kfAddBtn').scrollIntoViewIfNeeded();await page.locator('#kfAddBtn').tap();
        assert.equal(await page.locator('#kfList .kfChip').count(),1);
        await page.locator('#mobilePanelToggle').tap();assert.equal(await page.locator('#mobilePanelToggle').getAttribute('aria-expanded'),'false');
        assert.ok((await layout()).panel.height<=100);
        await page.locator('#mobilePanelToggle').tap();assert.equal(await page.locator('#mobilePanelToggle').getAttribute('aria-expanded'),'true');
        await page.locator('#uiHideBtn').tap();await page.locator('#uiShowBtn').tap();assert.ok(await page.locator('#mobilePanelToggle').isVisible());
        await mkdir('test-results',{recursive:true});
        await page.screenshot({path:`test-results/mobile-layout-${entry.includes('dist')?'dist':'source'}-${viewport.width}.png`,timeout:10000});
        await page.setViewportSize(viewport.width<641?{width:844,height:390}:{width:390,height:844});
        await page.waitForFunction(width=>innerWidth===width,viewport.width<641?844:390);
        assert.equal((await layout()).width,viewport.width<641?844:390);
        assert.ok((await layout()).scrollWidth<=(viewport.width<641?844:390));
        assert.deepEqual(errors,[]);
        console.log(`PASS mobile ${entry} ${viewport.width}x${viewport.height}: viewport, tabs, touch targets, frame, drawer, visibility, orientation`);
      }catch(error){
        await mkdir('test-results',{recursive:true});const name=`mobile-${entry.includes('dist')?'dist':'source'}-${viewport.width}`;
        await page.screenshot({path:`test-results/${name}.png`,timeout:10000});await writeFile(`test-results/${name}.json`,JSON.stringify({errors,message:String(error)},null,2));throw error;
      }finally{await context.close();}
    }
  }
}finally{await browser?.close();server.close();}
