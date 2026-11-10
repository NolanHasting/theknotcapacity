
const $=id=>document.getElementById(id);
let busy=false;
function time(s){return s?new Date(s).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'—';}
function grid(){return [35,119,201].map(y=>'<line x1="42" y1="'+y+'" x2="590" y2="'+y+'" stroke="#344037"/>').join('');}
function emptyChart(id,text){$(id).innerHTML=grid()+'<text x="48" y="115" fill="#a5b1a6" font-size="13">'+text+'</text>';}
function actualChart(d){
 const history=(d.todayHistory||[]).slice();
 if(d.open&&typeof d.count==='number'&&(!history.length||Date.parse(d.updated)-Date.parse(history[history.length-1].timestamp)>60000))
   history.push({timestamp:d.updated,count:d.count});
 if(history.length<2){emptyChart('actualChart','Collecting today’s readings…');$('actualNote').textContent='At least two readings are needed.';return;}
 const max=Math.max(25,Math.ceil(Math.max(...history.map(p=>p.count))/10)*10);
 const start=Date.parse(history[0].timestamp),span=Math.max(1,Date.parse(history[history.length-1].timestamp)-start);
 const x=i=>42+(Date.parse(history[i].timestamp)-start)/span*548,y=v=>201-v/max*166;
 const line=history.map((p,i)=>(i?'L':'M')+x(i).toFixed(2)+' '+y(p.count).toFixed(2)).join(' ');
 $('actualChart').innerHTML=grid()+'<path d="'+line+' L '+x(history.length-1)+' 201 L 42 201 Z" fill="#9fd39b" opacity=".11"/>'+
 '<path d="'+line+'" fill="none" stroke="#9fd39b" stroke-width="3" stroke-linecap="round"/>'+
 '<circle cx="'+x(history.length-1)+'" cy="'+y(history[history.length-1].count)+'" r="4" fill="#cbe789"/>'+
 '<text x="5" y="38" font-size="11" fill="#a5b1a6">'+max+'</text><text x="5" y="202" font-size="11" fill="#a5b1a6">0</text>'+
 '<text x="42" y="223" font-size="11" fill="#a5b1a6">'+time(history[0].timestamp)+'</text>'+
 '<text x="590" y="223" font-size="11" text-anchor="end" fill="#a5b1a6">'+time(history[history.length-1].timestamp)+'</text>';
 $('actualNote').textContent=(d.todayHistory||[]).length+' logged readings today · latest observed '+history[history.length-1].count;
}
function forecastChart(f){
 if(!f||!f.points||f.points.length<2){
   emptyChart('forecastChart','Not enough observations yet.');
   $('forecastNote').textContent='Forecast appears after recent movement or historical patterns are available.';
   $('forecastType').textContent='WAITING';return;
 }
 const p=f.points,max=Math.max(25,Math.ceil(Math.max(...p.map(v=>v.high))/10)*10);
 const x=i=>42+i/(p.length-1)*548,y=v=>201-v/max*166;
 const upper=p.map((v,i)=>(i?'L':'M')+x(i)+' '+y(v.high)).join(' ');
 const lower=p.slice().reverse().map((v,j)=>'L'+x(p.length-1-j)+' '+y(v.low)).join(' ');
 const line=p.map((v,i)=>(i?'L':'M')+x(i)+' '+y(v.count)).join(' ');
 $('forecastChart').innerHTML=grid()+'<path d="'+upper+' '+lower+' Z" fill="#cbe789" opacity=".14"/>'+
 '<path d="'+line+'" fill="none" stroke="#cbe789" stroke-width="3" stroke-dasharray="7 5"/>'+
 '<circle cx="42" cy="'+y(p[0].count)+'" r="4" fill="#9fd39b"/>'+
 '<circle cx="590" cy="'+y(p[p.length-1].count)+'" r="4.5" fill="#cbe789"/>'+
 '<text x="5" y="38" font-size="11" fill="#a5b1a6">'+max+'</text><text x="5" y="202" font-size="11" fill="#a5b1a6">0</text>'+
 '<text x="42" y="223" font-size="11" fill="#a5b1a6">NOW</text>'+
 '<text x="590" y="223" font-size="11" text-anchor="end" fill="#a5b1a6">+'+f.horizonMinutes+' MIN</text>';
 $('forecastType').textContent=f.confidence+' ESTIMATE';
 $('forecastNote').textContent='Projected '+f.projected+' ('+(f.change>=0?'+':'')+f.change+') · '+f.method+'. Uncertainty band is illustrative.';
}
function renderHeat(cells){
 const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
 let html='<div></div>'+days.map(d=>'<div>'+d+'</div>').join('');
 for(let h=7;h<23;h++){html+='<div>'+(h%12||12)+(h<12?'a':'p')+'</div>';
  for(let d=0;d<7;d++){
   const v=(cells||[]).find(x=>x.dayIndex===d&&x.hour===h);
   const color=!v||v.average===null?'#252e27':v.average<=25?'#305a3b':v.average<=50?'#617c45':v.average<=75?'#94763f':'#994b46';
   html+='<div class="cell" style="background:'+color+'" title="'+(v&&v.average!==null?days[d]+' '+h+':00 / '+v.average+' avg / '+v.samples+' readings':'No data')+'"></div>';
  }
 }$('heatmap').innerHTML=html;
}
function renderBest(items){
 $('besttimes').innerHTML=items&&items.length?items.map(v=>'<div class="bestitem"><div class="eyebrow">'+v.day+' · '+(v.hour%12||12)+':00 '+(v.hour<12?'AM':'PM')+'</div><strong>'+v.average+'</strong><small>'+v.samples+' readings</small></div>').join(''):'<div class="fine">Collecting historical readings.</div>';
}
function render(d){
 const color=d.color||'#9fd39b';
 const age=(Date.now()-Date.parse(d.updated))/60000; const delayed=!Number.isFinite(age)||age>7;
 $('connection').textContent=delayed?'DELAYED':'LIVE';$('liveDot').style.background=delayed?'#f0c468':'#9fd39b';
 $('count').textContent=d.open?d.count:'—';$('status').textContent=d.label;$('status').style.color=color;
 $('open').textContent=d.open?'OPEN NOW':'CLOSED HOURS';
 $('trend').textContent=d.trendLabel||'—';$('trend').style.color=d.open?'#cbe789':'#a5b1a6';
 $('fill').style.width=d.open?Math.min(100,d.percent)+'%':'0%';$('fill').style.background=color;
 $('capacity').textContent=d.open?d.percent+'% of reference capacity':'Outside configured hours';
 $('updated').textContent='Checked '+time(d.updated);
 $('rate').textContent=d.trendPer30===null?'—':(d.trendPer30>0?'+':'')+Math.round(d.trendPer30);
 $('usual').textContent=d.typicalNow===null?'—':d.typicalNow;$('usualNote').textContent=d.typicalSamples+' matching readings';
 $('next').textContent=d.forecast?d.forecast.projected:'—';
 $('nextNote').textContent=d.forecast?d.forecast.confidence.toLowerCase()+' estimate':'not yet available';
 $('points').textContent=d.dataPoints;$('coverage').textContent=d.note||'historical readings';
 $('insight').textContent=d.insight+' '+(d.forecast?'The projection combines recent movement with historical data; it is not a guarantee.':'The forecast will appear as more history is collected.');
 $('logged').textContent='Last logged reading: '+time(d.lastLogged);
 actualChart(d);forecastChart(d.forecast);renderHeat(d.heatmap);renderBest(d.bestTimes);
}
function errorState(message){
 $('connection').textContent='OFFLINE';$('liveDot').style.background='#ff6c67';
 $('status').textContent='OFFLINE';$('status').style.color='#ff6c67';$('count').textContent='—';
 $('open').textContent='DATA UNAVAILABLE';$('insight').textContent='Could not obtain a fresh reading: '+message;
}
function refresh(){
 if(busy)return;
 busy=true;
 $('refresh').disabled=true;
 const api='/api/status';
 const sep=api.indexOf('?')===-1?'?':'&';
 fetch(api+sep+'t='+Date.now(),{cache:'no-store',headers:{Accept:'application/json'}})
 .then(async res=>{
   let data;
   try{data=await res.json();}catch(_){throw Error('The Firebase API returned a non-JSON response. Check the function deployment.');}
   if(!res.ok || !data || data.ok!==true)throw Error(data&&data.error||'Data is unavailable.');
   render(data);
 })
 .catch(err=>errorState(err.message||String(err)))
 .finally(()=>{busy=false;$('refresh').disabled=false;});
}
$('refresh').onclick=refresh;
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{
 document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));
 document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===b.dataset.tab));
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
refresh();setInterval(refresh,30000);
