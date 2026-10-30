const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const FIELDS=['country_id','country_name','region_id','region_name','chapter_id','chapter_name','member_name','title','company','industry','city','phone','mobile','address','postal_code','website','business_desc','ideal_referral','best_product','top_problem_solved','ideal_referral_partner','favorite_story','line_url','detail_url'];
const base={country:'',mode:'all',profession:'',query:'',region:'',chapter:'',category:'',contact:'',sort:'relevance',page:1,savedOnly:false};
async function harness(){
  const messages=[],assets={},countries=[];
  for(const [cid,label,count]of [['10','美國',600],['7638','日本',300],['364','來源測試入口',4]]){
    const rows=[],profiles=[];
    for(let i=0;i<count;i++){
      const key=cid+'Member'+i,url='https://bni.com.tw/zh-TW/memberdetails?encryptedMemberId='+key;
      const row={country_id:cid,country_name:label,region_id:'r',region_name:'Region',chapter_id:'c',chapter_name:'Chapter',member_name:key,company:i===0?'+Company':'Company',industry:i===0?'Professional > Accounting > Accountant >':'Professional > Accounting > Accountant',city:'City',phone:'123',mobile:'',line_url:'',website:'',business_desc:i===0?'secretword only in full profile':'',detail_url:url};
      const text=Object.values(row).join('').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'');
      rows.push([key,'r','c',key,row.company,row.industry,'City','123','','','','',url,text,0,i]);profiles.push(FIELDS.map(k=>row[k]||''));
    }
    assets[cid+'index']=rows;assets[cid+'profiles']=profiles;
    countries.push({id:cid,name:label,label,records:count,index:cid+'index',chunks:[cid+'profiles'],regions:[{id:'r',name:'Region'}],chapters:[{id:'c',region_id:'r',name:'Chapter'}]});
  }
  const context=vm.createContext({importScripts(){},BNICatalogIO:{readGzip:async path=>assets[path]},fetch:async()=>({ok:true,json:async()=>({countries,fields:FIELDS})}),postMessage:m=>messages.push(m),setTimeout,Blob,console});context.self=context;
  vm.runInContext(fs.readFileSync('docs/search-worker.js','utf8'),context);
  await context.onmessage({data:{type:'init'}});
  return {messages,send:async data=>{messages.length=0;await context.onmessage({data});return messages;}};
}
test('global pagination is 500 and country/region IDs are isolated',async()=>{
  const h=await harness();let out=await h.send({type:'search',id:1,state:base,groups:[],saved:[]});let result=out.find(m=>m.type==='results');assert.equal(result.total,900);assert.equal(result.rows.length,500);
  out=await h.send({type:'search',id:2,state:{...base,country:'10',page:2},groups:[],saved:[]});result=out.find(m=>m.type==='results');assert.equal(result.total,600);assert.equal(result.rows.length,100);assert.ok(result.rows.every(r=>r.country_id==='10'));
  out=await h.send({type:'search',id:3,state:{...base,region:'7638:r'},groups:[],saved:[]});result=out.find(m=>m.type==='results');assert.equal(result.total,300);assert.ok(result.rows.every(r=>r.country_id==='7638'));
  out=await h.send({type:'search',id:4,state:{...base,mode:'profession',profession:'Accountant'},groups:[],saved:[]});assert.equal(out.find(m=>m.type==='results').total,900);
});
test('all-fields search includes full descriptions; profession search remains separate',async()=>{
  const h=await harness(),groups=[{original:'secretword',alts:['secretword']}];
  let out=await h.send({type:'search',id:1,state:base,groups,saved:[]});assert.equal(out.find(m=>m.type==='results').total,2);
  out=await h.send({type:'search',id:2,state:{...base,mode:'profession'},groups,saved:[]});assert.equal(out.find(m=>m.type==='results').total,0);
});
test('saved results work across countries and exports contain original full fields with formula protection',async()=>{
  const h=await harness();await h.send({type:'search',id:1,state:{...base,savedOnly:true},groups:[],saved:['7638Member0']});
  const out=await h.send({type:'export',id:'export',searchId:1}),result=out.find(m=>m.type==='exported');assert.equal(result.count,1);
  const text=await result.blob.text();assert.ok(text.includes('7638Member0'));assert.ok(text.includes('secretword only in full profile'));assert.ok(text.includes("' +Company".replace(' ','')));assert.ok(!text.includes('10Member0'));
});
