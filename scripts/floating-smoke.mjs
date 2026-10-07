// Exercise narrow desktop floating panels with the real app and verified model.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright-core';
const root=resolve('.'),output=resolve(root,'test-results/floating');
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
try{
  browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']});
  for(const entry of (process.env.FLOATING_ENTRY?[process.env.FLOATING_ENTRY]:['/index.html','/dist/index.html'])){
    for(const viewport of [{width:834,height:403},{width:1280,height:900},{width:700,height:360}]){
      const context=await browser.newContext({viewport});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
      await page.route('https://unpkg.com/three@0.160.0/**',async route=>{
        const suffix=new URL(route.request().url()).pathname.slice('/three@0.160.0/'.length);
        await route.fulfill({body:await readFile(resolve(root,'node_modules/three',suffix)),contentType:'text/javascript'});
      });
      await page.route('https://threejs.org/examples/models/gltf/Xbot.glb',r=>r.fulfill({body:model,contentType:'model/gltf-binary'}));
      const label=(entry.includes('dist')?'dist':'source')+'-'+viewport.width;
      try{
        await page.goto(`http://127.0.0.1:${server.address().port}${entry}`);
        await page.waitForFunction(()=>document.getElementById('loading').style.display==='none');
        await page.locator('.tabBtn[data-tab="grabBox"]').click();
        await page.locator('#uiFloatBtn').click();
        await page.waitForFunction(()=>{const tab=document.querySelector('#uiTabBar .tabBtn.active').getBoundingClientRect(),nav=document.getElementById('uiTabBar').getBoundingClientRect();return tab.left>=nav.left-1&&tab.right<=nav.right+1;});
        await page.screenshot({path:resolve(output,label+'-initial.png')});
        const measure=()=>page.evaluate(()=>{
          const ui=document.getElementById('ui').getBoundingClientRect(),nav=document.getElementById('uiTabBar'),r=nav.getBoundingClientRect(),body=document.getElementById('uiTabBody');
          return {panel:{x:ui.x,y:ui.y,width:ui.width,height:ui.height},nav:{x:r.x,width:r.width,height:r.height,scrollWidth:nav.scrollWidth,clientWidth:nav.clientWidth},body:body.clientHeight,
            buttons:[...nav.children].map(b=>({height:b.getBoundingClientRect().height,whiteSpace:getComputedStyle(b).whiteSpace})),pageWidth:document.documentElement.scrollWidth};
        });
        const layout=await measure();
        console.log(label+' '+JSON.stringify({panel:layout.panel,nav:layout.nav,body:layout.body}));
        assert.ok(layout.nav.height<=48,'tabs stay in one horizontal row');
        assert.ok(layout.nav.x+layout.nav.width<=layout.panel.x+layout.panel.width,'tab scroller stays inside panel');
        assert.ok(layout.buttons.every(b=>b.whiteSpace==='nowrap'&&b.height<=48),'labels never stack vertically');
        assert.ok(layout.body>=44,'active panel retains usable scrolling space');
        assert.ok(layout.pageWidth<=viewport.width,'no page-wide overflow');
        if(viewport.width===700){
          const h=await page.locator('#uiFloatResizeHandle').boundingBox();
          await page.mouse.move(h.x+10,h.y+10);await page.mouse.down();
          await page.mouse.move(h.x+10-140,h.y+10-80,{steps:4});await page.mouse.up();
          const narrow=await measure();assert.equal(narrow.panel.width,300);assert.ok(narrow.body>=44);assert.ok(narrow.nav.height<=48);
        }
        for(const tab of await page.locator('.tabBtn').all()){
          await tab.click();assert.equal(await tab.getAttribute('class').then(s=>s.includes('active')),true);
        }
        await page.locator('.tabBtn[data-tab="grabBox"]').click();
        await page.locator('#grabPresetSides').click();
        await page.locator('#uiTabBody').evaluate(el=>{el.scrollTop=el.scrollHeight;});
        assert.ok(await page.locator('#uiTabBody').evaluate(el=>el.scrollTop>0),'content scrolls independently');
        await page.locator('#languageSelect').selectOption('en');
        assert.ok((await measure()).nav.height<=48,'English remains in one row');
        await page.locator('#languageSelect').selectOption('zh-Hant');
        const handle=await page.locator('#uiDragHandle').boundingBox(),before=await measure();
        await page.mouse.move(handle.x+30,handle.y+8);await page.mouse.down();
        await page.mouse.move(handle.x+100,handle.y+20,{steps:4});await page.mouse.up();
        const moved=await measure();assert.notEqual(moved.panel.x,before.panel.x);
        assert.ok(Math.abs(moved.panel.width-before.panel.width)<1,'drag does not change width');
        const resize=await page.locator('#uiFloatResizeHandle').boundingBox();
        await page.mouse.move(resize.x+10,resize.y+10);await page.mouse.down();
        await page.mouse.move(viewport.width-1,viewport.height-1,{steps:4});await page.mouse.up();
        const enlarged=await measure();
        assert.ok(enlarged.panel.y>=34&&enlarged.panel.y+enlarged.panel.height<=viewport.height,'resize retains top action access');
        await page.locator('#uiDragHandle').dblclick();
        await page.locator('#uiTabBody').evaluate(el=>{el.scrollTop=0;});
        await page.locator('#uiFloatBtn').click();assert.equal(await page.locator('#ui').evaluate(el=>el.classList.contains('uiFloating')),false);
        await page.locator('#uiFloatBtn').click();
        await page.locator('.tabBtn[data-tab="grabBox"]').click();
        await page.screenshot({path:resolve(output,label+'-fixed.png')});
        await page.reload();await page.waitForFunction(()=>document.getElementById('loading').style.display==='none');
        assert.equal(await page.locator('#ui').evaluate(el=>el.classList.contains('uiFloating')),true);
        assert.ok((await measure()).nav.height<=48);
        await page.waitForFunction(()=>{const t=document.querySelector('#uiTabBar .tabBtn.active').getBoundingClientRect(),n=document.getElementById('uiTabBar').getBoundingClientRect();return t.left>=n.left-1&&t.right<=n.right+1;});
        assert.deepEqual(errors,[]);
        console.log('PASS '+label+': tabs, contents, languages, dragging, resizing, docking and reload');
      }catch(e){await page.screenshot({path:resolve(output,label+'-failure.png')});throw e;}
      finally{await context.close();}
    }
  }
}catch(error){
  if(process.env.GITHUB_ACTIONS)console.error('::error title=Floating panel regression failed::'+(error.stack||String(error)).replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A'));
  throw error;
}finally{await browser?.close();server.close();}
