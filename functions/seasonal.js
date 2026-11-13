'use strict';
// A historical model learned from observed *ending* staff recount counts.
// Recounts are the strongest available occupancy labels. Increases in the
// public counter are never treated as independent verified headcounts.
const L=require('./logic'),R=require('./recounts');
const MINUTES=60000,DAY=86400000,SLOT=15,HALF_LIFE_DAYS=28;
const hours=L.HOURS;
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const utcDay=date=>Date.parse(date+'T12:00:00Z')/DAY;
const normalKernel=(distance,bw)=>Math.exp(-.5*(distance/bw)**2);
function quantile(input,q){
 const a=(input||[]).filter(Number.isFinite).slice().sort((x,y)=>x-y);
 if(!a.length)return null;
 const i=clamp(Math.ceil(q*(a.length+1))-1,0,a.length-1);
 return a[i];
}
function anchorPoints(doc){
 if(!doc?.date||!Array.isArray(doc.points))return [];
 return R.groupDrops(doc.points).filter(e=>Number.isFinite(e.count)&&
  L.parts(new Date(e.timestamp)).day===doc.date)
 .map(e=>{const p=L.parts(new Date(e.timestamp));return {date:doc.date,weekday:p.dow,
  minute:p.hour*60+p.minute,count:e.count,timestamp:e.timestamp};});
}
function train(docs,now=new Date()){
 const asOf=L.parts(now).day,rows=(docs||[]).filter(x=>x?.date&&x.date<asOf&&
  utcDay(x.date)>=utcDay(asOf)-60);
 const anchors=rows.flatMap(anchorPoints);
 const byDay=new Map();
 for(const a of anchors){const group=byDay.get(a.date)||[];group.push(a);byDay.set(a.date,group);}
 const profiles={};
 for(let dow=0;dow<7;dow++){
  profiles[dow]=[];
  for(let minute=hours[dow][0]*60;minute<hours[dow][1]*60;minute+=SLOT){
   let sum=0,weightSum=0,used=0,squares=0;
   for(const [date,unsorted] of byDay){
    const items=unsorted.slice().sort((a,b)=>a.minute-b.minute);
    const same=items[0].weekday===dow;
    let left=null,right=null;
    for(const a of items){if(a.minute<=minute)left=a;if(a.minute>=minute){right=a;break;}}
    let daily=null,closest=Infinity;
    if(left&&right&&right.minute-left.minute<=300){
     const gap=right.minute-left.minute;
     const mix=gap?((minute-left.minute)/gap):0;
     daily=left.count*(1-mix)+right.count*mix;
     closest=Math.min(minute-left.minute,right.minute-minute);
    }else{
     const nearest=items.reduce((best,a)=>!best||Math.abs(a.minute-minute)<Math.abs(best.minute-minute)?a:best,null);
     if(nearest){closest=Math.abs(minute-nearest.minute);if(closest<=90)daily=nearest.count;}
    }
    if(daily===null)continue;
    // Days contribute once per slot; don't overweight high-frequency scans.
    const age=utcDay(asOf)-utcDay(date);
    const weight=(same?2.4:.65)*Math.pow(.5,age/HALF_LIFE_DAYS)*
      Math.max(.2,normalKernel(closest,100));
    sum+=weight*daily;weightSum+=weight;used++;
   }
   const value=weightSum?sum/weightSum:null;
   if(value!==null)for(const [date,items] of byDay){
    let nearest=null,closest=Infinity;
    for(const a of items){const distance=Math.abs(a.minute-minute);if(distance<closest){closest=distance;nearest=a;}}
    if(nearest&&closest<=60)squares+=(nearest.count-value)**2;
   }
   profiles[dow].push({minute,count:value===null?null:Math.round(Math.max(0,value)),
    days:used,spread:used>=2?Math.sqrt(squares/used):null});
  }
 }
 // Report training support explicitly; never imply a trained weekday curve
 // when only one day happened to have a staff recount nearby.
 return {version:'recount-seasonal-v4',trainedAt:now.toISOString(),
  days:byDay.size,recounts:anchors.length,profiles};
}
function profile(model,p){
 const items=(model?.profiles||{})[p.dow];
 if(!Array.isArray(items))return null;
 const target=p.hour*60+p.minute;
 let left=null,right=null;
 for(const slot of items){
  if(slot.count===null)continue;
  if(slot.minute<=target)left=slot;
  if(slot.minute>=target){right=slot;break;}
 }
 if(!left||!right){
  const candidate=left||right;
  return candidate&&Math.abs(candidate.minute-target)<=15?candidate:null;
 }
 if(left.minute===right.minute)return left;
 const weight=(target-left.minute)/(right.minute-left.minute);
 return {count:left.count*(1-weight)+right.count*weight,
  days:Math.min(left.days,right.days),spread:Math.max(left.spread||0,right.spread||0)};
}
function band(calibration,horizon,hasHistory){
 if(!horizon)return 0;
 const entries=(calibration?.horizons)||{};
 const steps=[15,30,60,120,240,480];
 let before=null,after=null;
 for(const minute of steps){
  const item=entries[minute];
  if(!item||item.days<4||item.samples<25||!Number.isFinite(item.p80))continue;
  if(minute<=horizon)before={minute,value:item.p80};
  if(minute>=horizon){after={minute,value:item.p80};break;}
 }
 if(before&&after&&before.minute!==after.minute)
  return Math.max(0,before.value+(after.value-before.value)*(horizon-before.minute)/(after.minute-before.minute));
 if(before)return Math.max(before.value,before.value*Math.sqrt(horizon/before.minute));
 if(after)return after.value*Math.sqrt(horizon/after.minute);
 // Provisional visually honest heuristic until independent recount outcomes
 // are available for calibration. Never label this as 80% coverage.
 return (hasHistory?12:18)*Math.sqrt(horizon/60);
}
function project(count,trend,seasonal,now,calibration=null){
 const p=L.parts(now),remaining=L.remainingMinutes(p);
 if(remaining<=0||!Number.isFinite(count))return null;
 const first=profile(seasonal,p),support=first?.days||0;
 const steps=[0];for(let m=15;m<remaining;m+=15)steps.push(m);
 if(steps[steps.length-1]!==remaining)steps.push(remaining);
 const predictions=[];
 for(const m of steps){
  const at=L.parts(new Date(now.getTime()+m*MINUTES)),target=profile(seasonal,at);
  const evidence=first&&target?Math.min(first.days,target.days):0;
  // Short-term movements decay, while the *shape* learned from recounts
  // becomes dominant after roughly an hour.
  const weight=evidence>=5?.85:evidence>=3?.75:evidence>=2?.60:evidence>=1?.42:0;
  const blend=weight*(1-Math.exp(-m/55));
  const seasonalChange=first&&target?clamp(target.count-first.count,-110,110):0;
  const movement=trend===null?0:(trend/30)*Math.min(m,35)*.45*Math.exp(-m/45);
  const tillClose=remaining-m;
  // One closing-zero operational assumption; do not invent a steep 75-minute
  // decline if the historical recount shape already captures evening slowing.
  const closure=m===0?1:clamp(tillClose/Math.min(remaining,45),0,1);
  const countEstimate=Math.max(0,Math.round((count+movement*(1-blend)+blend*seasonalChange)*closure));
  const width=m===0?0:band(calibration,m,evidence>0)*closure;
  predictions.push({minutes:m,count:countEstimate,
   low:Math.max(0,Math.round(countEstimate-width)),high:Math.round(countEstimate+width)});
 }
 const hour=predictions.find(x=>x.minutes===60)||predictions.find(x=>x.minutes>60)||predictions.at(-1);
 const calibrated=[15,30,60].every(n=>calibration?.horizons?.[n]?.days>=4&&calibration?.horizons?.[n]?.samples>=25);
 return {current:count,estimatedStart:count,projected:hour.count,change:hour.count-count,
  closing:predictions.at(-1).count,points:predictions,horizonMinutes:remaining,
  confidence:support>=4?'DEVELOPING':'EARLY',matchingDays:support,
  method:'Live reported count + staff-recount historical profile',
  intervalType:calibrated?'recount-calibrated-80':'illustrative',
  disclaimer:calibrated?'Shaded band uses historical recount forecast errors. Coverage may vary with time of day.':
    'Shaded band is provisional until more independent recounts are available. Closing zero is assumed.'};
}
function backtest(docs,now=new Date()){
 const rows=(docs||[]).filter(d=>Array.isArray(d?.points)).sort((a,b)=>a.date.localeCompare(b.date));
 const horizons=[15,30,60,120,240,480],results=Object.fromEntries(horizons.map(h=>[h,[]]));
 for(let i=1;i<rows.length;i++){
  const day=rows[i],prior=rows.slice(Math.max(0,i-60),i),anchors=anchorPoints(day);
  if(anchors.length<2)continue;
  const previousModel=train(prior,new Date(day.date+'T12:00:00Z'));
  for(let j=0;j<anchors.length-1;j++){
   const first=anchors[j],origin=new Date(first.timestamp);
   const projection=project(first.count,null,previousModel,origin);
   if(!projection)continue;
   for(const h of horizons){
    const future=anchors.slice(j+1).reduce((best,a)=>{
     const diff=(Date.parse(a.timestamp)-origin.getTime())/MINUTES;
     return Math.abs(diff-h)<=Math.min(15,h*.25)&&(!best||Math.abs(diff-h)<best.distance)?
      {count:a.count,distance:Math.abs(diff-h)}:best;
    },null);
    if(!future)continue;
    const f=projection.points.reduce((best,p)=>Math.abs(p.minutes-h)<Math.abs(best.minutes-h)?p:best,projection.points[0]);
    results[h].push({error:Math.abs(f.count-future.count),day:day.date});
   }
  }
 }
 return {version:'recount-seasonal-v4',updatedAt:now.toISOString(),horizons:Object.fromEntries(horizons.map(h=>{
  const r=results[h],unique=new Set(r.map(x=>x.day)).size;
  return [h,{samples:r.length,days:unique,p80:r.length>=25&&unique>=4?quantile(r.map(x=>x.error),.8):null}];
 }))};
}
function futureDay(date,seasonal){
 const local=L.parts(new Date(date+'T17:00:00Z')),dow=local.dow;
 const [open,close]=L.HOURS[dow],points=[];
 for(let m=open*60;m<close*60;m+=SLOT){
  const fit=profile(seasonal,{dow,hour:Math.floor(m/60),minute:m%60});
  const untilClose=close*60-m;
  const closing=Math.min(1,untilClose/45);
  const count=fit&&fit.days?Math.max(0,Math.round(fit.count*closing)):null;
  // These are seasonal profile ranges, not certified prediction intervals.
  // Variation across different recount days matters more than polling frequency.
  const halfWidth=count===null?null:Math.max(12,fit.spread||0,Math.sqrt(m-open*60)*2)*closing;
  points.push({minute:m,count,low:count===null?null:Math.max(0,Math.round(count-halfWidth)),
   high:count===null?null:Math.round(count+halfWidth),days:fit?.days||0});
 }
 points.push({minute:close*60,count:0,low:0,high:0,days:0,assumedClose:true});
 const known=points.filter(p=>p.count!==null&&!p.assumedClose);
 return {mode:'future',date,points:known.length?points:[],basis:'past staff recounts',
  summary:{referenceDays:seasonal.days||0,matchingWeekdays:0,coveredSlots:known.length,
   totalSlots:(close-open)*4,possibleRecounts:seasonal.recounts||0,recountAdjusted:true},
  note:known.length?'Historical staff recounts anchor these estimates. Shaded range is provisional. Zero at close is assumed.':
  'Not enough staff recount history to estimate this day.'};
}
module.exports={anchorPoints,train,profile,band,project,backtest,futureDay,quantile};
