(function(root){
  'use strict';
  const bounded=(promise,ms)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),ms);})]).finally(()=>clearTimeout(timer));};
  let writes=0,writing=false;
  async function readGzip(path){
    const url=new URL(path,root.location.href).href;let cache,response;
    // Safari storage operations can be slow or unavailable; they must not block public data.
    try{cache=await bounded(caches.open('bni-public-catalog-v1'),800);response=await bounded(cache.match(url),800);}catch{}
    let bytes;
    if(response){try{bytes=new Uint8Array(await bounded(response.arrayBuffer(),1500));}catch{response=null;}}
    if(!response){
      const controller=new AbortController();let timer;const activity=()=>{clearTimeout(timer);timer=setTimeout(()=>controller.abort(),25000);};activity();
      try{
        response=await fetch(url,{signal:controller.signal});if(!response.ok)throw Error('資料檔載入失敗：'+response.status);
        if(response.body?.getReader){const reader=response.body.getReader(),parts=[];let size=0;activity();while(true){const part=await reader.read();if(part.done)break;parts.push(part.value);size+=part.value.byteLength;activity();}bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}}else bytes=new Uint8Array(await response.arrayBuffer());
      }catch(error){if(controller.signal.aborted)throw Error('資料載入逾時，請按「重新載入資料」重試');throw error;}
      finally{clearTimeout(timer);}
      // Avoid clone/tee buffering and do not wait for CacheStorage before showing results.
      if(cache&&!writing&&bytes.byteLength<=8*1024*1024){writing=true;const saved=new Response(bytes,{headers:{'Content-Type':'application/octet-stream'}});Promise.resolve().then(()=>cache.put(url,saved)).then(async()=>{if(++writes%20===0){const keys=await cache.keys();if(keys.length>300)await Promise.all(keys.slice(0,keys.length-250).map(key=>cache.delete(key)));}}).catch(()=>{}).finally(()=>{writing=false;});}
    }
    if(bytes[0]===31&&bytes[1]===139){if(typeof DecompressionStream==='undefined')throw Error('請更新瀏覽器以讀取全球資料');return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();}
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  root.BNICatalogIO={readGzip};
})(typeof window!=='undefined'?window:self);
