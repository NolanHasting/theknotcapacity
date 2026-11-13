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
 for(const event of (d.recounts||[])){
  const ts=Date.parse(event.timestamp);
  if(!Number.isFinite(ts)||!Number.isFinite(event.count))continue;
  const cx=x(ts).toFixed(2),cy=y(event.count).toFixed(2);
  const info='Staff recount · '+time(event.timestamp)+' · '+event.count+' reported · down '+event.drop;
  shapes+=`<path d="M${cx} ${(Number(cy)-6).toFixed(2)} l6 6 -6 6 -6 -6 Z" fill="#9FD39B" stroke="#111" stroke-width="1.5"><title>${esc(info)}</title></path>`;
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
 // Invisible touch targets keep the chart visually clean, but accessible.
 const markers=[];
 for(let i=0;i<history.length;i+=Math.max(1,Math.ceil(history.length/110))){
  const p=history[i],label=time(p.timestamp)+': '+p.count+' reported';
  markers.push('<circle class="chart-point" cx="'+x(Date.parse(p.timestamp)).toFixed(2)+'" cy="'+y(p.count).toFixed(2)+'" r="5" fill="transparent" tabindex="0" role="button" data-info="'+esc(label)+'"/>');
 }
 for(const p of projected){
  if(!Number.isFinite(p.count))continue;
  const label=time(new Date(p.ts).toISOString())+': '+p.count+' forecast · possible '+p.low+'–'+p.high;
  markers.push('<circle class="chart-point" cx="'+x(p.ts).toFixed(2)+'" cy="'+y(p.count).toFixed(2)+'" r="5.5" fill="transparent" tabindex="0" role="button" data-info="'+esc(label)+'"/>');
 }
 for(const event of (d.recounts||[])){
  if(!Number.isFinite(Date.parse(event.timestamp))||!Number.isFinite(event.count))continue;
  const label='Staff recount · '+time(event.timestamp)+' · '+event.count+' reported · down '+event.drop;
  markers.push('<circle class="chart-point" cx="'+x(Date.parse(event.timestamp)).toFixed(2)+'" cy="'+y(event.count).toFixed(2)+'" r="9" fill="transparent" tabindex="0" role="button" aria-label="'+esc(label)+'" data-info="'+esc(label)+'"/>');
 }
 $('dayChart').innerHTML=marks+shapes+markers.join('')+ticks.join('');
 $('forecastType').textContent=forecast?'FORECAST':'REPORTED ONLY';
 $('dayNote').textContent=forecast?'Forecast based on recent counts and past patterns. Range is illustrative; zero at close is assumed.':'Forecast unavailable without live readings.';
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
 const current=$('heatmap').querySelector('.heat-cell[aria-pressed="true"]');
 const selected=current?.dataset.key||'';
 let markup='<div class="heat-heading heat-corner" aria-hidden="true"></div>'+
  days.map(d=>'<div class="heat-heading">'+d+'</div>').join('');
 for(let h=7;h<23;h++){
  markup+='<div class="heat-hour">'+esc(hourLabel(h).replace(':00 ',' '))+'</div>';
  for(let d=0;d<7;d++){
   const v=indexed.get(d+'-'+h),recorded=v&&Number.isFinite(v.average);
   const color=recorded?heatColor(v.average):'#202020';
   const label=recorded?days[d]+' '+hourLabel(h)+': '+v.average+' people on average, '+(v.days||0)+' day'+(v.days===1?'':'s'):'No data for '+days[d]+' '+hourLabel(h);
   const key=d+'-'+h;
   markup+='<button type="button" class="heat-cell'+(selected===key?' is-selected':'')+'" style="--heat-color:'+color+
    '" data-key="'+key+'" data-info="'+esc(label)+'" aria-label="'+esc(label)+
    '" aria-pressed="'+(selected===key?'true':'false')+'"></button>';
  }
 }
 $('heatmap').innerHTML=markup;
 // Refreshes keep the selected cell and its detail visible.
 if(selected){
  const chosen=Array.from($('heatmap').querySelectorAll('.heat-cell')).find(x=>x.dataset.key===selected);
  if(chosen)$('heatDetail').textContent=chosen.dataset.info;
 }
}
function inspectHeat(target,selected){
 const cell=target?.closest?.('.heat-cell');
 if(!cell)return;
 $('heatDetail').textContent=cell.dataset.info;
 if(selected){
  $('heatmap').querySelectorAll('.heat-cell[aria-pressed="true"]').forEach(x=>{
   x.classList.remove('is-selected');x.setAttribute('aria-pressed','false');
  });
  cell.classList.add('is-selected');cell.setAttribute('aria-pressed','true');
 }
}
$('heatmap').addEventListener('click',e=>inspectHeat(e.target,true));
$('heatmap').addEventListener('focusin',e=>inspectHeat(e.target,false));
$('heatmap').addEventListener('pointerover',e=>{
 if(e.pointerType==='mouse'||e.pointerType==='pen')inspectHeat(e.target,false);
});
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
  const accuracy=d.forecastAccuracy?.horizons?.[30];
  if(accuracy&&accuracy.samples>=20&&Number.isFinite(accuracy.sourceMAE)){
   items.push({title:'30-MIN FORECAST ERROR',value:'±'+Math.round(accuracy.sourceMAE),detail:'Mean error vs. reported counts · '+accuracy.samples+' checks on '+d.forecastAccuracy.date});
  }else{
   items.push({title:'FORECAST TRACK RECORD',value:'Collecting',detail:'Scoring forecasts against later counts'});
  }
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
 const movement=live?(d.trend==='rising'?['↑','Filling Up']:d.trend==='falling'?['↓','Decreasing']:['→','Steady']):null;
 $('trend').textContent=movement?movement[0]+' '+movement[1]:'—';
 $('trend').style.color=live?'#fff':'#aaa';
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
 
 $('insight').textContent=d.warning||(!live?'Current crowd data is unavailable.':'The main number is reported by The Knot. Drops may be staff recounts; future counts are estimates.');
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

function showChartPoint(e){
 const point=e.target.closest?.('[data-info]');
 if(point)$('daySelection').textContent=point.getAttribute('data-info');
}
$('dayChart').addEventListener('click',showChartPoint);
$('dayChart').addEventListener('focusin',showChartPoint);
