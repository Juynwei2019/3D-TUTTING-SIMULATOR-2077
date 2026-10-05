import test from 'node:test';
import assert from 'node:assert/strict';
import { createI18n, LANGUAGE_STORAGE_KEY } from '../src/i18n/index.js';
import { english } from '../src/i18n/messages.js';

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
