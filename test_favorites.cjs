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
