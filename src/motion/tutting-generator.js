import { eulerToQuat } from "../math/quaternions.js";

// TG-1: bounded, seeded candidates. Preview never changes target/current or saved poses.
const TG_KEYS=['lShoulder','lArm','lForeArm','lHand','rShoulder','rArm','rForeArm','rHand'];
const TG_DEFAULT={mode:'delta',values:[-45,45],maxDelta:45,maxJoints:2,seed:2026,
  axes:{lShoulder:[],lArm:[],lForeArm:['z'],lHand:['z'],rShoulder:[],rArm:[],rForeArm:['z'],rHand:['z']}};
const tgCopy=v=>JSON.parse(JSON.stringify(v));
function cleanTGConfig(raw={}){
  raw=raw&&typeof raw==='object'?raw:{};
  const num=(v,d,lo,hi)=>Number.isFinite(Number(v))?Math.max(lo,Math.min(hi,Number(v))):d;
  const axes={};for(const k of TG_KEYS)axes[k]=Array.isArray(raw.axes?.[k])?['x','y','z'].filter(a=>raw.axes[k].includes(a)):TG_DEFAULT.axes[k].slice();
  return {mode:raw.mode==='absolute'?'absolute':'delta',values:Array.isArray(raw.values)?[...new Set(raw.values.filter(v=>Number.isFinite(v)&&Math.abs(v)<=180))].slice(0,24):[-45,45],
    maxDelta:num(raw.maxDelta,45,1,180),maxJoints:Math.round(num(raw.maxJoints,2,1,8)),seed:Math.trunc(num(raw.seed,2026,0,4294967295)),axes};
}
function tgRng(seed){let a=seed>>>0;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=Math.imul(a^(a>>>15),a|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
function tgAngleDiff(a,b){return Math.abs(((a-b+180)%360+360)%360-180);}
function tgPoseKey(p){return TG_KEYS.map(k=>{const q=eulerToQuat(p[k]||[0,0,0]);const sign=[q.w,q.x,q.y,q.z].find(v=>Math.abs(v)>1e-8)||1;if(sign<0)q.set(-q.x,-q.y,-q.z,-q.w);return q.toArray().map(v=>Math.round(v*1e5)).join(',');}).join('|');}
function tgGenerateCandidates(base,config,available,clampFn){
  const rng=tgRng(config.seed),keys=TG_KEYS.filter(k=>available.includes(k)&&config.axes[k].length),results=[],seen=new Set([tgPoseKey(base)]);
  if(!keys.length||!config.values.length)return {results,attempts:0};
  let attempts=0;
  for(;attempts<2000&&results.length<6;attempts++){
    const pose=tgCopy(base),pool=keys.slice(),count=1+Math.floor(rng()*Math.min(config.maxJoints,pool.length));let valid=true;
    for(let j=0;j<count;j++){
      const k=pool.splice(Math.floor(rng()*pool.length),1)[0],allowed=config.axes[k];let touched=false;
      for(const ax of allowed){if(touched&&rng()<.5)continue;const i=['x','y','z'].indexOf(ax),v=config.values[Math.floor(rng()*config.values.length)];
        const next=config.mode==='delta'?base[k][i]+v:v;
        if(Math.abs(next-base[k][i])>config.maxDelta+1e-7)continue;pose[k][i]=next;touched=true;
      }
      const checked=clampFn(k,pose[k].slice());
      if(!Array.isArray(checked)||!checked.every(Number.isFinite)){valid=false;break;}
      // Reject corrected values that would change a locked axis or leave the requested set.
      for(let i=0;i<3;i++){
        const changed=tgAngleDiff(checked[i],base[k][i])>1e-5;
        if(!changed)continue;
        const axis=['x','y','z'][i],value=config.mode==='delta'?checked[i]-base[k][i]:checked[i];
        if(!allowed.includes(axis)||Math.abs(checked[i]-base[k][i])>config.maxDelta+1e-7||!config.values.some(v=>Math.abs(v-value)<1e-5)){valid=false;break;}
      }
      if(!valid)break;pose[k]=checked.slice();
    }
    if(!valid)continue;
    const changed=keys.filter(k=>eulerToQuat(base[k]).angleTo(eulerToQuat(pose[k]))>1e-5);
    if(!changed.length||changed.length>config.maxJoints)continue;
    const signature=tgPoseKey(pose);if(seen.has(signature))continue;seen.add(signature);
    let maximum=0,total=0;for(const k of changed)for(let i=0;i<3;i++){const d=Math.abs(pose[k][i]-base[k][i]);maximum=Math.max(maximum,d);total+=d;}
    results.push({angles:pose,changed,maxDelta:maximum,score:total});
  }
  results.sort((a,b)=>a.score-b.score);return {results,attempts};
}

export { TG_KEYS, TG_DEFAULT, tgCopy, cleanTGConfig, tgGenerateCandidates };
