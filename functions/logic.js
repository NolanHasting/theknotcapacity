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
 if(rows.length<3||rows[rows.length-1].x-rows[0].x<10)return null;
 const weights=rows.map(r=>Math.exp(r.x/25));
 const total=weights.reduce((a,b)=>a+b,0);
 const mx=rows.reduce((a,r,i)=>a+weights[i]*r.x,0)/total;
 const my=rows.reduce((a,r,i)=>a+weights[i]*r.y,0)/total;
 const numerator=rows.reduce((a,r,i)=>a+weights[i]*(r.x-mx)*(r.y-my),0);
 const denominator=rows.reduce((a,r,i)=>a+weights[i]*(r.x-mx)**2,0);
 return denominator>0?clamp(numerator/denominator*30,-30,30):null;
}
function trend(rate,open){
 if(!open)return {key:'closed',label:'CLOSED HOURS'};
 if(rate==null)return {key:'learning',label:'LEARNING'};
 if(rate>=4)return {key:'rising',label:'FILLING UP'};
 if(rate<=-4)return {key:'falling',label:'DECREASING'};
 return {key:'steady',label:'STEADY'};
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
function addWeekly(weekly,p,count){
 const key=`${p.dow}-${p.hour}`,prev=weekly[key]||{sum:0,n:0,days:0,lastDay:''};
 let completedDays,completedMeanSum,activeSum,activeN;
 if(Number.isFinite(prev.completedMeanSum)&&Number.isFinite(prev.completedDays)){
  completedDays=prev.completedDays;completedMeanSum=prev.completedMeanSum;
  activeSum=prev.activeSum||0;activeN=prev.activeN||0;
  if(prev.lastDay&&prev.lastDay!==p.day&&activeN){completedMeanSum+=activeSum/activeN;completedDays++;activeSum=0;activeN=0;}
 }else{
  // Migration: approximate legacy prior day means with the previously known
  // average, while tracking all subsequently collected days exactly.
  const priorDays=Math.max(0,(prev.days||0)-(prev.lastDay===p.day?1:0));
  completedDays=priorDays;completedMeanSum=priorDays&&prev.n?priorDays*(prev.sum/prev.n):0;
  activeSum=0;activeN=0;
 }
 activeSum+=count;activeN++;
 return {...weekly,[key]:{sum:prev.sum+count,n:prev.n+1,days:completedDays+1,lastDay:p.day,
  completedDays,completedMeanSum,activeSum,activeN}};
}
function heatmap(weekly){
 const cells=[];
 for(let d=0;d<7;d++)for(let h=7;h<23;h++){
  const t=typical(weekly,{dow:d,hour:h});
  cells.push({day:DAYS[d],dayIndex:d,hour:h,average:t.average,samples:t.samples,days:t.days});
 }
 return cells;
}
function best(weekly,now=new Date()){
 const date=now instanceof Date?now:new Date(now),p=parts(date),minNow=p.hour*60+p.minute;
 const options=[];
 // Only suggest future hours TODAY (not closed hours, not past slots).
 for(let h=Math.max(HOURS[p.dow][0],Math.ceil(minNow/60));h<HOURS[p.dow][1];h++){
  const t=typical(weekly,{dow:p.dow,hour:h});
  // Avoid declaring an hour 'quiet' based on only a handful of minutes.
  if(t.average===null||t.samples<10)continue;
  options.push({day:DAYS[p.dow],dayIndex:p.dow,hour:h,average:t.average,samples:t.samples,days:t.days,
   reliability:t.days>=3?'DEVELOPING':'LIMITED',provisional:t.days<3});
 }
 return options.sort((a,b)=>a.average-b.average||a.hour-b.hour).slice(0,4);
}
function forecast(count,rate,weekly,now){
 const p=parts(now),minutes=remainingMinutes(p);
 if(minutes<=0||!Number.isFinite(count))return null;
 const start=typical(weekly,p),hasBaseline=start.average!==null&&start.days>=2;
 const predicted=[];
 const steps=[0];for(let m=15;m<minutes;m+=15)steps.push(m);
 if(steps[steps.length-1]!==minutes)steps.push(minutes);
 const safeStart=clamp(count,0,MAX);
 for(const m of steps){
  const at=parts(new Date(now.getTime()+m*60000)),target=typical(weekly,at);
  // Trend impact saturates instead of being extrapolated linearly to closing.
  const drift=rate==null?0:rate/30*35*(1-Math.exp(-m/35));
  // Grow historical influence gradually, only when the comparable hour has
  // >=2 different days. With sparse history, default to persistence+smoothed trend.
  const historicalDelta=hasBaseline&&target.days>=2&&target.average!==null?target.average-start.average:0;
  const evidence=hasBaseline&&target.days>=2?Math.min(0.65,0.18+0.12*Math.min(start.days,target.days)):0;
  const influence=1-Math.exp(-m/90);
  const estimate=clamp(Math.round(safeStart+(1-evidence)*drift+evidence*historicalDelta*influence),0,MAX);
  // These are scenario spreads, not calibrated confidence intervals.
  const spread=m===0?0:Math.min(35,8+5*Math.sqrt(m/60)+(hasBaseline?3:8));
  predicted.push({minutes:m,count:estimate,low:clamp(Math.round(estimate-spread),0,MAX),high:clamp(Math.round(estimate+spread),0,MAX)});
 }
 const hour=predicted.find(r=>r.minutes===60)||predicted.find(r=>r.minutes>=60)||predicted[predicted.length-1];
 return {current:count,projected:hour.count,change:hour.count-count,closing:predicted[predicted.length-1].count,
  points:predicted,horizonMinutes:minutes,confidence:hasBaseline?'DEVELOPING':'EARLY',matchingDays:start.days,
  method:hasBaseline?'Smoothed recent movement + growing weekday history':'Smoothed recent movement / persistence',
  disclaimer:'Exploratory forecast; shaded range is an illustrative scenario spread, not a calibrated confidence interval. Predictions are capped at the venue policy limit of 100; observed counts may be higher.'};
}
function summarize(status,day,week,now=new Date()){
 const recent=(day&&day.points)||[],p=parts(now);
 const current=status||{open:false,count:null,label:'CLOSED',level:'closed',color:'#98A29B',updated:null};
 const currentTypical=typical(week||{},p);
 const dataPoints=week&&week.total?week.total:0,count=current.count;
 return {...current,ok:true,max:MAX,percent:count==null?null:Math.round(count/MAX*100),
  todayHistory:recent,history:recent.slice(-90),heatmap:heatmap(week||{}),bestTimes:best(week||{},now),
  typicalNow:currentTypical.average,typicalSamples:currentTypical.samples,typicalDays:currentTypical.days,
  dataPoints,collectionStarted:week&&week.started||null,
  note:dataPoints<30?'Baseline building: early patterns are provisional.':dataPoints<500?'Early patterns emerging.':'Historical patterns are developing.',
  insight:current.open?`${count} people last counted. `+(currentTypical.average===null?'Same-hour history is still building.':`Typical for this weekday and hour: ${currentTypical.average} (${currentTypical.days} days).`):'Outside configured gym hours. CLOSED is based on the schedule.'};
}
module.exports={TZ,MAX,HOURS,parts,openNow,remainingMinutes,crowd,slope,trend,typical,forecast,addWeekly,heatmap,best,summarize};
