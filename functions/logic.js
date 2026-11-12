'use strict';
const TZ='America/New_York';
// 100 is the venue's stated policy/reference limit, not a restriction on observed source counts.
const MAX=100;
const HOURS={0:[7,22],1:[7,23],2:[7,23],3:[7,23],4:[7,23],5:[7,23],6:[7,22]};
const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function parts(date){
 const chunks=new Intl.DateTimeFormat('en-US',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',weekday:'short'}).formatToParts(date);
 const o=Object.fromEntries(chunks.map(c=>[c.type,c.value]));
 return {day:`${o.year}-${o.month}-${o.day}`,dow:DAYS.indexOf(o.weekday),hour:+o.hour,minute:+o.minute};
}
function openNow(p){const r=HOURS[p.dow];return !!r&&p.hour>=r[0]&&p.hour<r[1];}
function remainingMinutes(p){return Math.max(0,HOURS[p.dow][1]*60-(p.hour*60+p.minute));}
function crowd(count,open){
 if(!open)return {level:'closed',label:'CLOSED',color:'#98A29B'};
 if(count>=100)return {level:'atCapacity',label:'AT CAPACITY',color:'#FF6C67'};
 if(count>=76)return {level:'bad',label:'BAD',color:'#FF6C67'};
 if(count>=51)return {level:'busy',label:'BUSY',color:'#F0C468'};
 if(count>=26)return {level:'good',label:'GOOD',color:'#9FD39B'};
 return {level:'great',label:'GREAT',color:'#9FD39B'};
}
// Robust to irregular sampling; recent points have more weight, but one 5-minute jump
// does not define an hour-long trend. Require >=10 minutes of observed span.
function slope(points,now,count){
 const latest=now.getTime();
 const rows=[...(points||[]),{timestamp:now.toISOString(),count}].filter(r=>Number.isFinite(r.count)&&Number.isFinite(Date.parse(r.timestamp)))
  .map(r=>({x:(Date.parse(r.timestamp)-latest)/60000,y:r.count}))
  .filter(r=>r.x>=-45&&r.x<=0).sort((a,b)=>a.x-b.x);
 // Large rapid drops are likely a staff reconciliation, not a reliable departure rate.
 // Estimate movement only from the latest post-reconciliation segment.
 let reset=0;
 for(let i=1;i<rows.length;i++){
  if(rows[i].x-rows[i-1].x<=3 && rows[i-1].y-rows[i].y>=15)reset=i;
 }
 if(reset)rows.splice(0,reset);
 if(rows.length<3||rows[rows.length-1].x-rows[0].x<10)return null;
 const weights=rows.map(r=>Math.exp(r.x/25));
 const total=weights.reduce((a,b)=>a+b,0);
 const mx=rows.reduce((a,r,i)=>a+weights[i]*r.x,0)/total;
 const my=rows.reduce((a,r,i)=>a+weights[i]*r.y,0)/total;
 const numerator=rows.reduce((a,r,i)=>a+weights[i]*(r.x-mx)*(r.y-my),0);
 const denominator=rows.reduce((a,r,i)=>a+weights[i]*(r.x-mx)**2,0);
 return denominator>0?clamp(numerator/denominator*30,-30,30):null;
}

// Actual reported change over the past 30 minutes, not a trend extrapolation.
// Require a reading within five minutes of the target timestamp to avoid
// presenting misleading comparisons across missing collection periods.
function reportedChange30(points,now=new Date()){
 const rows=(points||[]).filter(x=>Number.isFinite(x.count)&&Number.isFinite(Date.parse(x.timestamp)))
  .sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
 if(rows.length<2)return null;
 const latest=rows[rows.length-1],latestTime=Date.parse(latest.timestamp);
 if(Math.abs(now.getTime()-latestTime)>4*60000)return null;
 const target=latestTime-30*60000;
 let prior=null,distance=Infinity;
 for(const p of rows){
  const diff=Math.abs(Date.parse(p.timestamp)-target);
  if(diff<distance){distance=diff;prior=p;}
 }
 if(distance>5*60000)return null;
 return {change:latest.count-prior.count,from:prior.timestamp,to:latest.timestamp};
}

function trend(rate,open){
 if(!open)return {key:'closed',label:'CLOSED HOURS'};
 // A neutral three-state fallback keeps mobile widgets stable while
 // history is sparse or immediately after a possible staff recount.
 if(rate==null)return {key:'steady',label:'STEADY',arrow:'→'};
 if(rate>=4)return {key:'rising',label:'FILLING UP',arrow:'↑'};
 if(rate<=-4)return {key:'falling',label:'DECREASING',arrow:'↓'};
 return {key:'steady',label:'STEADY',arrow:'→'};
}
function typical(weekly,p){
 const a=weekly[`${p.dow}-${p.hour}`];
 if(!a||!a.n)return {average:null,samples:0,days:0};
 // Recent records use an equal-weight mean of day-level hourly means. Older
 // records are migrated approximately from the old sample-weighted average.
 if(Number.isFinite(a.completedMeanSum)&&Number.isFinite(a.completedDays)&&a.activeN>0){
  const n=a.completedDays+1;
  return {average:Math.round((a.completedMeanSum+a.activeSum/a.activeN)/n),samples:a.n,days:n};
 }
 return {average:Math.round(a.sum/a.n),samples:a.n,days:a.days||0};
}
function updateBucket(prev,p,count){
 prev=prev||{sum:0,n:0,days:0,lastDay:''};
 let completedDays,completedMeanSum,activeSum,activeN;
 if(Number.isFinite(prev.completedMeanSum)&&Number.isFinite(prev.completedDays)){
  completedDays=prev.completedDays;completedMeanSum=prev.completedMeanSum;
  activeSum=prev.activeSum||0;activeN=prev.activeN||0;
  if(prev.lastDay&&prev.lastDay!==p.day&&activeN){
   completedMeanSum+=activeSum/activeN;completedDays++;activeSum=0;activeN=0;
  }
 }else{
  const priorDays=Math.max(0,(prev.days||0)-(prev.lastDay===p.day?1:0));
  completedDays=priorDays;
  completedMeanSum=priorDays&&prev.n?priorDays*(prev.sum/prev.n):0;
  activeSum=0;activeN=0;
 }
 activeSum+=count;activeN++;
 return {sum:prev.sum+count,n:prev.n+1,days:completedDays+1,lastDay:p.day,
  completedDays,completedMeanSum,activeSum,activeN};
}
function addWeekly(weekly,p,count){
 const key=`${p.dow}-${p.hour}`;
 const quarterKey=`${p.dow}-${p.hour*4+Math.floor(p.minute/15)}`;
 const quarter=weekly.quarter||{};
 return {...weekly,[key]:updateBucket(weekly[key],p,count),
  quarter:{...quarter,[quarterKey]:updateBucket(quarter[quarterKey],p,count)}};
}
function quarterTypical(weekly,p){
 const slot=p.hour*4+Math.floor((p.minute||0)/15);
 return typical(weekly.quarter||{},{dow:p.dow,hour:slot});
}

function heatmap(weekly){
 const cells=[];
 for(let d=0;d<7;d++)for(let h=7;h<23;h++){
  const t=typical(weekly,{dow:d,hour:h});
  cells.push({day:DAYS[d],dayIndex:d,hour:h,average:t.average,samples:t.samples,days:t.days});
 }
 return cells;
}
function best(weekly,now=new Date(),liveForecast=null,forecastTimestamp=null){
 const date=now instanceof Date?now:new Date(now),p=parts(date),minNow=p.hour*60+p.minute;
 const options=[];
 // Prefer today's live forecast over historical hourly averages when available.
 // Ignore the closing hour: the forced closing taper is not a useful climbing slot.
 if(liveForecast&&Array.isArray(liveForecast.points)&&Number.isFinite(Date.parse(forecastTimestamp))){
  const hourGroups=new Map(),closing=HOURS[p.dow][1];
  for(const point of liveForecast.points){
   if(!Number.isFinite(point.count)||!Number.isFinite(point.minutes)||point.minutes===0)continue;
   const at=parts(new Date(Date.parse(forecastTimestamp)+point.minutes*60000));
   if(at.day!==p.day||at.hour<Math.ceil(minNow/60)||at.hour>=closing-1)continue;
   const group=hourGroups.get(at.hour)||[];
   group.push(point.count);hourGroups.set(at.hour,group);
  }
  for(const [hour,values] of hourGroups){
   if(values.length<2)continue;
   const historical=typical(weekly,{dow:p.dow,hour});
   options.push({day:DAYS[p.dow],dayIndex:p.dow,hour,
    average:Math.round(values.reduce((a,b)=>a+b,0)/values.length),
    historicalAverage:historical.average,samples:values.length,days:historical.days,
    source:'forecast',provisional:true,reliability:'EARLY'});
  }
  if(options.length)return options.sort((a,b)=>a.average-b.average||a.hour-b.hour).slice(0,4);
 }
 // Only suggest future hours TODAY (not closed hours, not past slots).
 for(let h=Math.max(HOURS[p.dow][0],Math.ceil(minNow/60));h<HOURS[p.dow][1];h++){
  const t=typical(weekly,{dow:p.dow,hour:h});
  // Avoid declaring an hour 'quiet' based on only a handful of minutes.
  if(t.average===null||t.samples<10)continue;
  options.push({day:DAYS[p.dow],dayIndex:p.dow,hour:h,average:t.average,samples:t.samples,days:t.days,
   source:'history',reliability:t.days>=3?'DEVELOPING':'LIMITED',provisional:t.days<3});
 }
 return options.sort((a,b)=>a.average-b.average||a.hour-b.hour).slice(0,4);
}
// Learn the daily curve from matching weekdays when available, or from
// other observed days when the matching weekday history is still sparse.
function profileAt(weekly,p){
 const q=quarterTypical(weekly,p);
 if(q.average!==null&&q.days>=2)
  return {average:q.average,days:q.days,weight:Math.min(.78,.36+.06*q.days)};
 const qSlot=p.hour*4+Math.floor((p.minute||0)/15);
 let sum=0,days=0;
 for(let d=0;d<7;d++){
  const t=typical(weekly.quarter||{},{dow:d,hour:qSlot});
  if(t.average===null)continue;
  const n=Math.max(1,t.days);sum+=t.average*n;days+=n;
 }
 if(days>=1)return {average:sum/days,days,weight:Math.min(.52,.24+.05*days)};
 // Legacy hourly fallback while new quarter-hour statistics accumulate.
 const own=typical(weekly,p);
 if(own.average!==null&&own.days>=2)return {average:own.average,days:own.days,weight:Math.min(.6,.3+.04*own.days)};
 sum=0;days=0;
 for(let d=0;d<7;d++){
  const v=typical(weekly,{dow:d,hour:p.hour});
  if(v.average===null)continue;
  const n=Math.max(1,v.days);sum+=v.average*n;days+=n;
 }
 return days?{average:sum/days,days,weight:Math.min(.42,.2+.04*days)}:{average:null,days:0,weight:0};
}
function forecast(count,rate,weekly,now,correction=null){
 const p=parts(now),minutes=remainingMinutes(p);
 if(minutes<=0||!Number.isFinite(count))return null;
 const start=profileAt(weekly,p),hasBaseline=start.average!==null;
 const predicted=[];
 const steps=[0];for(let m=15;m<minutes;m+=15)steps.push(m);
 if(steps[steps.length-1]!==minutes)steps.push(minutes);
 // Source values above the policy reference of 100 are valid; do not truncate them.
 const safeStart=Math.max(0,Number.isFinite(correction?.estimatedNow)?correction.estimatedNow:count);
 for(const m of steps){
  const at=parts(new Date(now.getTime()+m*60000)),target=profileAt(weekly,at);
  // Trend impact saturates instead of being extrapolated linearly to closing.
  // Backtest on the initial three recorded dates: trend helps 15–30 minute
  // horizons but loses to persistence at 60 minutes. Shrink its effect to zero
  // by the one-hour horizon until enough days exist for a stronger model.
  const trendWeight=clamp(0.8-m/75,0,0.6);
  const drift=rate==null?0:trendWeight*rate/30*35*(1-Math.exp(-m/35));
  // Grow historical influence gradually, only when the comparable hour has
  // >=2 different days. With sparse history, default to persistence+smoothed trend.
  const historicalDelta=hasBaseline&&target.average!==null?clamp(target.average-start.average,-80,80):0;
  const evidence=hasBaseline&&target.average!==null?Math.min(start.weight,target.weight):0;
  const influence=1-Math.exp(-m/65);
  // Force the projected occupancy to zero only at close. The last 75 minutes
  // taper toward closing; the first point always stays equal to the observation.
  const tillClose=minutes-m;
  const closure=m===0?1:clamp(tillClose/Math.min(minutes,75),0,1);
  // The live projection is anchored to estimated current occupancy, never a fabricated exact headcount.
  const departureRate=Number.isFinite(correction?.departureRate)?correction.departureRate:0;
  const departures=departureRate>0?Math.min(m,60)*departureRate*0.45:0;
  const estimate=Math.max(0,Math.round((safeStart+(1-evidence)*drift+evidence*historicalDelta*influence-departures)*closure));
  // These are illustrative scenarios, not calibrated confidence intervals.
  // Illustrative prediction range, not yet a statistically calibrated interval.
  // It widens farther ahead and narrows only for the scheduled closing taper.
  const spread=m===0?0:Math.min(60,(hasBaseline?9:14)+12*Math.sqrt(m/60))*closure;
  predicted.push({minutes:m,count:estimate,low:Math.max(0,Math.round(estimate-spread)),high:Math.max(estimate,Math.round(estimate+spread))});
 }
 const hour=predicted.find(r=>r.minutes===60)||predicted.find(r=>r.minutes>=60)||predicted[predicted.length-1];
 return {current:count,estimatedStart:safeStart,projected:hour.count,change:hour.count-safeStart,closing:predicted[predicted.length-1].count,
  points:predicted,horizonMinutes:minutes,confidence:hasBaseline?'DEVELOPING':'EARLY',matchingDays:start.days,
  method:hasBaseline?'Live count + historical daily pattern':'Live count + recent movement',intervalType:'illustrative',
  disclaimer:'The shaded band shows a plausible range, not a calibrated confidence level. Zero at closing is assumed.'};
}
function summarize(status,day,week,now=new Date()){
 const recent=(day&&day.points)||[],p=parts(now);
 const current=status||{open:false,count:null,label:'CLOSED',level:'closed',color:'#98A29B',updated:null};
 const currentTypical=typical(week||{},p);
 const dataPoints=week&&week.total?week.total:0,count=current.count;
 return {...current,ok:true,max:MAX,percent:count==null?null:Math.round(count/MAX*100),
  todayHistory:recent,history:recent.slice(-90),reportedChange30:reportedChange30(recent,now),heatmap:heatmap(week||{}),bestTimes:best(week||{},now),
  typicalNow:currentTypical.average,typicalSamples:currentTypical.samples,typicalDays:currentTypical.days,
  dataPoints,collectionStarted:week&&week.started||null,
  note:dataPoints<30?'Baseline building: early patterns are provisional.':dataPoints<500?'Early patterns emerging.':'Historical patterns are developing.',
  insight:current.open?`${count} people last counted. `+(currentTypical.average===null?'Same-hour history is still building.':`Typical for this weekday and hour: ${currentTypical.average} (${currentTypical.days} days).`):'Outside configured gym hours. CLOSED is based on the schedule.'};
}
module.exports={TZ,MAX,HOURS,parts,openNow,remainingMinutes,crowd,slope,reportedChange30,trend,typical,forecast,addWeekly,heatmap,best,summarize};
