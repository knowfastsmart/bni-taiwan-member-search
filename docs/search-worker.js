'use strict';
importScripts('catalog-io.js?v=20261030-global-5');
const charMap=Object.fromEntries('会會 计計 师師 网網 页頁 设設 内內 装裝 顾顧 问問 险險 产產 销銷 业業 电電 脑腦 软軟 开開 发發 务務 财財 税稅 帐帳 记記 账帳 医醫 疗療 养養 护護 营營 运運 输輸 动動 礼禮 摄攝 庆慶 宠寵 银銀 贷貸 资資 询詢 咨諮 厂廠 车車 广廣 络絡 专專 类類 联聯 线線 机機 统統 筑築 纸紙 划劃 经經 劳勞 农農 贸貿 购購 学學 习習 健健 材材 简簡 体體 别別 帮幫 找找'.split(' ').map(s=>Array.from(s)));
const norm=v=>Array.from(String(v??'').normalize('NFKC').toLowerCase()).map(c=>charMap[c]||c).join('').replace(/台/g,'臺').replace(/[\s\p{P}\p{S}]+/gu,'');
const collator=new Intl.Collator('zh-Hant',{numeric:true}),cache=new Map(),pending=new Map();
let manifest,countryMap,latest=0,lastSelection=null;
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
function available(state){return manifest.countries.filter(c=>c.records>0&&(!state.country||c.id===state.country)).sort((a,b)=>(a.id==='7699'?-1:b.id==='7699'?1:collator.compare(a.label,b.label)));}
async function getIndex(country){
  if(cache.has(country.id)){const rows=cache.get(country.id);cache.delete(country.id);cache.set(country.id,rows);return rows;}
  if(pending.has(country.id))return pending.get(country.id);
  const promise=BNICatalogIO.readGzip(country.index).then(rows=>{
    cache.set(country.id,rows);pending.delete(country.id);let count=[...cache.values()].reduce((n,r)=>n+r.length,0);
    for(const [id,r]of cache){if(count<=80000||id===country.id)break;cache.delete(id);count-=r.length;}return rows;
  },error=>{pending.delete(country.id);throw error;});pending.set(country.id,promise);return promise;
}
function summary(country,row){
  const regions=country.regions||[],chapters=country.chapters||[];
  country._regions??=new Map(regions.map(r=>[r.id,r.name]));country._chapters??=new Map(chapters.map(c=>[c.region_id+':'+c.id,c.name]));
  return {country_id:country.id,country_name:country.name,region_id:row[1],region_name:country._regions.get(row[1])||'',chapter_id:row[2],chapter_name:country._chapters.get(row[1]+':'+row[2])||'',member_name:row[3],company:row[4],industry:row[5],city:row[6],phone:row[7],mobile:row[8],line_url:row[9],website:row[10],business_desc:row[11],detail_url:row[12],_profile:{path:country.chunks[row[14]],offset:row[15]},_memberKey:row[0]};
}
async function pageRows(matches){
  const out=[];
  for(const match of matches){const c=countryMap.get(match.cid),rows=await getIndex(c);out.push(summary(c,rows[match.idx]));}
  return out;
}
function matchesRow(c,r,s,groups,saved){
  if(s.savedOnly&&!saved.has(r[0]))return -1;
  if(s.region&&s.region!==c.id+':'+r[1])return -1;
  if(s.chapter&&s.chapter!==c.id+':'+r[1]+':'+r[2])return -1;
  if(s.category&&r[5].split(/\s*>\s*/).filter(Boolean)[0]!==s.category)return -1;
  if(s.mode==='profession'&&s.profession&&r[5].split(/\s*>\s*/).filter(Boolean).at(-1)!==s.profession)return -1;
  if(s.contact==='phone'&&!r[7]&&!r[8]||s.contact==='line'&&!r[9]||s.contact==='website'&&!r[10])return -1;
  if(!groups.length)return 0;
  const name=norm(r[3]),company=norm(r[4]),fullIndustry=norm(r[5]),industry=norm(r[5].split(/\s*>\s*/).filter(Boolean).slice(1).join(' ')||r[5]);
  let score=0;
  for(const group of groups){let best=0;for(const alt of group.alts){const n=s.mode==='profession'?(industry.includes(alt)?16:0):(name.includes(alt)?20:industry.includes(alt)?16:company.includes(alt)?12:fullIndustry.includes(alt)?5:r[13].includes(alt)?3:0);if(n)best=Math.max(best,n+(alt===group.original?2:0));}if(!best)return -1;score+=best;}
  return score;
}
async function search(message){
  const {id,state,groups,saved:keys}=message;latest=id;const countries=available(state),saved=new Set(keys),pageSize=500;
  const plain=!groups.length&&!state.savedOnly&&!state.region&&!state.chapter&&!state.category&&!state.contact&&!(state.mode==='profession'&&state.profession)&&state.sort==='relevance';
  let total=0,matches=[],selection;
  if(plain){
    total=countries.reduce((n,c)=>n+c.records,0);let skip=(Math.min(Math.max(1,state.page),Math.max(1,Math.ceil(total/pageSize)))-1)*pageSize,remaining=pageSize;
    for(const c of countries){if(skip>=c.records){skip-=c.records;continue;}const size=Math.min(c.records-skip,remaining);for(let i=skip;i<skip+size;i++)matches.push({cid:c.id,idx:i});remaining-=size;skip=0;if(!remaining)break;}
    selection={all:true,countries};
  }else{
    let done=0;
    // Sequential country processing bounds peak memory; immutable shards are cached on disk.
    for(const c of countries){
      const rows=await getIndex(c);if(id!==latest)return;
      for(let i=0;i<rows.length;i++){
        const r=rows[i],score=matchesRow(c,r,state,groups,saved);if(score>=0)matches.push({cid:c.id,idx:i,score,name:r[3],company:r[4]});
        if(i%2000===1999){await pause();if(id!==latest)return;}
      }
      done++;postMessage({type:'progress',id,done,total:countries.length,country:c.label});await pause();if(id!==latest)return;
    }
    if(state.sort==='name')matches.sort((a,b)=>collator.compare(a.name,b.name));else if(state.sort==='company')matches.sort((a,b)=>collator.compare(a.company,b.company));else matches.sort((a,b)=>b.score-a.score);
    total=matches.length;selection={all:false,matches};const page=Math.min(Math.max(1,state.page),Math.max(1,Math.ceil(total/pageSize)));matches=matches.slice((page-1)*pageSize,page*pageSize);
  }
  const rows=await pageRows(matches);if(id!==latest)return;lastSelection={id,...selection};postMessage({type:'results',id,rows,total,page:Math.min(Math.max(1,state.page),Math.max(1,Math.ceil(total/pageSize)))});
}
const csvValue=v=>'"'+(/^\s*[=+@-]/.test(String(v??''))?"'"+String(v??''):String(v??'')).replace(/"/g,'""')+'"';
async function exportCSV(message){
  if(!lastSelection||lastSelection.id!==message.searchId)throw Error('搜尋尚未完成，請稍候再匯出');
  const selection=lastSelection,groups=new Map();
  if(selection.all)for(const c of selection.countries)groups.set(c.id,null);else for(const m of selection.matches){if(!groups.has(m.cid))groups.set(m.cid,new Set());groups.get(m.cid).add(m.idx);}
  const parts=['\ufeff'+manifest.fields.map(csvValue).join(',')+'\r\n'];let done=0,count=0;
  for(const [cid,selected]of groups){const c=countryMap.get(cid);for(let i=0;i<c.chunks.length;i++){
    if(selected&&![...selected].some(n=>Math.floor(n/1000)===i))continue;
    const rows=await BNICatalogIO.readGzip(c.chunks[i]);const lines=[];for(let j=0;j<rows.length;j++)if(!selected||selected.has(i*1000+j)){lines.push(rows[j].map(csvValue).join(','));count++;}
    if(lines.length)parts.push(lines.join('\r\n')+'\r\n');await pause();
  }done++;postMessage({type:'exportProgress',id:message.id,done,total:groups.size});}
  postMessage({type:'exported',id:message.id,count,blob:new Blob(parts,{type:'text/csv;charset=utf-8;'})});
}
self.onmessage=async({data:message})=>{
  try{
    if(message.type==='init'){const response=await fetch('catalog.json',{cache:'no-cache'});if(!response.ok)throw Error('全球資料目錄尚未就緒');manifest=await response.json();manifest.source_records=manifest.records;manifest.countries=manifest.countries.map(c=>c.id==='364'?{...c,source_records:c.records,records:0,status:'excluded',label:'來源測試入口（Antarctica）'}:c);manifest.records=manifest.countries.reduce((n,c)=>n+c.records,0);manifest.countries_available=manifest.countries.filter(c=>c.records>0).length;countryMap=new Map(manifest.countries.map(c=>[c.id,c]));postMessage({type:'ready',manifest});}
    else if(message.type==='search')await search(message);
    else if(message.type==='export')await exportCSV(message);
  }catch(error){postMessage({type:'error',id:message.id,message:error.message||'無法讀取資料，請重新整理後重試'});}
};
