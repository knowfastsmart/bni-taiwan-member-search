/* Account-scoped favorites with a durable per-account outbox. No login tokens are stored here. */
(function(root){
  'use strict';
  const validKey=k=>typeof k==='string'&&/^[A-Za-z0-9_-]{1,512}$/.test(k);
  function memberKey(value){
    try{const u=new URL(value);if(u.protocol!=='https:'||!['bni.com.tw','www.bni.com.tw'].includes(u.hostname))return '';const id=u.searchParams.get('encryptedMemberId')||'';if(!/^[A-Za-z0-9+/=_-]+$/.test(id))return '';return id.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}catch{return '';}
  }
  class FavoritesStore{
    constructor(storage){
      this.storage=storage;this.listeners=new Set();this.uid=null;this.version=0;this.remote=new Set();this.pending=new Map();this.inflight=new Set();this.ready=false;this.offline=false;this.error='';this.storageError=false;this.guest=new Set();
      try{const old=JSON.parse(storage.getItem('bni-saved-v1')||'[]');if(Array.isArray(old))for(const url of old){const k=memberKey(url);if(k)this.guest.add(k);}
        const current=JSON.parse(storage.getItem('bni-guest-v2')||'null');if(Array.isArray(current))this.guest=new Set(current.filter(validKey));}catch{this.storageError=true;}
    }
    get saved(){const out=new Set(this.uid?this.remote:this.guest);if(this.uid)for(const [k,v] of this.pending)v.active?out.add(k):out.delete(k);return out;}
    snapshot(){return {saved:this.saved,uid:this.uid,ready:!this.uid||this.ready,pending:this.pending.size,offline:this.offline,error:this.error,storageError:this.storageError,importable:this.uid?[...this.guest].filter(k=>!this.saved.has(k)).length:0};}
    subscribe(fn){this.listeners.add(fn);fn(this.snapshot());return ()=>this.listeners.delete(fn);}
    emit(){const s=this.snapshot();for(const fn of this.listeners)fn(s);}
    persist(){try{if(this.uid)this.storage.setItem('bni-pending-v2:'+this.uid,JSON.stringify([...this.pending]));else this.storage.setItem('bni-guest-v2',JSON.stringify([...this.guest]));}catch{this.storageError=true;}}
    connect(uid,write){
      this.version++;this.uid=uid||null;this.write=write;this.remote=new Set();this.pending=new Map();this.inflight=new Set();this.ready=false;this.offline=false;this.error='';
      if(this.uid)try{const list=JSON.parse(this.storage.getItem('bni-pending-v2:'+uid)||'[]');if(Array.isArray(list))for(const entry of list){if(Array.isArray(entry)&&validKey(entry[0])&&typeof entry[1]?.active==='boolean')this.pending.set(entry[0],{active:entry[1].active,rev:entry[1].rev||0});}}catch{this.storageError=true;}
      this.emit();return this.version;
    }
    receive(version,records,fromCache=false){
      if(version!==this.version||!this.uid)return;
      this.remote=new Set(records.filter(r=>r.active&&validKey(r.id)).map(r=>r.id));this.offline=fromCache;if(!fromCache){this.ready=true;this.error='';}this.emit();if(this.ready&&!this.error)this.flush();
    }
    fail(version,message){if(version!==this.version)return;this.error=message;this.emit();}
    toggle(k){
      if(!validKey(k))return false;if(this.uid&&!this.ready)return false;
      const active=!this.saved.has(k);
      if(!this.uid){active?this.guest.add(k):this.guest.delete(k);this.persist();this.emit();return true;}
      const old=this.pending.get(k);this.pending.set(k,{active,rev:(old?.rev||0)+1});this.persist();this.emit();this.flush();return true;
    }
    importGuest(){if(!this.uid||!this.ready)return false;for(const k of this.guest)if(!this.saved.has(k)){const old=this.pending.get(k);this.pending.set(k,{active:true,rev:(old?.rev||0)+1});}this.persist();this.emit();this.flush();return true;}
    retry(){this.error='';this.emit();this.flush();}
    flush(){
      if(!this.uid||!this.ready||this.error||!this.write)return;
      const version=this.version,uid=this.uid,writer=this.write;
      for(const [key,op] of this.pending){
        if(this.inflight.has(key))continue;this.inflight.add(key);
        Promise.resolve().then(()=>writer(uid,key,op.active)).then(()=>{
          if(this.version!==version)return;
          op.active?this.remote.add(key):this.remote.delete(key);
          if(this.pending.get(key)===op)this.pending.delete(key);
          this.inflight.delete(key);this.persist();this.emit();this.flush();
        },()=>{if(this.version!==version)return;this.inflight.delete(key);this.error='收藏尚未同步，請檢查網路後重試。';this.emit();});
      }
    }
  }
  const api={FavoritesStore,memberKey,validKey};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.BNIFavorites=api;
})(typeof window!=='undefined'?window:globalThis);
