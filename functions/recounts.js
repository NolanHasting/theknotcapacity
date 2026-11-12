'use strict';
// The source may accumulate check-ins until staff reconcile the count.
// A sharp drop is a candidate recount, not definitive proof of a headcount.
const RESET_DROP=15,RESET_WINDOW_MIN=3;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function update(state={},previous,reading,now){
 const result={...state};
 const prevTime=Date.parse(previous?.timestamp||'');
 const gap=(now.getTime()-prevTime)/60000;
 const isReset=Number.isFinite(previous?.count)&&Number.isFinite(reading)&&
  Number.isFinite(gap)&&gap>0&&gap<=RESET_WINDOW_MIN&&previous.count-reading>=RESET_DROP;
 if(isReset){
  const last=Date.parse(state.lastResetAt||'');
  const minutes=(now.getTime()-last)/60000;
  // Compare successive recounts. The drop is a proxy for missing departures,
  // but only when two candidates bracket a plausible 20–240 minute interval.
  if(Number.isFinite(minutes)&&minutes>=20&&minutes<=240){
   const implied=clamp((previous.count-reading)/minutes,0,2);
   result.departuresPerMinute=Number.isFinite(state.departuresPerMinute)?
    0.75*state.departuresPerMinute+0.25*implied:implied;
   result.rateSamples=Math.min(100,(state.rateSamples||0)+1);
  }
  result.lastResetAt=now.toISOString();
  result.lastResetCount=reading;
  result.resetCount=(state.resetCount||0)+1;
 }
 const anchor=Date.parse(result.lastResetAt||'');
 const elapsed=(now.getTime()-anchor)/60000;
 const rate=Number.isFinite(result.departuresPerMinute)&&result.rateSamples>=1?result.departuresPerMinute:null;
 const estimate=rate!==null&&Number.isFinite(elapsed)&&elapsed>=0&&elapsed<=240?
  Math.max(0,Math.round(reading-rate*elapsed)):null;
 return {state:result,isReset,estimatedNow:estimate,
   estimateAgeMinutes:Number.isFinite(elapsed)&&elapsed>=0?Math.round(elapsed):null,
   departureRate:rate,estimateBasis:estimate===null?'insufficient_recounts':'recount_adjusted'};
}
function inspect(points){
 const ordered=(points||[]).filter(p=>Number.isFinite(p.count)&&Number.isFinite(Date.parse(p.timestamp)))
  .slice().sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
 let previous=null,state={},results=[];
 for(const point of ordered){
  const value=update(state,previous,point.count,new Date(point.timestamp));
  state=value.state;
  results.push({...point,...value});
  previous=point;
 }
 return {results,state};
}
module.exports={update,inspect};
