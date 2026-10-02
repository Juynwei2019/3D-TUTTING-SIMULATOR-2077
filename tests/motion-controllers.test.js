import test from 'node:test';
import assert from 'node:assert/strict';
import * as definitions from '../src/motion/definitions.js';
import { createWaveController } from '../src/motion/wave-controller.js';
import { createGrooveGenerator } from '../src/motion/groove-generator.js';
import { createGrooveSequence } from '../src/timeline/groove-sequence.js';
import { createSquatController } from '../src/motion/squat-controller.js';
test('Wave configuration stays bounded and pulse shapes retain finite compact support', () => {
  const wave = createWaveController({ ...definitions });
  const config=wave.cleanWave({ amplitude:999, width:0, speed:99, startNode:'lFinger',endNode:'lFinger' });
  assert.equal(config.amplitude,60); assert.equal(config.width,.6); assert.equal(config.speed,4); assert.notEqual(config.startNode,config.endNode);
  for (const shape of ['cosine','gaussian','triangle','trapezoid']){
    assert.equal(wave.wavePulse(0,0,1,shape),1); assert.equal(wave.wavePulse(2,0,1,shape),0);
    assert.ok(Number.isFinite(wave.wavePulse(.5,0,1,shape)));
  }
  assert.equal(wave.wavePulse(0,0,0),0);
});
test('Wave bake plans account for ping-pong passes and reject excessive sample counts', () => {
  const wave=createWaveController({ ...definitions });
  const config=wave.cleanWave({ direction:'pingpong' });
  const plan=wave.waveBakePlan(config,2,3);
  assert.equal(plan.passes,6); assert.equal(plan.totalBeats,12); assert.equal(plan.count,plan.samplesPerPass*6);
  assert.throws(()=>wave.waveBakePlan(config,0,1)); assert.throws(()=>wave.waveBakePlan(config,2,1.5));
  assert.throws(()=>wave.waveBakePlan({...config,width:.1,mode:'bipolar'},2,8),/拍點過多/);
});
test('seeded groove generation remains deterministic and honors live amplitude limits', () => {
  const context={...definitions,JOINT_LIMITS:{}};
  const generator=createGrooveGenerator(context);
  const a=generator.generateGrooveConfig('down',123),b=generator.generateGrooveConfig('down',123);
  assert.deepEqual(a,b); assert.equal(generator.grooveAmpLimitFor('hips','x'),null);
  context.JOINT_LIMITS={hips:{x:{enabled:true,min:-2,max:3}}}; assert.equal(generator.grooveAmpLimitFor('hips','x'),2);
  const randA=generator.makeGrooveRng(5),randB=generator.makeGrooveRng(5); assert.equal(randA(),randB());
});
test('groove sequence preserves fractional beats, wraps phase and handles missing library references', () => {
  const context={grooveSequence:[{id:'a',libId:'one',beats:.5},{id:'b',libId:'missing',beats:1.5}],grooveLibCtrl:{getItems:()=>[{id:'one',data:{}}]}};
  const sequence=createGrooveSequence(context);
  assert.equal(sequence.grooveSeqTotalBeats(),2);
  assert.equal(sequence.getGrooveActiveSegment(.5).segIndex,1); assert.equal(sequence.getGrooveActiveSegment(.5).item,undefined);
  assert.equal(sequence.getGrooveActiveSegment(2.25).localBeats,.25);
  context.grooveSequence=[]; assert.equal(sequence.getGrooveActiveSegment(1),null);
});
test('squat displacement uses centimeters and leaves disabled motion at zero', () => {
  const squat=createSquatController({});
  assert.deepEqual(squat.computeSquatDelta(false,{},1),{dx:0,dy:0});
  const p={vertAmp:10,lateralAmp:20,freq:1,phase:0,lateralFreq:1,lateralPhase:0,wave:'sine',lateralWave:'sine'};
  const d=squat.computeSquatDelta(true,p,.25);
  assert.ok(Math.abs(d.dy+.1)<1e-8); assert.ok(Math.abs(d.dx-.2)<1e-8);
});
