'use strict';
const L=require('./logic');
const SNAPSHOT_MINUTES=[15,30,60];
const toMinute=p=>p.hour*60+p.minute;
function compactDay(date,points){
 const bins=new Map(),valid=(points||[]).filter(x=>Number.isFinite(x.count)&&x.count>=0&&Number.isFinite(Date.parse(x.timestamp)));
 for(const p of valid){
  const local=L.parts(new Date(p.timestamp));if(local.day!==date)continue;
  const key=Math.floor(toMinute(local)/15)*15;
  const row=bins.get(key)||{sum:0,n:0};row.sum+=p.count;row.n++;bins.set(key,row);
 }
 return {date,updated:new Date().toISOString(),readings:valid.length,
  bins:Array.from(bins,([minute,v])=>({minute,count:Math.round(v.sum/v.n),samples:v.n}))
   .sort((a,b)=>a.minute-b.minute)};
}
function rebuildQuarter(days){
 const quarter={};
 for(const doc of days||[]){
  const date=doc.date;
  if(typeof date!=='string')continue;
  const day=compactDay(date,doc.points||[]);
  // 17:00 UTC is safely inside the same local date in America/New_York.
  const dow=L.parts(new Date(date+'T17:00:00Z')).dow;
  for(const bin of day.bins){
   if(bin.samples<5)continue;
   const key=dow+'-'+Math.floor(bin.minute/15);
   const value=quarter[key]||{completedMeanSum:0,completedDays:0,days:0,sum:0,n:0};
   value.completedMeanSum+=bin.count;value.completedDays++;
   value.days++;value.sum+=bin.count;value.n++;
   quarter[key]={...value,lastDay:'',activeSum:0,activeN:0};
  }
 }
 return quarter;
}
function snapshot(date,now,count,forecast){
 if(!forecast?.points||!Number.isFinite(count))return null;
 const at={};
 for(const horizon of SNAPSHOT_MINUTES){
  const p=forecast.points.find(x=>x.minutes===horizon);
  if(p&&Number.isFinite(p.count))at[horizon]={predicted:p.count,low:p.low,high:p.high};
 }
 return {date,createdAt:now.toISOString(),sourceCount:count,modelVersion:forecast.modelVersion||'v3-recount-provisional',
  targetMinutes:at};
}
function matchObservation(readings,target,tolerance=5){
 let best=null,distance=Infinity;
 for(const p of readings){
  const t=Date.parse(p.timestamp);
  if(!Number.isFinite(t)||!Number.isFinite(p.count))continue;
  const d=Math.abs(t-target)/60000;
  if(d<distance){best=p;distance=d;}
 }
 return distance<=tolerance?best:null;
}
function scoreDay(readings,snapshots,recountEvents=[],requestedModel=null){
 const rows=[...(readings||[])].sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
 // Additional weak-label analysis includes *all* candidate recounts.
 const allDrops=(recountEvents||[]).filter(e=>e.drop>0);
 const groups={};
 for(const n of SNAPSHOT_MINUTES)groups[n]={sourceErrors:[],baselineErrors:[],recountErrors:[],bands:0,bandHits:0};
 const model=requestedModel||snapshots?.at(-1)?.modelVersion||'v3-recount-provisional';
 for(const s of snapshots||[]){
  if((s.modelVersion||'v3-recount-provisional')!==model)continue;
  const start=Date.parse(s.createdAt);
  if(!Number.isFinite(start))continue;
  for(const n of SNAPSHOT_MINUTES){
   const f=s.targetMinutes?.[n];if(!f||!Number.isFinite(f.predicted))continue;
   const target=start+n*60000;
   const observed=matchObservation(rows,target);
   if(!observed)continue;
   const g=groups[n];g.sourceErrors.push(Math.abs(f.predicted-observed.count));
   g.baselineErrors.push(Math.abs(s.sourceCount-observed.count));
   if(Number.isFinite(f.low)&&Number.isFinite(f.high)){
    g.bands++;if(observed.count>=f.low&&observed.count<=f.high)g.bandHits++;
   }
   const weak=matchObservation(allDrops,target,10);
   if(weak&&Number.isFinite(weak.count))g.recountErrors.push(Math.abs(f.predicted-weak.count));
  }
 }
 const round=n=>Math.round(n*10)/10;
 const avg=a=>a.length?round(a.reduce((x,y)=>x+y,0)/a.length):null;
 return {model,horizons:Object.fromEntries(SNAPSHOT_MINUTES.map(n=>{
  const g=groups[n];return [n,{samples:g.sourceErrors.length,sourceMAE:avg(g.sourceErrors),
   persistenceMAE:avg(g.baselineErrors),candidateRecountSamples:g.recountErrors.length,
   candidateRecountMAE:avg(g.recountErrors),illustrativeBandCoverage:g.bands?round(100*g.bandHits/g.bands):null}];
 })),explanation:'Source error measures reported counts, not verified occupancy; candidate recount errors are weak labels.'};
}
module.exports={compactDay,rebuildQuarter,snapshot,scoreDay,matchObservation,SNAPSHOT_MINUTES};
