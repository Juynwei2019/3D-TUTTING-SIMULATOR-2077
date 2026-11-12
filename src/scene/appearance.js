import * as THREE from 'three';
import { translateDOM } from '../i18n/index.js';
import { createModelMaterials, MODEL_STYLES } from './model-materials.js';

export const APPEARANCE_DEFAULT = Object.freeze({version:1,background:'#0a0a12',grid:true,gridColor:'#2a2a55',gridSecondary:'#1a1a33',fog:true,ambientColor:'#8899ff',ambientIntensity:.7,keyIntensity:1.2,rimEnabled:true,rimColor:'#ff2f7e',rimIntensity:.5,modelStyle:'original',modelColor:'#c9ced8',modelRoughness:.95,modelMetalness:0});
export const APPEARANCE_PRESETS = {
  original: {...APPEARANCE_DEFAULT},
  neutral: {...APPEARANCE_DEFAULT,background:'#20242b',gridColor:'#56606d',gridSecondary:'#363e48',ambientColor:'#ffffff',ambientIntensity:1,keyIntensity:1.5,rimEnabled:false},
  bright: {...APPEARANCE_DEFAULT,background:'#eef1f5',gridColor:'#a0a8b5',gridSecondary:'#ccd1d9',fog:false,ambientColor:'#ffffff',ambientIntensity:1,keyIntensity:1.4,rimEnabled:false},
};
export function cleanAppearance(raw){
  raw=raw&&typeof raw==='object'?raw:{};const out={...APPEARANCE_DEFAULT};
  for(const key of Object.keys(out)){
    const v=raw[key],d=out[key];
    if(key==='version')continue;
    if(key==='modelStyle'){if(['original','custom',...Object.keys(MODEL_STYLES)].includes(v))out[key]=v;continue;}
    if(typeof d==='string'&&typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v))out[key]=v.toLowerCase();
    if(typeof d==='boolean'&&typeof v==='boolean')out[key]=v;
    if(typeof d==='number'&&Number.isFinite(v))out[key]=Math.max(0,Math.min(key.startsWith('model')?1:3,v));
  }return out;
}
export function isAppearanceProject(raw){return raw?.version===1&&JSON.stringify(cleanAppearance(raw))!==JSON.stringify(APPEARANCE_DEFAULT);}
export function qualityRatio(quality,dpr=1,split=false){return Math.min(Number.isFinite(dpr)&&dpr>0?dpr:1,({economy:1,standard:1.5,clear:2})[quality]||2,split?1.5:2);}

