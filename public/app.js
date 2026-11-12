'use strict';
const $=id=>document.getElementById(id);
let busy=false,lastData=null;
function time(s){return s?new Date(s).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'—';}
function hourLabel(h){return (h%12||12)+':00 '+(h<12?'AM':'PM');}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const svg=(name,attr)=>`<${name} ${attr}/>`;
function clearChart(text){$('dayChart').innerHTML='<text x="45" y="125" fill="#bfbfbf" font-size="13">'+esc(text)+'</text>';}
function dayChart(d){
 const history=(d.todayHistory||[]).filter(p=>Number.isFinite(p.count)&&Number.isFinite(Date.parse(p.timestamp))).sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
 const forecast=d.dataState==='live'?d.forecast:null;
 const points=(forecast&&forecast.points)||[];
 if(!history.length){clearChart('No counts yet today');$('dayNote').textContent='No counts yet today.';return;}
 // The first recorded point determines the graph's left edge; all time spacing is real.
 const start=Date.parse(history[0].timestamp),nowTs=Date.parse(d.sourceUpdated||d.updated);
 const lastTs=Date.parse(history[history.length-1].timestamp);
 const projected=points.map(p=>({...p,ts:nowTs+p.minutes*60000}));
 const maxTs=projected.length?Math.max(lastTs,projected[projected.length-1].ts):lastTs;
 const span=Math.max(60000,maxTs-start);
 const all=[...history.map(p=>p.count),...projected.map(p=>p.high)];
 const yMax=Math.max(25,Math.ceil(Math.max(100,...all)/10)*10),left=44,right=588,top=19,bottom=206;
 const x=t=>left+(t-start)/span*(right-left),y=n=>bottom-n/yMax*(bottom-top);
 let marks='';for(let i=0;i<=4;i++){
  const v=Math.round(yMax*i/4),yy=y(v);
  marks+=svg('line',`x1="${left}" y1="${yy.toFixed(1)}" x2="${right}" y2="${yy.toFixed(1)}" stroke="#333"`);
  marks+=`<text x="37" y="${(yy+4).toFixed(1)}" text-anchor="end" fill="#bfbfbf" font-size="10">${v}</text>`;
 }
 const historyLine=history.map((p,i)=>((i&&Date.parse(p.timestamp)-Date.parse(history[i-1].timestamp)<=10*60000)?'L':'M')+x(Date.parse(p.timestamp)).toFixed(2)+' '+y(p.count).toFixed(2)).join(' ');
 let shapes=`<path d="${historyLine}" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
 for(let i=1;i<history.length;i++){
  const prev=history[i-1],cur=history[i],gap=(Date.parse(cur.timestamp)-Date.parse(prev.timestamp))/60000;
  if(gap>0&&gap<=3&&prev.count-cur.count>=15){
   shapes+=`<circle cx="${x(Date.parse(cur.timestamp)).toFixed(2)}" cy="${y(cur.count).toFixed(2)}" r="4" fill="#7dc7e6" stroke="#000" stroke-width="1"><title>Possible staff recount</title></circle>`;
  }
 }
 if(d.dataState==='live'&&Number.isFinite(d.estimatedNow)&&Number.isFinite(nowTs)){
  const src=history[history.length-1]?.count;
  const xx=x(nowTs).toFixed(2),yy=y(d.estimatedNow).toFixed(2);
  if(Number.isFinite(src))shapes+=`<line x1="${xx}" x2="${xx}" y1="${y(src).toFixed(2)}" y2="${yy}" stroke="#7dc7e6" stroke-dasharray="2 4" opacity=".75"/>`;
  shapes+=`<circle cx="${xx}" cy="${yy}" r="4" fill="#7dc7e6" stroke="#000" stroke-width="1"><title>Estimated current crowd: ${Math.round(d.estimatedNow)}</title></circle>`;
 }
 if(projected.length>1){
  const line=projected.map((p,i)=>(i?'L':'M')+x(p.ts).toFixed(2)+' '+y(p.count).toFixed(2)).join(' ');
  const upper=projected.map((p,i)=>(i?'L':'M')+x(p.ts).toFixed(2)+' '+y(p.high).toFixed(2)).join(' ');
  const lower=projected.slice().reverse().map(p=>'L'+x(p.ts).toFixed(2)+' '+y(p.low).toFixed(2)).join(' ');
  shapes+=`<defs><linearGradient id="forecastBand" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stop-color="#f0c468" stop-opacity=".08"/><stop offset="55%" stop-color="#f0c468" stop-opacity=".21"/><stop offset="100%" stop-color="#f0c468" stop-opacity=".3"/></linearGradient></defs>`;
  shapes+=`<path d="${upper} ${lower} Z" fill="url(#forecastBand)" stroke="none"/>`;
  shapes+=`<path d="${upper}" fill="none" stroke="#f0c468" stroke-opacity=".36" stroke-width="1" stroke-dasharray="3 5"/>`;
  shapes+=`<path d="${line}" fill="none" stroke="#f0c468" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="7 5"/>`;
  const divider=x(nowTs);shapes+=svg('line',`x1="${divider.toFixed(2)}" y1="${top}" x2="${divider.toFixed(2)}" y2="${bottom}" stroke="#999" stroke-dasharray="3 6"`);
  shapes+=`<text x="${Math.min(right-7,divider+6).toFixed(2)}" y="13" fill="#fff" font-size="10" text-anchor="${divider>right-65?'end':'start'}">NOW</text>`;
 }
 const ticks=[];for(let i=0;i<5;i++){
  const ts=start+span*i/4;
  ticks.push(`<text x="${(left+(right-left)*i/4).toFixed(1)}" y="232" fill="#bfbfbf" font-size="10" text-anchor="${i===0?'start':i===4?'end':'middle'}">${esc(time(new Date(ts).toISOString()))}</text>`);
 }
 $('dayChart').innerHTML=marks+shapes+ticks.join('');
 $('forecastType').textContent=forecast?'FORECAST':'REPORTED ONLY';
 $('dayNote').textContent=forecast?'Forecast based on recent counts and past daily patterns. The shaded range is illustrative; zero at closing is assumed.':'Forecast unavailable while live data is offline.';
}
const HEAT_COLORS=[
 '#123f32','#196047','#257b4d','#40945b',
 '#65a45b','#96ac52','#c1a248','#d88c36',
 '#dd7130','#d9582e','#c83b34','#a51f3d'
];
function heatColor(value){
 if(!Number.isFinite(value))return '#202020';
 // 12 equally spaced capacity bands; >100 stays in the hottest band.
 return HEAT_COLORS[Math.min(HEAT_COLORS.length-1,Math.max(0,Math.floor(Math.max(0,value)/100*HEAT_COLORS.length)))];
}
function renderHeat(cells){
 const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
 const indexed=new Map((cells||[]).map(x=>[x.dayIndex+'-'+x.hour,x]));
 let html='<div></div>'+days.map(d=>'<div>'+d+'</div>').join('');
 for(let h=7;h<23;h++){
  html+='<div>'+hourLabel(h).replace('00 ','')+'</div>';
  for(let d=0;d<7;d++){
   const v=indexed.get(d+'-'+h);
   const recorded=v&&Number.isFinite(v.average);
   const color=recorded?heatColor(v.average):'#202020';
   const title=recorded?`${days[d]} ${hourLabel(h)} · ${v.average} average occupants · ${v.days||0} matching days · ${v.samples} samples`:'No counts recorded for this hour';
   html+='<div class="cell" style="background:'+color+'" title="'+esc(title)+'" aria-label="'+esc(title)+'"></div>';
  }
 }
 $('heatmap').innerHTML=html;
}
function renderBest(items){
 const options=(items||[]).filter(x=>Number.isFinite(x.average));
 const isPrediction=x=>x.source==='forecast';
 $('besttimes').innerHTML=options.length?options.map(v=>{
  const basis=isPrediction(v)?'Forecast for today':'Past '+v.days+' day'+(v.days===1?'':'s');
  const extra=isPrediction(v)?(v.days>=2?' · '+v.days+' matching days':' · Limited history'):' · '+(v.days>=3?'Based on several days':'Limited history');
  return '<div class="bestitem"><div class="eyebrow">'+esc(v.day)+' · '+esc(hourLabel(v.hour))+'</div><strong>'+v.average+' <small>expected people</small></strong><small>'+esc(basis)+esc(extra)+'</small></div>';
 }).join(''):
 '<div class="fine">Not enough information to suggest a quieter hour yet.</div>';
 const top=options[0];
 $('bestQuick').textContent=top?hourLabel(top.hour).replace(':00',''):'—';
 $('bestQuickNote').textContent=top?(top.source==='forecast'?'Forecast: '+top.average:'Past avg: '+top.average)+' people':'Not enough history yet';
}
function insightDetails(d,live){
 const items=[];
 if(live&&Number.isFinite(d.count)){
  if(Number.isFinite(d.typicalNow)&&d.typicalDays>=2){
   const difference=d.count-d.typicalNow;
   items.push({title:'COMPARED WITH USUAL',value:(difference>0?'+':'')+difference+' people',detail:difference>5?'Busier than usual':difference< -5?'Quieter than usual':'About normal'});
  }else items.push({title:'COMPARED WITH USUAL',value:'—',detail:'Need more matching weekdays'});
  if(Number.isFinite(d.estimatedNow)){
   items.push({title:'ADJUSTED ESTIMATE',value:d.estimatedNow+' people',detail:'Based on likely recounts · approximate'});
  }else items.push({title:'ADJUSTED ESTIMATE',value:'—',detail:'Not enough likely recounts yet'});
  const best=(d.bestTimes||[])[0];
  if(best)items.push({title:'QUIETER LATER',value:hourLabel(best.hour),detail:(best.source==='forecast'?'Forecast: ':'Past average: ')+best.average+' people · '+(best.days>=2?best.days+' matching days':'Limited history')});
 }else items.push({title:'CURRENT STATUS',value:(d.dataState||'offline').toUpperCase(),detail:'Live comparisons unavailable'});
 $('insightDetails').innerHTML=items.map(x=>'<div class="insight-item"><div class="eyebrow">'+esc(x.title)+'</div><strong>'+esc(x.value)+'</strong><small>'+esc(x.detail)+'</small></div>').join('');
}
function render(d){
 lastData=d;
 const state=d.dataState||'offline',live=state==='live',delayed=state==='delayed',closed=state==='closed';
 const color=d.color||'#70e6a2';
 $('connection').textContent=state.toUpperCase();$('liveDot').style.background=live?'#70e6a2':delayed?'#ffc65c':closed?'#a0a0a0':'#ff6767';
 $('count').textContent=closed||state==='offline'||!Number.isFinite(d.count)?'—':d.count;
 $('status').textContent=closed?'CLOSED':live?d.label:delayed?'DELAYED':'OFFLINE';
 $('status').style.color=live?color:delayed?'#ffc65c':'#ff6767';
 $('open').textContent=closed?'CLOSED HOURS':live?'OPEN NOW':delayed?'LAST KNOWN COUNT':'DATA UNAVAILABLE';
 $('trend').textContent=live?(d.trendLabel||'LEARNING'):'—';$('trend').style.color=live?'#fff':'#aaa';
 $('fill').style.width=closed||state==='offline'||!Number.isFinite(d.percent)?'0%':Math.min(100,d.percent)+'%';$('fill').style.background=color;
 $('capacity').textContent=closed?'Outside gym hours':state!=='offline'&&Number.isFinite(d.percent)?d.percent+'% of 100 reference'+(d.count>100?' · above reference':''):'—';
 $('updated').textContent=d.sourceUpdated?'Last received '+time(d.sourceUpdated):'No reading received';
 const change=live?d.reportedChange30:null;
 $('rate').textContent=change&&Number.isFinite(change.change)?(change.change>0?'+':'')+change.change:'—';
 $('rateNote').textContent=change?'Reported count change':'Not enough recent data';
 $('usual').textContent=d.typicalNow==null?'—':d.typicalNow;
 $('usualNote').textContent=d.typicalDays>=2?d.typicalDays+' matching days':'Limited history';
 $('next').textContent=live&&d.forecast?d.forecast.projected:'—';
 $('nextNote').textContent=live&&d.forecast?'Estimated in '+Math.min(60,d.forecast.horizonMinutes)+' min':'Not available';
 
 $('insight').textContent=d.warning||(!live?'Current crowd data is unavailable.':d.estimatedNow!=null?'The adjusted estimate accounts for possible staff recounts. The reported count remains unchanged.':'The displayed count comes directly from the gym. Crowd estimates will improve as more likely recounts are recorded.');
 insightDetails(d,live);
 $('logged').textContent='Updated '+time(d.lastLogged);
 dayChart(d);renderHeat(d.heatmap);renderBest(d.bestTimes);
}
function errorState(message){
 lastData=null;
 $('connection').textContent='OFFLINE';$('liveDot').style.background='#ff6767';
 $('status').textContent='OFFLINE';$('status').style.color='#ff6767';$('count').textContent='—';
 $('open').textContent='DATA UNAVAILABLE';$('trend').textContent='—';$('fill').style.width='0%';
 $('rate').textContent='—';$('rateNote').textContent='Unavailable';$('next').textContent='—';$('usual').textContent='—';$('bestQuick').textContent='—';$('bestQuickNote').textContent='Unavailable';$('usualNote').textContent='—';$('nextNote').textContent='Unavailable';
 $('updated').textContent='—';$('capacity').textContent='—';
 $('insight').textContent='Current occupancy is unavailable.';
 $('insightDetails').innerHTML='';
 $('dayNote').textContent='Data unavailable.';clearChart('Unable to load counts.');
 $('besttimes').innerHTML='<div class="fine">No current recommendations.</div>';
 $('heatmap').innerHTML='';
}
async function refresh(){
 if(busy)return;
 busy=true;$('refresh').disabled=true;
 try{
  const res=await fetch('/api/status?t='+Date.now(),{cache:'no-store',headers:{Accept:'application/json'}});
  let data;try{data=await res.json();}catch{throw Error('Firebase /api/status did not return JSON (HTTP '+res.status+'). Confirm the getOccupancy function was deployed.');}
  if(!res.ok||!data||data.ok!==true)throw Error((data&&data.error)||('API HTTP '+res.status));
  render(data);
 }catch(err){errorState(err.message||String(err));}
 finally{busy=false;$('refresh').disabled=false;}
}
$('refresh').onclick=refresh;
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{
 document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));
 document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===b.dataset.tab));
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
refresh();setInterval(refresh,30000);
