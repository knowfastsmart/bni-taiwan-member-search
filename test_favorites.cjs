const {test}=require('node:test');
const assert=require('node:assert/strict');
const {FavoritesStore,memberKey}=require('./docs/favorites-store.js');
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const url='https://bni.com.tw/zh-TW/memberdetails?encryptedMemberId=abc%2Bdef%2Fghi%3D%3D&name=Old';
test('legacy favorites migrate by stable member identity, independently of profile names',()=>{
  const s=storage();s.setItem('bni-saved-v1',JSON.stringify([url,'https://evil.example/?encryptedMemberId=bad']));
  const store=new FavoritesStore(s);assert.deepEqual([...store.saved],['abc-def_ghi']);
  assert.equal(memberKey(url.replace('Old','New')),'abc-def_ghi');store.toggle('second');
  assert.deepEqual([...new FavoritesStore(s).saved],['abc-def_ghi','second']);
});
test('account switch and late callbacks cannot expose or modify another account favorites',async()=>{
  const store=new FavoritesStore(storage());let resolve;
  const a=store.connect('alice',()=>new Promise(r=>resolve=r));store.receive(a,[{id:'AliceOnly',active:true}]);
  store.toggle('AlicePending');await tick();const b=store.connect('bob',async()=>{});
  store.receive(a,[{id:'AliceSecret',active:true}]);resolve();await tick();
  assert.equal(store.saved.size,0);store.receive(b,[{id:'BobOnly',active:true}]);
  assert.deepEqual([...store.saved],['BobOnly']);store.connect(null);assert.equal(store.saved.size,0);
});
test('pending removals survive refresh and overlay remote state; stale ack does not erase a new toggle',async()=>{
  const s=storage(),store=new FavoritesStore(s),writes=[];let resolve;
  let v=store.connect('alice',(uid,key,active)=>{writes.push(active);return new Promise(r=>resolve=r);});
  store.receive(v,[{id:'Member',active:true}]);store.toggle('Member');await tick();
  const restored=new FavoritesStore(s);v=restored.connect('alice',async()=>{});
  restored.receive(v,[{id:'Member',active:true}],true);assert.equal(restored.saved.has('Member'),false);
  store.toggle('Member');resolve();await tick();assert.equal(store.saved.has('Member'),true);
  assert.deepEqual(writes,[false,true]);resolve();await tick();assert.equal(store.pending.size,0);
});
test('guest import is explicit and a failed write remains available for retry',async()=>{
  const store=new FavoritesStore(storage());store.toggle('Guest');let fail=true;
  const v=store.connect('alice',async()=>{if(fail)throw Error('offline');});
  store.receive(v,[{id:'Cloud',active:true}]);assert.equal(store.saved.has('Guest'),false);
  store.importGuest();await tick();assert.equal(store.pending.size,1);assert.ok(store.error);
  fail=false;store.retry();await tick();assert.equal(store.pending.size,0);assert.equal(store.saved.has('Guest'),true);
  store.connect(null);assert.deepEqual([...store.saved],['Guest']);
});

// Exercise the actual page subscription without a browser or Firebase connection.
function pageFavorites(savedOnly=false){
  const vm=require('node:vm'),fs=require('node:fs'),calls=[];let receive;
  const context=vm.createContext({favoriteStore:{uid:null,subscribe(fn){receive=fn;fn({uid:null,ready:true,error:'',saved:new Set()});}},state:{savedOnly},saved:new Set(),data:[{member_name:'Member'}],filtered:[{id:0}],totalResults:1,$:()=>({textContent:''}),refreshSaveButtons:()=>{},render:()=>calls.push('render'),apply:(...args)=>calls.push(args)});
  const source=fs.readFileSync('docs/app.js','utf8');vm.runInContext(source.slice(source.indexOf('let favoritesUIReady=false')),context);
  calls.length=0;return {context,calls,receive:(saved,extra={})=>receive({uid:null,ready:true,error:'',saved:new Set(saved),...extra})};
}
test('heart changes and sync acknowledgements do not restart the public member search',()=>{
  const page=pageFavorites();page.receive(['Member']);page.receive(['Member']);page.receive([]);
  assert.deepEqual(page.calls,[]);assert.equal(page.context.saved.size,0);
});
test('saved-list changes refresh quietly but switching accounts clears private results',()=>{
  const page=pageFavorites(true);page.receive(['Member']);assert.deepEqual(page.calls,[[false,true]]);
  page.calls.length=0;page.receive(['Other'],{uid:'another-account',ready:false});
  assert.deepEqual(page.calls,['render',[false,false]]);assert.equal(page.context.data.length,0);assert.equal(page.context.totalResults,0);
});
test('heart painting updates only changed buttons and keeps the existing card elements',()=>{
  const vm=require('node:vm'),fs=require('node:fs');let changes=0;
  const button=(id)=>({dataset:{save:String(id)},pressed:'false',classList:{toggle(){}},getAttribute(){return this.pressed;},setAttribute(k,v){changes++;if(k==='aria-pressed')this.pressed=v;this[k]=v;}});
  const first=button(0),second=button(1),buttons=[first,second],source=fs.readFileSync('docs/app.js','utf8');
  const context=vm.createContext({document:{querySelectorAll:()=>buttons},data:[{detail_url:'Member',member_name:'會員一'},{detail_url:'Other',member_name:'會員二'}],saved:new Set(['Member']),memberKey:v=>v});
  vm.runInContext(source.slice(source.indexOf('function refreshSaveButtons()'),source.indexOf('function card(id)')),context);
  context.refreshSaveButtons();assert.equal(first.pressed,'true');assert.equal(first.textContent,'♥');assert.equal(first['aria-label'],'取消收藏 會員一');assert.equal(second.pressed,'false');assert.equal(changes,2);
  context.refreshSaveButtons();assert.equal(changes,2);assert.equal(buttons[0],first);
});
