import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright-core';
const root=resolve('.');
const model=await readFile(resolve('.cache/Xbot.glb'));
assert.equal(createHash('sha256').update(model).digest('hex'),'002f8d269de68e5dce3d25195caf390d1aa359bbfaae3fcf4c8dc78ec36c3ba5');
const probe = '\nwindow.__touchSmoke = {selectJoint,pushHistory,undo,redo,snapshotTimelineData,restoreTimelineData,get selected(){return selectedKey;},get frames(){return keyframes;},get pose(){return poseController.snapshotTarget();},get range(){return [beatGridRangeStart,beatGridRangeEnd];},get scrub(){return kfScrubDragging;},get grooves(){return grooveSequence;},get waves(){return waveClips;},get cameraPosition(){return camera.position.toArray();},get canSelect(){return !suppressClick&&!transformControls.dragging&&!transformControlsIK.dragging;}};';
const server=createServer(async(req,res)=>{
  try{
    const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
    if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}
    res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[extname(path)]||'application/octet-stream'});
    let data=await readFile(path);
    if(path===resolve(root,'src/main.js'))data=Buffer.from(data.toString()+probe);
    if(path===resolve(root,'dist/index.html')){const html=data.toString(),at=html.lastIndexOf('</script>');data=Buffer.from(html.slice(0,at)+probe+html.slice(at));}
    res.end(data);
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
        // Real touch sequences exercise OrbitControls and the raycast guard together.
        const cdp=await context.newCDPSession(page);
        const canvasBox=await page.locator('#canvasHolder').boundingBox();
        const point=(id,x)=>({id,x,y:canvasBox.height*.8,radiusX:4,radiusY:4});
        const x1=canvasBox.width*.65,x2=canvasBox.width*.85;
        await page.evaluate(()=>window.__touchSmoke.selectJoint('rForeArm'));
        const poseBefore=await page.evaluate(()=>window.__touchSmoke.pose);
        const cameraBefore=await page.evaluate(()=>window.__touchSmoke.cameraPosition);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,x1),point(2,x2)]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,x1-12),point(2,x2+12)]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[point(1,x1-12)]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        assert.equal(await page.evaluate(()=>window.__touchSmoke.selected),'rForeArm');
        assert.deepEqual(await page.evaluate(()=>window.__touchSmoke.pose),poseBefore);
        assert.notDeepEqual(await page.evaluate(()=>window.__touchSmoke.cameraPosition),cameraBefore);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(3,x2)]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
        assert.equal(await page.evaluate(()=>window.__touchSmoke.selected),'rForeArm');
        // Interrupted gizmos intentionally suppress click picking for 80ms.
        await page.waitForFunction(()=>window.__touchSmoke.canSelect);
        await page.locator('#canvasHolder canvas').tap({position:{x:canvasBox.width-4,y:canvasBox.height-4}});
        assert.equal(await page.evaluate(()=>window.__touchSmoke.selected),null);
        // Buttons provide deterministic touch reorder with history and selection preserved.
        await page.evaluate(()=>{
          const app=window.__touchSmoke,s=app.snapshotTimelineData(),base=s.keyframes[0];
          s.keyframes=['A','B','C'].map(label=>({...structuredClone(base),label,beats:4}));
          app.restoreTimelineData(s);app.pushHistory();
        });
        await page.locator('#kfList .sel').nth(1).scrollIntoViewIfNeeded();await page.locator('#kfList .sel').nth(1).tap();
        await page.locator('#touchTimelineEarlier').scrollIntoViewIfNeeded();await page.locator('#touchTimelineEarlier').tap();
        assert.deepEqual(await page.evaluate(()=>window.__touchSmoke.frames.map(f=>f.label)),['B','A','C']);
        await page.evaluate(()=>window.__touchSmoke.undo());assert.deepEqual(await page.evaluate(()=>window.__touchSmoke.frames.map(f=>f.label)),['A','B','C']);
        await page.evaluate(()=>window.__touchSmoke.redo());assert.deepEqual(await page.evaluate(()=>window.__touchSmoke.frames.map(f=>f.label)),['B','A','C']);
        await page.locator('#touchTimelineLater').tap();assert.deepEqual(await page.evaluate(()=>window.__touchSmoke.frames.map(f=>f.label)),['A','B','C']);
        // Default swipes scroll without enabling destructive clip drags.
        await page.locator('#beatGridScroll').scrollIntoViewIfNeeded();
        const scrollBox=await page.locator('#beatGridScroll').boundingBox();
        const scrollStart=await page.locator('#beatGridScroll').evaluate(el=>el.scrollLeft);
        const sx=scrollBox.x+scrollBox.width-30,sy=Math.max(scrollBox.y+10,Math.min(scrollBox.y+scrollBox.height-10,viewport.height-20));
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:4,x:sx,y:sy}]});
        for(let dx=10;dx<=90;dx+=20)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:4,x:sx-dx,y:sy}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await page.waitForFunction(before=>document.getElementById('beatGridScroll').scrollLeft>before,scrollStart);
        assert.deepEqual(await page.evaluate(()=>window.__touchSmoke.frames.map(f=>f.beats)),[4,4,4]);
        await page.waitForFunction(()=>{
          const state=JSON.stringify(['beatGridScroll','uiTabBody','uiTabBar'].map(id=>{const el=document.getElementById(id);return [el.scrollLeft,el.scrollTop];}));
          const now=performance.now(),last=window.__touchScroll;
          if(!last||last.state!==state){window.__touchScroll={state,changedAt:now};return false;}
          return now-last.changedAt>150;
        });
        await page.locator('#touchTimelineEdit').scrollIntoViewIfNeeded();
        assert.equal(await page.locator('#touchTimelineEdit').getAttribute('aria-pressed'),'false','scrolling must not toggle edit mode');
        await page.locator('#touchTimelineEdit').tap();
        await page.waitForFunction(()=>document.getElementById('touchTimelineEdit').getAttribute('aria-pressed')==='true');
        assert.equal(await page.locator('#touchTimelineEdit').getAttribute('aria-pressed'),'true');
        if(viewport.width===390){
          const handle=page.locator('#kfList .poseResizeHandle').first();await handle.scrollIntoViewIfNeeded();
          const h=await handle.boundingBox(),hx=h.x+h.width/2,hy=h.y+h.height/2;
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:6,x:hx,y:hy}]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:6,x:hx-36,y:hy}]});
          assert.ok((await page.evaluate(()=>window.__touchSmoke.frames[0].beats))<4);
          await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
          assert.equal(await page.evaluate(()=>window.__touchSmoke.frames[0].beats),4);
          await page.locator('#beatGridRuler').scrollIntoViewIfNeeded();
          const r=await page.locator('#beatGridRuler').boundingBox();
          const ry=r.y+r.height/2,rx=Math.max(scrollBox.x+140,20),rangeBefore=await page.evaluate(()=>window.__touchSmoke.range);
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:7,x:rx,y:ry}]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:7,x:rx+72,y:ry}]});
          const draggedRange=await page.evaluate(()=>window.__touchSmoke.range);assert.ok(draggedRange[1]>draggedRange[0]);
          await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
          assert.deepEqual(await page.evaluate(()=>window.__touchSmoke.range),rangeBefore);
          const wav=Buffer.alloc(44+64000);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);
          wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(64000,40);
          await page.locator('#kfMusicFile').setInputFiles({name:'touch.wav',mimeType:'audio/wav',buffer:wav});
          await page.waitForFunction(()=>!document.getElementById('beatGridWaveformTrack').classList.contains('waveformLoading'));
          assert.equal(await page.locator('#beatGridWaveformTrack').evaluate(el=>el.classList.contains('waveformError')),false);
          await page.locator('#kfWaveformCanvas').scrollIntoViewIfNeeded();
          const w=await page.locator('#kfWaveformCanvas').boundingBox(),wy=w.y+20,wx=scrollBox.x+140;
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:8,x:wx,y:wy}]});
          assert.equal(await page.evaluate(()=>window.__touchSmoke.scrub),true);
          await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:8,x:wx+36,y:wy}]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
          // CDP acknowledgement can precede dispatch of pointercancel on the renderer.
          // Still require the application to finish scrubbing, with a bounded wait.
          await page.waitForFunction(()=>window.__touchSmoke.scrub===false, null, {timeout:5000});
          assert.equal(await page.evaluate(()=>window.__touchSmoke.scrub),false);
          await page.evaluate(()=>{
            const app=window.__touchSmoke,s=app.snapshotTimelineData(),base=s.keyframes[0];
            s.grooveSequence=[{id:'touch-g1',libId:'missing',beats:4},{id:'touch-g2',libId:'missing',beats:4}];
            s.waveClips=[{id:'touch-wave',start:0,beats:2,config:s.waving,frames:[structuredClone(base),structuredClone(base)]}];
            app.restoreTimelineData(s);
          });
          await page.locator('#grooveSeqList .grooveSeqChip').nth(1).scrollIntoViewIfNeeded();
          await page.locator('#grooveSeqList .grooveSeqChip').nth(1).tap();
          await page.locator('#touchTimelineTrack').selectOption('groove');
          await page.locator('#touchTimelineEarlier').scrollIntoViewIfNeeded();await page.locator('#touchTimelineEarlier').tap();
          assert.deepEqual(await page.evaluate(()=>window.__touchSmoke.grooves.map(g=>g.id)),['touch-g2','touch-g1']);
          const wave=page.locator('#waveTrackList .waveClip');await wave.scrollIntoViewIfNeeded();const wb=await wave.boundingBox();
          const waveBefore=await page.evaluate(()=>window.__touchSmoke.waves.map(w=>[w.start,w.beats]));
          const leftBefore=await wave.evaluate(el=>el.style.left);
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:9,x:wb.x+wb.width/2,y:wb.y+wb.height/2}]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:9,x:wb.x+wb.width/2+36,y:wb.y+wb.height/2}]});
          assert.notEqual(await wave.evaluate(el=>el.style.left),leftBefore);
          await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
          assert.deepEqual(await page.evaluate(()=>window.__touchSmoke.waves.map(w=>[w.start,w.beats])),waveBefore);

        }
        await page.locator('#touchTimelineEdit').scrollIntoViewIfNeeded();await page.locator('#touchTimelineEdit').tap();
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
        console.log(`PASS mobile ${entry} ${viewport.width}x${viewport.height}: layout, pinch/cancel/tap, reorder/undo, scroll, edit mode, orientation`);
      }catch(error){
        const diagnostic=`${entry} ${viewport.width}x${viewport.height}: ${error.stack || String(error)}`;
        console.error('::error title=Mobile touch regression::'+diagnostic.replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A'));
        await mkdir('test-results',{recursive:true});const name=`mobile-${entry.includes('dist')?'dist':'source'}-${viewport.width}`;
        await page.screenshot({path:`test-results/${name}.png`,timeout:10000});await writeFile(`test-results/${name}.json`,JSON.stringify({errors,message:String(error)},null,2));throw error;
      }finally{await context.close();}
    }
  }
}finally{await browser?.close();server.close();}