export function createAppearanceController(context){
  const modelMaterials=createModelMaterials();
  let state=cleanAppearance(),lights,grid,quality='clear',transaction=null;
  try{const saved=context.preferences.getItem('tuttingRenderQuality');if(['economy','standard','clear'].includes(saved))quality=saved;}catch{}
  const snapshot=()=>({...state});
  let palette={joint:0x7fe0ff,finger:0xffa8e8,skeleton:0x7fe0ff};
  function applyRenderer(renderer,split=false){if(renderer)renderer.setPixelRatio(qualityRatio(quality,globalThis.devicePixelRatio,split));}
  function apply(){
    modelMaterials.apply(state);
    const scene=context.scene;
    if(scene){scene.background=new THREE.Color(state.background);scene.fog=state.fog?new THREE.Fog(state.background,12,26):null;}
    const c=new THREE.Color(state.background);palette=(c.r*.2126+c.g*.7152+c.b*.0722)>.45?{joint:0x07556b,finger:0x842b69,skeleton:0x07556b}:{joint:0x7fe0ff,finger:0xffa8e8,skeleton:0x7fe0ff};
    if(lights){lights.ambient.intensity=state.ambientIntensity;lights.ambient.color.set(state.ambientColor);lights.key.intensity=state.keyIntensity;lights.rim.visible=state.rimEnabled;lights.rim.intensity=state.rimIntensity;lights.rim.color.set(state.rimColor);}
    globalThis.document?.body?.classList?.toggle('sceneBright',palette.joint===0x07556b);
    context.refreshHelpers?.();
    if(grid){grid.visible=state.grid;const colors=grid.geometry.getAttribute('color'),a=new THREE.Color(state.gridColor),b=new THREE.Color(state.gridSecondary);
      // GridHelper creates four vertices per line, with the center at index 10.
      for(let line=0;line<=20;line++)for(let j=0;j<4;j++)colors.setXYZ(line*4+j,...(line===10?a:b).toArray());colors.needsUpdate=true;}
  }
  function sync(){for(const key of Object.keys(state)){const el=document.getElementById('appearance_'+key);if(el){if(el.type==='checkbox')el.checked=state[key];else el.value=state[key];}const output=document.getElementById('appearance_value_'+key);if(output)output.textContent=state[key].toFixed(2);}
    const q=document.getElementById('appearanceQuality');if(q)q.value=quality;}
  function restore(raw){transaction=null;state=cleanAppearance(raw);apply();sync();}
  function begin(){if(!transaction){context.beforeEdit?.();context.pushHistory();transaction=snapshot();}}
  function finish(){if(!transaction)return;const old=transaction;transaction=null;if(JSON.stringify(old)!==JSON.stringify(state)){context.pushHistory();context.scheduleAutoSave();}}
  function bind(){
    const host=document.getElementById('appearanceControls');
    const labels={background:'背景顏色',grid:'顯示地面網格',gridColor:'網格中心線',gridSecondary:'網格線顏色',fog:'顯示霧效',ambientColor:'環境光顏色',ambientIntensity:'環境光亮度',keyIntensity:'主光亮度',rimEnabled:'顯示輪廓光',rimColor:'輪廓光顏色',rimIntensity:'輪廓光亮度',modelColor:'人偶顏色',modelRoughness:'表面粗糙度',modelMetalness:'金屬感'};
    for(const [key,label]of Object.entries(labels)){
      const row=document.createElement('label');row.className='appearanceField';const span=document.createElement('span');span.dataset.i18n=label;row.append(span);
      const el=document.createElement('input');el.id='appearance_'+key;
      const d=state[key];el.type=typeof d==='boolean'?'checkbox':typeof d==='number'?'range':'color';
      if(el.type==='range'){el.min=0;el.max=key.startsWith('model')?1:3;el.step=key.startsWith('model')?.01:.05;}
      row.append(el);if(el.type==='range'){const output=document.createElement('output');output.id='appearance_value_'+key;output.htmlFor=el.id;row.append(output);}(key.startsWith('model')?document.getElementById('modelMaterialControls'):host).append(row);
      const read=()=>{const v=el.type==='checkbox'?el.checked:el.type==='range'?Number(el.value):el.value;
        if(key==='modelColor'&&state.modelStyle==='original')state={...state,modelStyle:'matte',...MODEL_STYLES.matte};
        if(key==='modelRoughness'||key==='modelMetalness')state={...state,modelStyle:'custom'};
        state=cleanAppearance({...state,[key]:v});apply();sync();};
      el.addEventListener('input',()=>{begin();read();});el.addEventListener('change',()=>{begin();read();finish();});
      el.addEventListener('blur',finish);
    }
    document.getElementById('appearance_modelStyle').onchange=e=>{begin();state=cleanAppearance({...state,modelStyle:e.target.value,...MODEL_STYLES[e.target.value]});apply();sync();finish();};
    document.getElementById('modelMaterialReset').onclick=()=>{begin();for(const k of ['modelStyle','modelColor','modelRoughness','modelMetalness'])state[k]=APPEARANCE_DEFAULT[k];apply();sync();finish();};
    document.getElementById('appearancePreset').onchange=e=>{const next=APPEARANCE_PRESETS[e.target.value];if(next){begin();const model=Object.fromEntries(Object.entries(state).filter(([k])=>k.startsWith('model')));state=cleanAppearance({...next,...model});apply();sync();finish();}e.target.value='';};
    document.getElementById('appearanceReset').onclick=()=>{begin();state=cleanAppearance();apply();sync();finish();};
    document.getElementById('appearanceQuality').onchange=e=>{quality=e.target.value;try{context.preferences.setItem('tuttingRenderQuality',quality);}catch{}applyRenderer(context.renderer);for(const pane of Object.values(context.splitViewPanes))applyRenderer(pane.renderer,true);};
    translateDOM(host);translateDOM(document.getElementById('modelMaterialControls'));sync();
  }
  return {snapshot,restore,bind,apply,applyRenderer,get palette(){return palette;},attachModel(model){modelMaterials.attach(model);apply();},attachLights(refs){lights=refs;apply();applyRenderer(context.renderer);},attachGrid(ref){grid=ref;apply();}};
}
