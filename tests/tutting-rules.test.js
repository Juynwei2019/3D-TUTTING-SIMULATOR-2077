import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanGeometryRules, evaluateGeometryRules } from '../src/motion/tutting-rules.js';
import { cleanTGConfig, TG_KEYS, tgGenerateCandidates } from '../src/motion/tutting-generator.js';

function geometry(directions = {}) {
  return {ok:true,segments:Object.fromEntries(['lUpperArm','lForeArm','rUpperArm','rForeArm'].map(id=>{
    const d=directions[id]||[1,0,0];return [id,{start:[0,0,0],end:d.slice(),direction:d.slice(),length:1}];
  }))};
}
test('parallel distinguishes same and opposite directions and perpendicular measures 90 degrees',()=>{
  const base=geometry(), g=geometry({rForeArm:[-1,0,0]});
  const config=cleanGeometryRules({parallel:{enabled:true,allowOpposite:true}});
  assert.equal(evaluateGeometryRules(g,base,config).ok,true);
  config.parallel.allowOpposite=false;
  assert.equal(evaluateGeometryRules(g,base,config).checks[0].error,180);
  config.parallel.enabled=false;config.perpendicular.enabled=true;
  assert.equal(evaluateGeometryRules(geometry({rForeArm:[0,1,0]}),base,config).ok,true);
  assert.equal(evaluateGeometryRules(base,base,config).ok,false);
});
test('plane direction differs from endpoint position and uses both endpoints and bone lengths',()=>{
  const base=geometry(), g=geometry();g.segments.lForeArm.start[2]=.1;g.segments.lForeArm.end[2]=.1;
  const config=cleanGeometryRules({plane:{enabled:true,segments:['lForeArm'],mode:'direction'}});
  assert.equal(evaluateGeometryRules(g,base,config).ok,true);
  config.plane.mode='position';
  assert.equal(evaluateGeometryRules(g,base,config).checks[0].error,10);
  g.segments.lForeArm.start[2]=-.1; // midpoint on plane must still fail
  assert.equal(evaluateGeometryRules(g,base,config).ok,false);
  g.segments.lForeArm.length=10;
  assert.equal(evaluateGeometryRules(g,base,config).checks[0].error,1);
  config.plane.mode='direction';g.segments.lForeArm.direction=[0,0,1];
  assert.equal(evaluateGeometryRules(g,base,config).checks[0].error,90);
});
test('base plane depth is fixed and all constraints are mandatory including invalid pairs',()=>{
  const base=geometry(), g=geometry();base.segments.lForeArm.start[2]=2;base.segments.lForeArm.end[2]=2;
  g.segments.lForeArm.start[2]=2;g.segments.lForeArm.end[2]=2;
  const config=cleanGeometryRules({plane:{enabled:true,segments:['lForeArm'],mode:'position'},perpendicular:{enabled:true}});
  const r=evaluateGeometryRules(g,base,config);assert.equal(r.checks[0].pass,true);assert.equal(r.ok,false);
  config.perpendicular.a=config.perpendicular.b;assert.equal(evaluateGeometryRules(g,base,config).reason,'invalid-pair');
  config.plane.segments=[];assert.equal(evaluateGeometryRules(g,base,config).ok,false);
  assert.equal(evaluateGeometryRules({ok:false},base,config).ok,false);
});
test('old settings disable geometry and roundtrip preserves rules with safe numeric defaults',()=>{
  const old=cleanTGConfig({seed:3});assert.equal(old.geometry.plane.enabled,false);
  const a=cleanTGConfig({geometry:{plane:{enabled:true,segments:['lForeArm'],positionTolerance:2},parallel:{enabled:true,tolerance:1}}});
  assert.deepEqual(cleanTGConfig(JSON.parse(JSON.stringify(a))),a);
  assert.equal(cleanGeometryRules({parallel:null}).parallel.enabled,false);
  assert.equal(cleanGeometryRules({parallel:{tolerance:NaN}}).parallel.tolerance,5);
});
test('bounded seeded search only returns passing poses; failure is diagnostic and repeatable',()=>{
  const base=Object.fromEntries(TG_KEYS.map(k=>[k,[0,0,0]])),config=cleanTGConfig({seed:2026});
  const reject=()=>({geometry:{ok:true},rules:{ok:false,maxNormalizedError:2,checks:[]}});
  const a=tgGenerateCandidates(base,config,TG_KEYS,(_k,v)=>v,reject);
  assert.equal(a.attempts,2000);assert.equal(a.results.length,0);assert.ok(a.rejectedGeometry>0);assert.equal(a.bestFailure.maxNormalizedError,2);
  assert.deepEqual(a,tgGenerateCandidates(base,config,TG_KEYS,(_k,v)=>v,reject));
  const accept=()=>({geometry:{ok:true},rules:{ok:true,maxNormalizedError:0,checks:[]}});
  const b=tgGenerateCandidates(base,config,TG_KEYS,(_k,v)=>v,accept);
  assert.equal(b.results.length,6);assert.ok(b.results.every(c=>c.rules.ok));
});
