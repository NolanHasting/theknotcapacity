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
 if(!history.length){clearChart('Waiting for today’s observed readings…');$('dayNote').textContent='No readings logged today.';return;}
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
 if(projected.length>1){
  const line=projected.map((p,i)=>(i?'L':'M')+x(p.ts).toFixed(2)+' '+y(p.count).toFixed(2)).join(' ');
  const upper=projected.map((p,i)=>(i?'L':'M')+x(p.ts).toFixed(2)+' '+y(p.high).toFixed(2)).join(' ');
  const lower=projected.slice().reverse().map(p=>'L'+x(p.ts).toFixed(2)+' '+y(p.low).toFixed(2)).join(' ');
  shapes+=`<path d="${upper} ${lower} Z" fill="#fff" opacity=".15"/>`;
  shapes+=`<path d="${line}" fill="none" stroke="#fff" stroke-width="2.6" stroke-dasharray="7 5"/>`;
  const divider=x(nowTs);shapes+=svg('line',`x1="${divider.toFixed(2)}" y1="${top}" x2="${divider.toFixed(2)}" y2="${bottom}" stroke="#999" stroke-dasharray="3 6"`);
  shapes+=`<text x="${Math.min(right-7,divider+6).toFixed(2)}" y="13" fill="#fff" font-size="10" text-anchor="${divider>right-65?'end':'start'}">NOW</text>`;
 }
 const ticks=[];for(let i=0;i<5;i++){
  const ts=start+span*i/4;
  ticks.push(`<text x="${(left+(right-left)*i/4).toFixed(1)}" y="232" fill="#bfbfbf" font-size="10" text-anchor="${i===0?'start':i===4?'end':'middle'}">${esc(time(new Date(ts).toISOString()))}</text>`);
 }
 $('dayChart').innerHTML=marks+shapes+ticks.join('');
 $('forecastType').textContent=forecast?forecast.confidence+' ESTIMATE':'OBSERVED ONLY';
 $('dayNote').textContent=history.length+' readings today'+(forecast?' · assumed empty at configured closing time · forecast is exploratory with an illustrative, uncalibrated spread.':' · forecast unavailable until live data is restored.');
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
   const title=recorded?`${days[d]} ${hourLabel(h)} · ${v.average} average occupants · ${v.days||0} matching days · ${v.samples} readings`:'No readings recorded for this hour';
   html+='<div class="cell" style="background:'+color+'" title="'+esc(title)+'" aria-label="'+esc(title)+'"></div>';
  }
 }
 $('heatmap').innerHTML=html;
}
function renderBest(items){
 $('besttimes').innerHTML=items&&items.length?items.map(v=>'<div class="bestitem"><div class="eyebrow">'+esc(v.day)+' · '+esc(hourLabel(v.hour))+'</div><strong>'+v.average+' <small>typical people</small></strong><small>'+v.days+' separate day'+(v.days===1?'':'s')+' · '+v.samples+' readings</small><small class="reliability">'+(v.provisional?'Very early estimate':'Developing pattern')+'</small></div>').join(''):
 '<div class="fine">No reliable upcoming historical slots yet. As additional days are recorded, quieter windows for the rest of today will appear here.</div>';
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
 $('capacity').textContent=closed?'Outside configured hours':state!=='offline'&&Number.isFinite(d.percent)?d.percent+'% of 100 max capacity'+(d.count>100?' · above policy limit':''):'—';
 $('updated').textContent=d.sourceUpdated?'Last received '+time(d.sourceUpdated):'No reading received';
 $('rate').textContent=live&&Number.isFinite(d.trendPer30)?(d.trendPer30>0?'+':'')+Math.round(d.trendPer30):'—';
 $('usual').textContent=d.typicalNow==null?'—':d.typicalNow;
 $('usualNote').textContent=(d.typicalDays||0)+' matching days';
 $('next').textContent=live&&d.forecast?d.forecast.projected:'—';
 $('nextNote').textContent=live&&d.forecast?'exploratory · '+Math.min(60,d.forecast.horizonMinutes)+' min ahead':'not available';
 $('points').textContent=d.dataPoints||0;$('coverage').textContent=d.note||'historical readings';
 $('insight').textContent=(d.warning?d.warning+' ':'')+(d.insight||'')+(live&&d.forecast?' Projections use short-term movement and developing weekday averages; abrupt source corrections may occur. Closing-time zero is an assumption, not a measured count.':'');
 $('logged').textContent='Last logged reading: '+time(d.lastLogged);
 dayChart(d);renderHeat(d.heatmap);renderBest(d.bestTimes);
}
function errorState(message){
 lastData=null;
 $('connection').textContent='OFFLINE';$('liveDot').style.background='#ff6767';
 $('status').textContent='OFFLINE';$('status').style.color='#ff6767';$('count').textContent='—';
 $('open').textContent='DATA UNAVAILABLE';$('trend').textContent='—';$('fill').style.width='0%';
 $('rate').textContent='—';$('next').textContent='—';$('usual').textContent='—';$('points').textContent='—';$('coverage').textContent='Unable to verify dataset';$('usualNote').textContent='—';$('nextNote').textContent='Unavailable';
 $('updated').textContent='—';$('capacity').textContent='—';
 $('insight').textContent='Unable to retrieve occupancy data: '+message+' · The live backend may need deployment. Check the Firebase Cloud Functions deployment and scheduled collector logs.';
 $('dayNote').textContent='Data unavailable.';clearChart('Unable to load readings.');
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
