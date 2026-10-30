const {test}=require('node:test');
const assert=require('node:assert/strict');
const {isLine,externalUrl,create}=require('./docs/browser-login.js');
function screen(ua,clipboard){
  const elements=new Map();
  const element=id=>{
    if(elements.has(id))return elements.get(id);
    const el={hidden:true,disabled:true,textContent:'',value:'',href:'',open:false,handlers:new Map(),
      addEventListener(type,fn,capture){if(!this.handlers.has(type))this.handlers.set(type,[]);this.handlers.get(type).push({fn,capture});},
      querySelector(){return element(id+'Span');},showModal(){this.open=true;},close(){this.open=false;},focus(){this.focused=true;},select(){this.selected=true;},
      async click(){const event={preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};for(const handler of this.handlers.get('click')||[]){await handler.fn(event);if(event.stopped)break;}if(!event.stopped)this.onclick?.();return event;}};
    elements.set(id,el);return el;
  };
  const win={navigator:{userAgent:ua,clipboard},location:{href:'https://knowfastsmart.github.io/bni-taiwan-member-search/?mode=profession&saved=1&query=會計師'}};
  const controller=create({getElementById:element},win);return {element,controller};
}
test('LINE is recognized without blocking ordinary Safari and Chrome',()=>{
  assert.equal(isLine('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 Line/15.17.0'),true);
  assert.equal(isLine('Mozilla/5.0 (Linux; Android 15) Chrome/130 Mobile Safari/537.36 LINE/15.1.0'),true);
  assert.equal(isLine('Mozilla/5.0 (iPhone) Version/18.0 Mobile/15E148 Safari/604.1'),false);
  assert.equal(isLine('Mozilla/5.0 Chrome/130.0 Safari/537.36'),false);
});
test('external handoff preserves public search state and excludes arbitrary redirects and OAuth values',()=>{
  const url=new URL(externalUrl('https://knowfastsmart.github.io/bni-taiwan-member-search/?mode=profession&saved=1&query=會計師&code=private&redirect=https://evil.example/#token'));
  assert.equal(url.origin,'https://knowfastsmart.github.io');assert.equal(url.searchParams.get('openExternalBrowser'),'1');
  assert.equal(url.searchParams.get('query'),'會計師');assert.equal(url.searchParams.get('saved'),'1');
  assert.equal(url.searchParams.has('code'),false);assert.equal(url.searchParams.has('redirect'),false);assert.equal(url.hash,'');
});
test('LINE login shows help and prevents the Firebase popup handler, even before the SDK loads',async()=>{
  const {element,controller}=screen('Line/15.17.0');let popups=0;element('googleLogin').onclick=()=>popups++;
  assert.equal(controller.isLine,true);assert.equal(element('googleLogin').disabled,false);
  const event=await element('googleLogin').click();assert.equal(event.prevented,true);assert.equal(popups,0);
  assert.equal(element('browserLoginHelp').open,true);assert.ok(element('externalBrowserLink').href.includes('openExternalBrowser=1'));
  await element('closeBrowserLogin').click();assert.equal(element('browserLoginHelp').open,false);
});
test('ordinary browsers keep Google login; copy fallback leaves a selectable URL and clear instructions',async()=>{
  const {element}=screen('Version/18.0 Safari/604.1');let popups=0;element('googleLogin').onclick=()=>popups++;
  await element('googleLogin').click();assert.equal(popups,1);assert.equal(element('browserLoginHelp').open,false);
  await element('loginBrowserHelp').click();assert.equal(element('browserLoginHelp').open,true);
  await element('copyBrowserLoginUrl').click();assert.equal(element('browserLoginUrl').selected,true);assert.ok(element('browserLoginFeedback').textContent.includes('Safari'));
});
