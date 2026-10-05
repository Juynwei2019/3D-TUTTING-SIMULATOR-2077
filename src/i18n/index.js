import { english } from './messages.js';
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
  for(const attr of ['title','aria-label','placeholder','data-tooltip']){
    for(const el of root.querySelectorAll(`[data-i18n-${attr}]`)){
      const value=t(el.getAttribute(`data-i18n-${attr}`));el.setAttribute(attr,value);
      if(attr==='title'&&el.hasAttribute('data-tooltip'))el.setAttribute('data-tooltip',value);
    }
  }
  document.documentElement.lang=i18n.language;
  const select=document.getElementById('languageSelect');if(select)select.value=i18n.language;
}
export function bindLanguageUI(){
  translateDOM();
  onLanguageChange(()=>translateDOM());
  document.getElementById('languageSelect').addEventListener('change',event=>i18n.setLanguage(event.target.value));
}
