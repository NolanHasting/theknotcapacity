'use strict';
const L=require('./logic');
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const MAX_SAMPLE_GAP=10; // minutes; source collection is sometimes irregular
const MAX_PAUSE=6; // minutes between consecutive downward steps in one recount

// One marked recount per downward episode. Flat readings can occur between
// decreases; an increase, an extended pause, or a collection gap starts a new one.
function groupDrops(points){
 const ordered=(points||[]).filter(p=>Number.isFinite(p.count)&&Number.isFinite(Date.parse(p.timestamp)))
  .slice().sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
 const events=[];let previous=null,active=null;
 for(const point of ordered){
  const time=Date.parse(point.timestamp);
  const gap=previous?(time-Date.parse(previous.timestamp))/60000:Infinity;
  const day= L.parts(new Date(point.timestamp)).day;
  const sameDay=previous&&L.parts(new Date(previous.timestamp)).day===day;
  const valid=gap>0&&gap<=MAX_SAMPLE_GAP&&sameDay;
  const declining=valid&&point.count<previous.count;
  if(declining){
   const continuing=active&&(time-Date.parse(active.timestamp))/60000<=MAX_PAUSE&&previous.count<=active.count;
   if(continuing){
    active.timestamp=point.timestamp;active.count=point.count;
    active.drop=active.previousCount-point.count;
    active.steps++;
   }else{
    active={startTimestamp:previous.timestamp,timestamp:point.timestamp,
     previousCount:previous.count,count:point.count,drop:previous.count-point.count,
     steps:1,classification:'staff_recount',verified:false};
    events.push(active);
   }
  }else if(!valid||point.count>previous.count||(active&&time-Date.parse(active.timestamp)>MAX_PAUSE*60000)){
   active=null;
  }
  previous=point;
 }
 return events;
}
function update(state={},previous,reading,now){
 const next={...state},iso=now.toISOString();
 const oldTime=Date.parse(previous?.timestamp||'');
 const gap=(now.getTime()-oldTime)/60000;
 const sameDay=previous&&L.parts(new Date(previous.timestamp)).day===L.parts(now).day;
 if(next.lastResetAt&&L.parts(new Date(next.lastResetAt)).day!==L.parts(now).day){
  next.lastResetAt=null;next.lastStrongResetAt=null;next.activeEpisode=null;
 }
 const drop=Number.isFinite(previous?.count)&&Number.isFinite(reading)?previous.count-reading:0;
 const isReset=drop>0&&gap>0&&gap<=MAX_SAMPLE_GAP&&sameDay;
 let event=null,isStrongReset=false;
 if(isReset){
  const prior=next.activeEpisode;
  const continuing=prior&&now.getTime()-Date.parse(prior.timestamp)<=MAX_PAUSE*60000&&
   previous.count<=prior.count;
  event=continuing?{
   ...prior,timestamp:iso,count:reading,
   drop:prior.previousCount-reading,steps:(prior.steps||1)+1
  }:{
   startTimestamp:previous.timestamp,timestamp:iso,
   previousCount:previous.count,count:reading,drop,steps:1,
   classification:'staff_recount',verified:false
  };
  next.activeEpisode=event;
  isStrongReset=event.drop>=5;
  // Learn no more than once per new episode; each reported decrease is retained
  // as an inferred headcount, but only larger episodes update departure rates.
  if(!continuing&&isStrongReset){
   const last=Date.parse(next.lastStrongResetAt||'');
   const elapsed=(now.getTime()-last)/60000;
   if(Number.isFinite(elapsed)&&elapsed>=20&&elapsed<=240){
    const implied=clamp(event.drop/elapsed,0,2);
    next.departuresPerMinute=Number.isFinite(next.departuresPerMinute)?
     .8*next.departuresPerMinute+.2*implied:implied;
    next.rateSamples=Math.min(100,(next.rateSamples||0)+1);
   }
   next.lastStrongResetAt=iso;
  }
  next.lastResetAt=iso;next.lastResetCount=reading;
  if(!continuing)next.resetCount=(state.resetCount||0)+1;
 }else{
  const prior=next.activeEpisode;
  if(!sameDay||!(gap>0&&gap<=MAX_SAMPLE_GAP)||Number.isFinite(previous?.count)&&reading>previous.count||
   prior&&now.getTime()-Date.parse(prior.timestamp)>MAX_PAUSE*60000){
   next.activeEpisode=null;
  }
 }
 const age=(now.getTime()-Date.parse(next.lastResetAt||''))/60000;
 const rate=Number.isFinite(next.departuresPerMinute)&&next.rateSamples>=2?next.departuresPerMinute:null;
 const estimatedNow=rate!==null&&Number.isFinite(age)&&age>=0&&age<=90?
  Math.max(0,Math.round(reading-rate*age)):null;
 return {state:next,isReset,isStrongReset,event,estimatedNow,
  estimateAgeMinutes:Number.isFinite(age)&&age>=0?Math.round(age):null,
  departureRate:rate,estimateBasis:estimatedNow===null?'insufficient_recounts':'recount_adjusted'};
}
function inspect(points){
 const ordered=(points||[]).filter(p=>Number.isFinite(p.count)&&Number.isFinite(Date.parse(p.timestamp)))
  .slice().sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
 let state={},previous=null;const results=[];
 for(const point of ordered){
  if(previous&&L.parts(new Date(point.timestamp)).day!==L.parts(new Date(previous.timestamp)).day){
   previous=null;state={...state,lastResetAt:null,lastStrongResetAt:null,activeEpisode:null};
  }
  const result=update(state,previous,point.count,new Date(point.timestamp));
  state=result.state;results.push({...point,...result});previous=point;
 }
 return {results,state,events:groupDrops(ordered)};
}
module.exports={update,inspect,groupDrops,MAX_SAMPLE_GAP,MAX_PAUSE};
