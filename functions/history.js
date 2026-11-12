'use strict';
// Read-only historical presentation and provisional future profiles.
const L=require('./logic');
const R=require('./recounts');
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const dateOnly=s=>{
 if(typeof s!=='string'||!DAY.test(s))return false;
 const d=new Date(s+'T12:00:00Z');
 return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===s;
};
const minutes=p=>p.hour*60+p.minute;
function dailyBins(doc){
 const bins=new Map();
 const items=Array.isArray(doc?.points)?doc.points:[];
 for(const r of items){
  const stamp=Date.parse(r.timestamp);
  if(!Number.isFinite(stamp)||!Number.isFinite(r.count)||r.count<0)continue;
  const local=L.parts(new Date(stamp));
  if(local.day!==(doc.date||local.day))continue;
  const slot=Math.floor(minutes(local)/15)*15;
  const b=bins.get(slot)||{sum:0,n:0};
  b.sum+=r.count;b.n++;bins.set(slot,b);
 }
 return bins;
}
function historical(doc,date){
 const points=(Array.isArray(doc?.points)?doc.points:[]).filter(x=>Number.isFinite(x.count)&&x.count>=0&&Number.isFinite(Date.parse(x.timestamp))&&L.parts(new Date(x.timestamp)).day===date)
  .map(x=>({timestamp:x.timestamp,count:x.count})).sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
 const values=points.map(x=>x.count), bins=dailyBins({...doc,date});
 return {mode:'historical',date,points,quarterHours:Array.from(bins,([slot,b])=>({minute:slot,count:Math.round(b.sum/b.n),samples:b.n})).sort((a,b)=>a.minute-b.minute),
  summary:{readings:values.length,average:values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length*10)/10:null,min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null},
  note:'Source readings. Large drops may reflect staff recounts.'};
}
function weekdayOf(date){return L.parts(new Date(date+'T12:00:00Z')).dow;}
function future(date,records){
 const dow=weekdayOf(date),range=L.HOURS[dow],other=Array.isArray(records)?records:[];
 const valid=other.filter(r=>dateOnly(r.date)&&r.date<date&&Array.isArray(r.points)&&r.points.length);
 const same=valid.filter(r=>weekdayOf(r.date)===dow);
 const baseline=same.length>=2?same:valid;
 const basis=same.length>=2?'same weekdays':'recent days';
 // Reconstruct departure rates from successive probable recounts, then adjust
 // historical readings downward between anchor points. If evidence is too
 // sparse, leave the raw readings intact and identify them as source-based.
 const all=valid.flatMap(d=>d.points.map(p=>({...p})));
 const analysis=R.inspect(all);
 const rate=Number.isFinite(analysis.state.departuresPerMinute)&&analysis.state.rateSamples>=2?
  analysis.state.departuresPerMinute:null;
 const resets=analysis.results.filter(v=>v.isReset).map(v=>Date.parse(v.timestamp));
 const daily=baseline.map(r=>{
  let pointer=0,lastReset=null;
  const sorted=r.points.slice().sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
  const adjusted=rate===null?sorted:sorted.map(p=>{
   const t=Date.parse(p.timestamp);
   while(pointer<resets.length&&resets[pointer]<=t)lastReset=resets[pointer++];
   const elapsed=lastReset===null?null:(t-lastReset)/60000;
   return {...p,count:elapsed!==null&&elapsed>=0&&elapsed<=180?
    Math.max(0,Math.round(p.count-rate*elapsed)):p.count};
  });
  return {date:r.date,bins:dailyBins({date:r.date,points:adjusted})};
 });
 const points=[];
 for(let minute=range[0]*60;minute<range[1]*60;minute+=15){
  const means=daily.map(r=>r.bins.get(minute)).filter(b=>b&&b.n>=5).map(b=>b.sum/b.n);
  let avg=means.length?means.reduce((a,b)=>a+b,0)/means.length:null;
  if(avg!==null){
   const untilClose=range[1]*60-minute;
   avg=Math.max(0,Math.round(avg*Math.min(1,untilClose/60)));
  }
  points.push({minute,count:avg,days:means.length});
 }
 points.push({minute:range[1]*60,count:0,days:0,assumedClose:true});
 const observed=points.filter(p=>p.count!==null&&!p.assumedClose);
 return {mode:'future',date,points:observed.length?points:[],
  summary:{matchingWeekdays:same.length,referenceDays:baseline.length,coveredSlots:observed.length,totalSlots:range[1]*4-range[0]*4,
   possibleRecounts:analysis.state.resetCount||0,recountAdjusted:rate!==null},
  basis,note:observed.length?('Based on '+basis+'. '+(rate===null?'Uses reported counts until more recounts are recorded.':'Adjusted for estimated departures between likely staff recounts.')+' Zero at closing is assumed.'):'Not enough history for this date.'};
}
module.exports={dateOnly,dailyBins,historical,future};
