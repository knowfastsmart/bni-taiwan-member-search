(function(root){
  'use strict';
  async function readGzip(path){
    const url=new URL(path,root.location.href).href;let cache,response;
    try{cache=await caches.open('bni-public-catalog-v1');response=await cache.match(url);}catch{}
    if(!response){response=await fetch(url);if(!response.ok)throw Error('資料檔載入失敗：'+response.status);if(cache)try{await cache.put(url,response.clone());const keys=await cache.keys();if(keys.length>300)await Promise.all(keys.slice(0,keys.length-250).map(key=>cache.delete(key)));}catch{}}
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes[0]===31&&bytes[1]===139){if(typeof DecompressionStream==='undefined')throw Error('請更新瀏覽器以讀取全球資料');return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();}
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  root.BNICatalogIO={readGzip};
})(typeof window!=='undefined'?window:self);
