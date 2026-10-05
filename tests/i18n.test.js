import test from 'node:test';
import assert from 'node:assert/strict';
import { createI18n, LANGUAGE_STORAGE_KEY } from '../src/i18n/index.js';
import { english } from '../src/i18n/index.js';

test('language defaults, unsupported preferences and missing keys fall back to Chinese',()=>{
  const i=createI18n({getItem:()=> 'fr'});
  assert.equal(i.language,'zh-Hant');assert.equal(i.t('高度'),'高度');
  assert.equal(i.setLanguage('fr'),false);i.setLanguage('en');
  assert.equal(i.t('高度'),'Height');assert.equal(i.t('Unknown'),'Unknown');assert.equal(i.t('toString'),'toString');
});
test('language persistence and subscriptions only change on a valid different language',()=>{
  const stored=new Map([[LANGUAGE_STORAGE_KEY,'en']]);let calls=0;
  const i=createI18n({getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)});
  assert.equal(i.language,'en');const unsubscribe=i.subscribe(()=>calls++);
  assert.equal(i.setLanguage('en'),false);assert.equal(calls,0);
  i.setLanguage('zh-Hant');assert.equal(stored.get(LANGUAGE_STORAGE_KEY),'zh-Hant');assert.equal(calls,1);
  unsubscribe();i.setLanguage('en');assert.equal(calls,1);
});
test('blocked storage still allows language switching and interpolation treats user text literally',()=>{
  const i=createI18n({getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}});
  assert.equal(i.language,'zh-Hant');assert.equal(i.setLanguage('en'),true);
  assert.equal(i.t('已自動儲存 {time}',{time:'12:34:56'}),'Autosaved 12:34:56');
  assert.equal(i.t('{hand}{finger}・{joint}',{hand:'<script>',finger:'$&',joint:'{hand}'}),'<script> $& · {hand}');
});
test('every translation is nonempty and preserves interpolation parameters',()=>{
  for(const [key,value] of Object.entries(english)){
    assert.ok(value.length,key);
    assert.deepEqual((value.match(/\{\w+\}/g)||[]).sort(),(key.match(/\{\w+\}/g)||[]).sort(),key);
  }
});

test('live text and tooltip updates preserve nodes and replace obsolete renderers',async()=>{
  const {i18n,t,liveText,liveAttribute,refreshLiveTranslations}=await import('../src/i18n/index.js');
  const attrs=new Map([['data-tooltip','old']]);let clicks=0;
  const node={textContent:'',setAttribute:(k,v)=>attrs.set(k,v),hasAttribute:k=>attrs.has(k),onclick:()=>clicks++};
  const root={querySelectorAll:()=>[node]};
  try{
    i18n.setLanguage('zh-Hant');liveText(node,()=>t('▶ 播放'));liveAttribute(node,'title',()=>t('套用「{name}」',{name:'自訂 English'}));
    assert.equal(node.textContent,'▶ 播放');const click=node.onclick;
    i18n.setLanguage('en');refreshLiveTranslations(root);
    assert.equal(node.textContent,'▶ Play');assert.equal(attrs.get('data-tooltip'),'Apply “自訂 English”');assert.equal(node.onclick,click);
    node.onclick();assert.equal(clicks,1);
    liveText(node,()=>t('■ 停止'));i18n.setLanguage('zh-Hant');refreshLiveTranslations(root);assert.equal(node.textContent,'■ 停止');
  }finally{i18n.setLanguage('zh-Hant');}
});

test('all authored translation annotations have dictionary entries',async()=>{
  const {readFile}=await import('node:fs/promises');const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const decode=s=>s.replaceAll('&quot;','"').replaceAll('&#x27;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
  const keys=Array.from(html.matchAll(/data-i18n(?:-(?:title|aria-label|placeholder|data-tooltip|label|alt))?="([^"]+)"/g),m=>decode(m[1]));
  assert.ok(keys.length>0);
  for(const key of keys)assert.ok(Object.hasOwn(english,key),'missing: '+key);
});

test('migrated icon tooltips keep translated accessible names without restoring native titles',async()=>{
  const {i18n,t,liveAttribute,refreshLiveTranslations}=await import('../src/i18n/index.js');
  const attrs=new Map([['data-tooltip','old']]);
  const node={tagName:'BUTTON',textContent:'×',getAttribute:k=>attrs.get(k)??null,hasAttribute:k=>attrs.has(k),setAttribute:(k,v)=>attrs.set(k,v)};
  try{
    i18n.setLanguage('zh-Hant');liveAttribute(node,'title',()=>t('刪除控制點 {point}',{point:'P1'}));
    assert.equal(attrs.has('title'),false);assert.equal(attrs.get('aria-label'),'刪除控制點 P1');
    i18n.setLanguage('en');refreshLiveTranslations({querySelectorAll:()=>[node]});
    assert.equal(attrs.has('title'),false);assert.equal(attrs.get('data-tooltip'),'Delete control point P1');assert.equal(attrs.get('aria-label'),'Delete control point P1');
    attrs.delete('data-tooltip-label');attrs.set('aria-label','Explicit label');
    liveAttribute(node,'title',()=>t('刪除控制點 {point}',{point:'P2'}));assert.equal(attrs.get('aria-label'),'Explicit label');
  }finally{i18n.setLanguage('zh-Hant');}
});

test('joint search includes Chinese, English and internal keys in both locales',async()=>{
  const {i18n}=await import('../src/i18n/index.js');const {jointSearchText,jointCountLabel}=await import('../src/i18n/joint-labels.js');
  try{
    for(const locale of ['zh-Hant','en']){
      i18n.setLanguage(locale);assert.match(jointSearchText('rArm'),/right arm/);assert.match(jointSearchText('rArm'),/右/);
      assert.match(jointSearchText('rIndex2'),/index/);assert.match(jointSearchText('rIndex2'),/食指/);assert.match(jointSearchText('rIndex2'),/rindex2/);
      assert.equal(jointCountLabel(1),locale==='en'?'1 joint':'1 個關節');assert.equal(jointCountLabel(2),locale==='en'?'2 joints':'2 個關節');
    }
  }finally{i18n.setLanguage('zh-Hant');}
});
