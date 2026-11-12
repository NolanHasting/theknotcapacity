'use strict';
// A decrement is evidence of a possible staff headcount; size determines strength.
// Retain the original source reading. Never label these as verified headcounts.
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const L=require('./logic');
function update(state={},previous,reading,now){
 const next={...state},oldTime=Date.parse(previous?.timestamp||'');
 // A gym day starts a new recount sequence; keep learned departure rates but
 // never mistake last night's count for today's staff reconciliation.
 if(next.lastResetAt&&L.parts(new Date(next.lastResetAt)).day!==L.parts(now).day){
  next.lastResetAt=null;next.lastStrongResetAt=null;
 }
 const gap=(now.getTime()-oldTime)/60000;
 const drop=Number.isFinite(previous?.count)&&Number.isFinite(reading)?previous.count-reading:0;
 const isReset=drop>0&&Number.isFinite(gap)&&gap>0&&gap<=3;
 const isStrongReset=isReset&&drop>=5;
 let event=null;
 if(isReset){
  event={timestamp:now.toISOString(),count:reading,previousCount:previous.count,
   drop,classification:drop>=15?'likely_recount':drop>=5?'possible_recount':'small_decrease',
   verified:false};
  // One-count jitter shouldn't determine the learned departure rate.
  if(isStrongReset){
   const last=Date.parse(next.lastStrongResetAt||'');
   const elapsed=(now.getTime()-last)/60000;
   if(Number.isFinite(elapsed)&&elapsed>=20&&elapsed<=240){
    const implied=clamp(drop/elapsed,0,2);
    next.departuresPerMinute=Number.isFinite(state.departuresPerMinute)?
     .8*state.departuresPerMinute+.2*implied:implied;
    next.rateSamples=Math.min(100,(state.rateSamples||0)+1);
   }
   next.lastStrongResetAt=now.toISOString();
  }
  next.lastResetAt=now.toISOString();
  next.lastResetCount=reading;
  next.resetCount=(state.resetCount||0)+1;
 }
 const t=Date.parse(next.lastResetAt||''),age=(now.getTime()-t)/60000;
 const rate=Number.isFinite(next.departuresPerMinute)&&next.rateSamples>=2?next.departuresPerMinute:null;
 // Only adjust within 90 minutes of the most recent count correction.
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
  // Never roll a previous day's source count into a next-day recount.
  if(previous && L.parts(new Date(point.timestamp)).day!==L.parts(new Date(previous.timestamp)).day){
   previous=null;state={...state,lastResetAt:null,lastStrongResetAt:null};
  }
  const result=update(state,previous,point.count,new Date(point.timestamp));
  state=result.state;results.push({...point,...result});previous=point;
 }
 return {results,state};
}
module.exports={update,inspect};