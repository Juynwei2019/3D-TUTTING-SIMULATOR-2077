import { english as firstBatchEnglish } from './messages.js';
import { batch2English } from './batch2-messages.js';
import { batch3English } from './batch3-messages.js';
export const english = {...firstBatchEnglish,...batch2English,...batch3English};
export const LANGUAGE_STORAGE_KEY = 'tuttingLanguage';
export function createI18n(storage){
  let language='zh-Hant';
  const listeners=new Set();
  try { if(storage?.getItem(LANGUAGE_STORAGE_KEY)==='en')language='en'; } catch {}
  return {
    get language(){return language;},
    t(key,values={}){
      const message=language==='en' && Object.hasOwn(english,key) ? english[key] : key;
      return message.replace(/\{(\w+)\}/g,(match,name)=>Object.hasOwn(values,name)?String(values[name]):match);
    },
    setLanguage(next){
      if(!['zh-Hant','en'].includes(next)||next===language)return false;
      language=next;
      try {storage?.setItem(LANGUAGE_STORAGE_KEY,next);} catch {}
      for(const listener of listeners)listener(next);
      return true;
    },
    subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);}
  };
}
const browserStorage={getItem:key=>globalThis.localStorage.getItem(key),setItem:(key,value)=>globalThis.localStorage.setItem(key,value)};
export const i18n=createI18n(browserStorage);
export const t=(key,values)=>i18n.t(key,values);
export const onLanguageChange=listener=>i18n.subscribe(listener);
export function translateDOM(root=document){
  for(const el of root.querySelectorAll('[data-i18n]'))el.textContent=t(el.dataset.i18n);
  for(const attr of ['title','aria-label','placeholder','data-tooltip','label','alt']){
    for(const el of root.querySelectorAll(`[data-i18n-${attr}]`)){
      const value=t(el.getAttribute(`data-i18n-${attr}`));setDisplayAttribute(el,attr,value);
    }
  }
  document.documentElement.lang=i18n.language;
  const select=document.getElementById('languageSelect');if(select)select.value=i18n.language;
}
export function bindLanguageUI(){
  translateDOM();
  onLanguageChange(()=>{translateDOM();refreshLiveTranslations();});
  document.getElementById('languageSelect').addEventListener('change',event=>i18n.setLanguage(event.target.value));
}

// Keep renderers on the existing nodes; changing locale never rebuilds inputs.
const liveRenderers=new WeakMap();
function resolveText(render){
  const value=typeof render==='function'?render():render;
  return typeof value==='function'?value():value;
}
export function liveText(node,render){return liveProperty(node,'textContent',render);}
export function liveHTML(node,render){return liveProperty(node,'innerHTML',render);}
export function liveAttribute(node,attribute,render){return liveProperty(node,'@'+attribute,render);}
function liveProperty(node,property,render){
  if(!node)return;
  let map=liveRenderers.get(node);if(!map){map=new Map();liveRenderers.set(node,map);node.setAttribute?.('data-live-i18n','');}
  map.set(property,render);
  applyTranslation(node,property,render);
}
function applyTranslation(node,property,render){
  const value=resolveText(render);
  if(property.startsWith('@')){
    const attribute=property.slice(1);
    setDisplayAttribute(node,attribute,value);
  }else if(node[property]!==value)node[property]=value;

}
export function refreshLiveTranslations(root=document){
  for(const node of root.querySelectorAll('[data-live-i18n]')){
    for(const [property,render] of liveRenderers.get(node)||[])applyTranslation(node,property,render);
  }
}

function setDisplayAttribute(node,attribute,value){
  // Keep migrated tooltips native-title-free, while updating their keyboard names.
  const migrated=attribute==='title'&&node.hasAttribute?.('data-tooltip')&&!node.hasAttribute?.('title');
  if(!migrated&&node.getAttribute?.(attribute)!==value)node.setAttribute(attribute,value);
  if(attribute==='title'||attribute==='data-tooltip'){
    if(attribute==='title'&&node.hasAttribute?.('data-tooltip'))node.setAttribute('data-tooltip',value);
    const help=node.classList?.contains('kfInfoIcon');
    const icon=node.tagName==='BUTTON'&&/^[\s\p{P}\p{S}\p{M}0-9]*$/u.test(node.textContent||'');
    if(help||icon||node.hasAttribute?.('data-tooltip-label')){
      if(!node.hasAttribute?.('aria-label')||node.hasAttribute?.('data-tooltip-label')){
        node.setAttribute('aria-label',value);node.setAttribute('data-tooltip-label','');
      }
      if(help){node.setAttribute('tabindex','0');node.setAttribute('role','img');}
    }
  }
}
