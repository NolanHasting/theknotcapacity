'use strict';
(()=>{
 const el=id=>document.getElementById(id);
 const input=el('historyDate'),summary=el('historySummary'),legend=el('historyLegend'),svg=el('historyChart'),note=el('historyNote');
 const zone='America/New_York',parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const dayFmt=new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'long',month:'long',day:'numeric',year:'numeric'});
 const localDay=(d)=>{
  const p=Object.fromEntries(parts.formatToParts(d).map(x=>[x.type,x.value]));
  return p.year+'-'+p.month+'-'+p.day;
 };
 const localMinute=s=>{
  const p=Object.fromEntries(parts.formatToParts(new Date(s)).map(x=>[x.type,x.value]));
  return Number(p.hour)*60+Number(p.minute);
 };
 const tick=m=>{let h=Math.floor(m/60);return (h%12||12)+(m%60?':'+String(m%60).padStart(2,'0'):'')+(h<12?' AM':' PM');};
 const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function graph(data){
  const isFuture=data.mode==='future',source=isFuture?data.points:data.points.map(p=>({...p,minute:localMinute(p.timestamp)}));
  svg.innerHTML='';
  if(!source.length){svg.innerHTML='<text x="40" y="155" fill="#aaa">No observations available for this date.</text>';return;}
  const futureHours=[7,23],minX=7*60,maxX=23*60;
  const observed=source.filter(p=>Number.isFinite(p.count));
  const peak=Math.max(100,...observed.map(p=>p.count)),ceiling=Math.ceil(peak/25)*25;
  const left=45,right=743,top=20,bottom=246;
  const x=m=>left+(m-minX)/(maxX-minX)*(right-left);
  const y=v=>bottom-v/ceiling*(bottom-top);
  let html='';
  for(let i=0;i<=5;i++){
   const n=ceiling*i/5,yy=y(n);
   html+='<line x1="'+left+'" x2="'+right+'" y1="'+yy+'" y2="'+yy+'" stroke="#292929"/><text x="37" y="'+(yy+4)+'" text-anchor="end" fill="#aaa" font-size="11">'+Math.round(n)+'</text>';
  }
  for(let h=7;h<=23;h+=2){
   html+='<text x="'+x(h*60)+'" y="268" text-anchor="middle" fill="#aaa" font-size="10">'+safe(tick(h*60))+'</text>';
  }
  let path='',prev=null;
  for(const p of source){
   if(!Number.isFinite(p.count)){prev=null;continue;}
   const curX=x(p.minute),curY=y(p.count);
   const contiguous=prev&&p.minute-prev.minute<=(isFuture?16:10)&&p.minute>=prev.minute;
   path+=(contiguous?'L':'M')+curX.toFixed(1)+' '+curY.toFixed(1)+' ';
   prev=p;
  }
  html+='<line x1="'+left+'" x2="'+right+'" y1="'+y(100)+'" y2="'+y(100)+'" stroke="#cc7676" stroke-dasharray="5 5" opacity=".8"/>';
  html+='<path d="'+path+'" stroke="'+(isFuture?'#f0c468':'#fff')+'" stroke-width="2.4" fill="none" stroke-linejoin="round" stroke-linecap="round"'+(isFuture?' stroke-dasharray="6 4"':'')+'/>';
  if(isFuture){
   for(const p of observed){
    html+='<circle cx="'+x(p.minute)+'" cy="'+y(p.count)+'" r="2.5" fill="#f0c468"><title>'+safe(tick(p.minute))+': '+p.count+' predicted · '+p.days+' source day(s)'+(p.assumedClose?' · closing assumption':'')+'</title></circle>';
   }
  }
  svg.innerHTML=html;
 }
 async function load(){
  const date=input.value;if(!date)return;
  summary.textContent='Loading occupancy data…';note.textContent='';legend.textContent='';
  svg.innerHTML='<text x="40" y="155" fill="#aaa">Loading…</text>';
  input.disabled=true;
  try{
   const res=await fetch('/api/history?date='+encodeURIComponent(date),{cache:'no-store'});
   const d=await res.json();
   if(!res.ok||!d.ok)throw Error(d.error||'Unable to load date');
   const label=dayFmt.format(new Date(date+'T12:00:00Z'));
   if(d.mode==='historical'){
    summary.textContent=label+' · '+d.summary.readings+' readings'+(d.summary.readings?' · average '+d.summary.average+' · peak '+d.summary.max:'');
    legend.textContent='OBSERVED DATA';
   }else{
    summary.textContent=label+' · '+d.summary.referenceDays+' reference days · '+d.summary.coveredSlots+' of '+d.summary.totalSlots+' quarter-hour slots with supporting data';
    legend.textContent='EARLY ESTIMATE · '+d.basis.toUpperCase();
   }
   note.textContent=d.note;
   graph(d);
  }catch(e){summary.textContent='Unable to load occupancy date';note.textContent=e.message;svg.innerHTML='';}
  finally{input.disabled=false;}
 }
 const today=new Date(),iso=localDay(today),addDays=n=>{
  const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);
 };
 input.min=addDays(-120);input.max=addDays(30);input.value=iso;
 input.addEventListener('change',load);
 el('historyPrevious').onclick=()=>{if(input.value>input.min){input.value=addFrom(input.value,-1);load();}};
 el('historyNext').onclick=()=>{if(input.value<input.max){input.value=addFrom(input.value,1);load();}};
 function addFrom(value,n){const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
 load();
})();
