// Optional v1 workspace. Reject invalid geometry/transforms before touching Three.js.
const vector=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<=10000);
export function isGrabProject(data){
  if(!data || data.version!==1 || !['box','sphere','cylinder'].includes(data.shapeType))return false;
  if(!vector(data.position,3)||!vector(data.quaternion,4)||Math.hypot(...data.quaternion)<1e-8)return false;
  for(const [type,keys]of Object.entries({box:['w','h','d'],sphere:['r'],cylinder:['r','h']}))
    for(const key of keys){const v=data.shapeParams?.[type]?.[key];if(!Number.isFinite(v)||v<(key==='r'?.05:.1)||v>(key==='r'?.8:1.6))return false;}
  return true;
}
// Keep only fields known to the current rig; malformed optional values fall back.
function cleanRig(value,template){
  if(Array.isArray(template)){
    if(!vector(value,template.length))return template.slice();
    if(template.length===4){const n=Math.hypot(...value);return n>1e-8?value.map(x=>x/n):template.slice();}
    return value.slice();
  }
  if(template && typeof template==='object')return Object.fromEntries(Object.entries(template).map(([k,v])=>[k,cleanRig(value?.[k],v)]));
  if(typeof template==='number')return Number.isFinite(value)?value:template;
  if(typeof template==='boolean')return typeof value==='boolean'?value:template;
  return template;
}
export function cleanGrabProject(data,defaults){
  if(!isGrabProject(data))return null;
  const next={...defaults,visible:data.visible===true,mode:data.mode==='rotate'?'rotate':'translate',shapeType:data.shapeType,
    shapeParams:cleanRig(data.shapeParams,defaults.shapeParams),position:data.position.slice(),quaternion:data.quaternion.slice(),
    preset:['sides','bottom'].includes(data.preset)?data.preset:null,palmAligned:data.palmAligned===true,
    grabbed:{},grabLocal:{},palmTwist:{},rig:cleanRig(data.rig,defaults.rig),target:cleanRig(data.target,defaults.target)};
  const norm=Math.hypot(...next.quaternion);next.quaternion=next.quaternion.map(x=>x/norm);
  for(const limb of ['rArm','lArm']){
    const contact=data.grabLocal?.[limb];
    next.grabbed[limb]=next.visible&&data.grabbed?.[limb]===true&&vector(contact,3);
    next.grabLocal[limb]=next.grabbed[limb]?contact.slice():null;
    next.palmTwist[limb]=Number.isFinite(data.palmTwist?.[limb])?Math.max(-180,Math.min(180,data.palmTwist[limb])):0;
  }
  return next;
}
