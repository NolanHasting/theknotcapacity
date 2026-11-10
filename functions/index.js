'use strict';
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {onRequest}=require('firebase-functions/v2/https');
const {initializeApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {logger}=require('firebase-functions');
const L=require('./logic');
initializeApp();
const db=getFirestore();
const REGION='us-east1';
const ENDPOINT='https://climbtheknot.com/api/capacity.json';
const STATUS=db.collection('system').doc('current');
const WEEKLY=db.collection('system').doc('weekly');

// One scheduled check per minute. Closed hours do not contact the gym endpoint.
exports.collectOccupancy=onSchedule({schedule:'* * * * *',timeZone:L.TZ,region:REGION,
 memory:'256MiB',timeoutSeconds:45,maxInstances:1},async()=>{
 const now=new Date(),p=L.parts(now),open=L.openNow(p);
 if(!open){
  await STATUS.set({...L.crowd(null,false),open:false,count:null,trend:'closed',trendLabel:'CLOSED HOURS',
   trendPer30:null,forecast:null,updated:now.toISOString(),sourceUpdated:null},{merge:true});
  return;
 }
 const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),8000);
 let count;
 try{
  const res=await fetch(ENDPOINT,{headers:{Accept:'application/json'},signal:ctrl.signal});
  if(!res.ok)throw Error(`Source HTTP ${res.status}`);
  const body=await res.json();
  if(body.ok!==true||typeof body.currentCapacity!=='number'||!Number.isFinite(body.currentCapacity))throw Error('Invalid source payload');
  if(body.currentCapacity<0)throw Error('Negative source occupancy');
  count=Math.round(body.currentCapacity); // counts >100 are valid observations; 100 is a policy reference
 }catch(e){logger.error('Source unavailable; retaining prior reading rather than claiming a new live count',e);
  await STATUS.set({error:String(e.message||e),sourceErrorAt:now.toISOString()},{merge:true});return;
 }finally{clearTimeout(timer);}
 const minuteId=`${p.day}_${String(p.hour).padStart(2,'0')}${String(p.minute).padStart(2,'0')}`;
 const dayRef=db.collection('days').doc(p.day);
 await db.runTransaction(async tx=>{
  const [prevSnap,daySnap,weeklySnap]=await Promise.all([
   tx.get(STATUS),tx.get(dayRef),tx.get(WEEKLY)]);
  if(prevSnap.exists&&prevSnap.data().lastMinuteId===minuteId)return; // retry-safe once per minute
  const old=prevSnap.exists?prevSnap.data():{},day=daySnap.exists?daySnap.data():{points:[]};
  const weekly=weeklySnap.exists?weeklySnap.data():{total:0,started:now.toISOString()};
  const oldRecent=(old.recent||[]).filter(x=>now-Date.parse(x.timestamp)<50*60000);
  const rate=L.slope(oldRecent,now,count),direction=L.trend(rate,true);
  const nextWeekly=L.addWeekly(weekly,p,count);
  const projection=L.forecast(count,rate,nextWeekly,now);
  const sample={timestamp:now.toISOString(),count};
  const status={...L.crowd(count,true),open:true,count,trend:direction.key,trendLabel:direction.label,
   trendPer30:rate,forecast:projection,updated:now.toISOString(),sourceUpdated:now.toISOString(),
   lastLogged:now.toISOString(),lastMinuteId:minuteId,recent:[...oldRecent,sample].slice(-50),error:null};
  tx.set(dayRef,{date:p.day,points:[...(day.points||[]),sample],updated:now.toISOString()});
  tx.set(WEEKLY,{...nextWeekly,total:(weekly.total||0)+1});
  tx.set(STATUS,status);
 });
});

// The only public API. Firestore itself is not client-readable.
// Firebase Hosting rewrites /api/status to this function on the same domain.
exports.getOccupancy=onRequest({region:REGION,memory:'256MiB',timeoutSeconds:20,
 maxInstances:3,invoker:'public'},async(req,res)=>{
 if(req.method!=='GET'){res.status(405).json({ok:false,error:'GET only'});return;}
 try{
  const p=L.parts(new Date());
  const [s,d,w]=await Promise.all([STATUS.get(),db.collection('days').doc(p.day).get(),WEEKLY.get()]);
  if(!s.exists){res.status(503).set('Cache-Control','no-store').json({ok:false,error:'No reading exists yet. Check that collectOccupancy is deployed, enabled, and running in Firebase Scheduler.'});return;}
  const status=s.data(),weekly=w.exists?w.data():{};
  let response=L.summarize(status,d.exists?d.data():{},weekly);
  const age=(Date.now()-Date.parse(status.sourceUpdated||''))/60000;
  // Display a warning if source readings are old. Never silently claim LIVE.
  response.sourceAgeMinutes=Number.isFinite(age)?Math.round(age):null;
  response.dataState=!response.open?'closed':(Number.isFinite(age)&&age<=3&&!status.error?'live':
   (Number.isFinite(age)&&age<=30?'delayed':'offline'));
  response.fresh=response.dataState==='live';
  response.lastSourceErrorAt=status.sourceErrorAt||null;
  response.sourceHealth=status.error?'fetch_failed':'ok';
  response.ok=true; // A delayed response is valid JSON: render its warning, not an API error.
  if(response.dataState!=='live'){response.forecast=null;response.trendPer30=null;response.trendLabel='DATA NOT LIVE';}
  if(response.dataState==='delayed')response.warning='Source reading delayed; last known count only.';
  if(response.dataState==='offline')response.warning='Source unavailable; last known count is not reliable.';
  if(status.error&&response.dataState!=='closed')response.warning=(response.warning||'')+' Last collection error: '+String(status.error).slice(0,160);
  res.set('Cache-Control','no-store');
  res.set('X-Content-Type-Options','nosniff');
  res.json(response);
 }catch(e){logger.error('GET status failed',e);res.status(503).set('Cache-Control','no-store').json({ok:false,error:'Backend could not read occupancy from Firestore. Check function logs and Firestore permissions.'});}
});
