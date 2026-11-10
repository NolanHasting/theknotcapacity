'use strict';
const TZ = 'America/New_York';
const MAX = 100;
const HOURS = {0:[7,22],1:[7,23],2:[7,23],3:[7,23],4:[7,23],5:[7,23],6:[7,22]};
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function parts(date){
 const chunks=new Intl.DateTimeFormat('en-US',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',weekday:'short'}).formatToParts(date);
 const o=Object.fromEntries(chunks.map(c=>[c.type,c.value]));
 return {day:`${o.year}-${o.month}-${o.day}`,dow:DAYS.indexOf(o.weekday),hour:+o.hour,minute:+o.minute};
}
function openNow(p){const range=HOURS[p.dow];return !!range && p.hour>=range[0] && p.hour<range[1];}
function remainingMinutes(p){return Math.max(0,HOURS[p.dow][1]*60-(p.hour*60+p.minute));}
function crowd(count,open){
 if(!open)return {level:'closed',label:'CLOSED',color:'#98A29B'};
 if(count>=100)return {level:'atCapacity',label:'AT CAPACITY',color:'#FF6C67'};
 if(count>=76)return {level:'bad',label:'BAD',color:'#FF6C67'};
 if(count>=51)return {level:'busy',label:'BUSY',color:'#F0C468'};
 if(count>=26)return {level:'good',label:'GOOD',color:'#9FD39B'};
 return {level:'great',label:'GREAT',color:'#9FD39B'};
}
function slope(points,now,count){
 const p=points.filter(r=>{const age=(now-Date.parse(r.timestamp))/60000;return age>=15&&age<=45;});
 if(!p.length)return null;
 const prior=p[p.length-1],age=(now-Date.parse(prior.timestamp))/60000;
 return age>0?(count-prior.count)*30/age:null;
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
 return a&&a.n>0?{average:Math.round(a.sum/a.n),samples:a.n,days:a.days||0}:{average:null,samples:0,days:0};
}
function forecast(count,rate,weekly,now){
 const p=parts(now),minutes=Math.min(60,remainingMinutes(p));
 if(minutes<=0)return null;
 const at=parts(new Date(now.getTime()+minutes*60000));
 const here=typical(weekly,p),later=typical(weekly,at);
 const delta=here.average!==null&&later.average!==null?later.average-here.average:null;
 if(rate===null&&delta===null)return null;
 const days=Math.min(here.days,later.days),weight=days>=3?0.6:days>=1?0.8:1;
 const momentum=rate===null?0:Math.max(-30,Math.min(30,rate*2*minutes/60));
 const prediction=Math.max(0,Math.min(130,Math.round(count+weight*momentum+(1-weight)*(delta||0))));
 const band=days>=3?10:15;
 const sampleMinutes=[0,15,30,45,60].filter(m=>m<=minutes);
 if(sampleMinutes[sampleMinutes.length-1]!==minutes)sampleMinutes.push(minutes);
 const pts=sampleMinutes.map(m=>{
  const f=m/minutes,n=Math.round(count+(prediction-count)*f),e=band*f;
  return {minutes:m,count:n,low:Math.max(0,Math.round(n-e)),high:Math.round(n+e)};
 });
 return {current:count,projected:prediction,change:prediction-count,points:pts,
  horizonMinutes:minutes,confidence:days>=3?'DEVELOPING':'EARLY',matchingDays:days,
  method:days>=1?'Recent movement + historical weekday patterns':'Recent movement only',
  disclaimer:'Exploratory estimate. Shaded range is illustrative, not a statistically calibrated confidence interval.'};
}
function addWeekly(weekly,p,count){
 const key=`${p.dow}-${p.hour}`;
 const previous=weekly[key]||{sum:0,n:0,days:0,lastDay:''};
 return {...weekly,[key]:{sum:previous.sum+count,n:previous.n+1,
   days:(previous.days||0)+(previous.lastDay===p.day?0:1),lastDay:p.day}};
}
function heatmap(weekly){
 const cells=[];
 for(let d=0;d<7;d++)for(let h=7;h<23;h++){
  const k=`${d}-${h}`,v=weekly[k];
  cells.push({day:DAYS[d],dayIndex:d,hour:h,average:v&&v.n?Math.round(v.sum/v.n):null,samples:v?v.n:0});
 }
 return cells;
}
function best(weekly){return heatmap(weekly).filter(x=>x.average!==null&&x.samples>=2)
 .sort((a,b)=>a.average-b.average).slice(0,8);}
function summarize(status,day,week){
 const recent=(day&&day.points)||[]; const p=parts(new Date());
 const current=status||{open:false,count:null,label:'CLOSED',level:'closed',color:'#98A29B',updated:null};
 const currentTypical=typical(week||{},p),futureTypical=typical(week||{},parts(new Date(Date.now()+3600000)));
 const dataPoints=week&&week.total?week.total:0;
 const count=current.count;
 return {...current,ok:true,max:MAX,percent:count==null?null:Math.round(count/MAX*100),
  todayHistory:recent,history:recent.slice(-90),heatmap:heatmap(week||{}),bestTimes:best(week||{}),
  typicalNow:currentTypical.average,typicalSamples:currentTypical.samples,
  typicalNextHour:futureTypical.average,typicalNextSamples:futureTypical.samples,
  dataPoints,collectionStarted:week&&week.started||null,
  note:dataPoints<30?'Baseline building: early patterns are provisional.':dataPoints<500?'Early patterns emerging.':'Historical patterns are developing.',
  insight:current.open?`${count} people currently counted. `+(currentTypical.average===null?'Same-hour history is still building.':`Typical for this weekday and hour: ${currentTypical.average}.`):'Outside configured gym hours. CLOSED is based on the schedule.'};
}
module.exports={TZ,MAX,HOURS,parts,openNow,remainingMinutes,crowd,slope,trend,typical,forecast,addWeekly,heatmap,best,summarize};
