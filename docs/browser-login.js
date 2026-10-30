/* Keep Google OAuth out of LINE's embedded browser; use LINE's documented external-browser URL. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{root.BNIBrowserLogin=api.create(document,root);}
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const isLine=ua=>/\bLine\/[\d.]+/i.test(String(ua||''));
  function externalUrl(href){
    const source=new URL(href),url=new URL('https://knowfastsmart.github.io/bni-taiwan-member-search/');
    for(const key of ['country','query','region','chapter','category','contact','mode','profession','saved']){
      const value=source.searchParams.get(key);if(value)url.searchParams.set(key,value);
    }
    url.searchParams.set('openExternalBrowser','1');return url.href;
  }
  function create(doc,win){
    const $=id=>doc.getElementById(id),line=isLine(win.navigator.userAgent),dialog=$('browserLoginHelp');
    const refresh=()=>{$('externalBrowserLink').href=externalUrl(win.location.href);$('browserLoginUrl').value=externalUrl(win.location.href);};
    function show(){
      refresh();$('browserLoginFeedback').textContent='';
      $('browserLoginIntro').textContent=line?'Google 登入不支援 LINE 內建瀏覽器。請用 Safari 或 Chrome 開啟這個網站，再登入相同 Google 帳號。':'若登入視窗空白或無法開啟，請將這個網站開在 Safari 或 Chrome，再登入相同 Google 帳號。';
      if(!dialog.open)dialog.showModal();
    }
    $('loginBrowserHelp').addEventListener('click',show);
    $('closeBrowserLogin').addEventListener('click',()=>dialog.close());
    $('copyBrowserLoginUrl').addEventListener('click',async()=>{
      refresh();try{await win.navigator.clipboard.writeText($('browserLoginUrl').value);$('browserLoginFeedback').textContent='網址已複製，請貼到 Safari 或 Chrome 開啟。';}
      catch{$('browserLoginUrl').focus();$('browserLoginUrl').select();$('browserLoginFeedback').textContent='請長按或選取上方網址複製，再貼到 Safari 或 Chrome 開啟。';}
    });
    // Capture before the Firebase handler, including when its SDK has not loaded yet.
    if(line){
      $('googleLogin').disabled=false;$('googleLogin').querySelector('span').textContent='在瀏覽器開啟登入';
      $('inAppLoginNote').hidden=false;
      $('googleLogin').addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();show();},true);
    }
    return {isLine:line,show};
  }
  return {isLine,externalUrl,create};
});
