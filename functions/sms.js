'use strict';
const {onRequest}=require('firebase-functions/v2/https');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const {logger}=require('firebase-functions');
const crypto=require('node:crypto');
const S=require('./sms-logic');
const db=getFirestore(),PROJECT='theknotcapacity';
const REGION='us-east1',SERVICE=PROJECT+'@appspot.gserviceaccount.com';
const SUB=db.collection('smsSubscribers'),PENDING=db.collection('smsPending');
const INFO='https://theknotcapacity.web.app/alerts.html';
const WEBHOOK='https://theknotcapacity.web.app/api/sms/inbound';
const cors='https://theknotcapacity.web.app';
let cached=null,cachedAt=0;
async function credentials(){
 if(Date.now()-cachedAt<120000)return cached;
 cachedAt=Date.now();cached=null;
 // Fetch secrets from GCP Secret Manager using the function's service identity.
 // Secret creation and secretAccessor role are external one-time setup; no
 // credentials or phone numbers are checked into GitHub.
 const access=await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',{
  headers:{'Metadata-Flavor':'Google'},signal:AbortSignal.timeout(3500)});
 if(!access.ok)throw Error('SMS runtime identity unavailable');
 const token=(await access.json()).access_token;
 const read=async name=>{
  const url='https://secretmanager.googleapis.com/v1/projects/'+PROJECT+'/secrets/'+name+'/versions/latest:access';
  const r=await fetch(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(4000)});
  if(!r.ok)throw Error('SMS secret unavailable');
  const payload=(await r.json()).payload?.data;
  if(!payload)throw Error('SMS configuration empty');
  return Buffer.from(payload,'base64').toString('utf8').trim();
 };
 const [sid,auth,from]=await Promise.all(['KNOT_TWILIO_ACCOUNT_SID','KNOT_TWILIO_AUTH_TOKEN','KNOT_TWILIO_FROM'].map(read));
 if(!/^AC[a-f0-9]{32}$/i.test(sid)||auth.length<20||!S.validPhone(from))throw Error('SMS configuration invalid');
 cached={sid,auth,from};return cached;
}
async function maybeConfig(){try{return await credentials();}catch(e){logger.debug('SMS not configured');return null;}}
function responseError(res,status,error){res.status(status).set('Cache-Control','no-store').json({ok:false,error});}
async function sendSms(config,to,body){
 const params=new URLSearchParams({To:to,From:config.from,Body:body});
 const response=await fetch('https://api.twilio.com/2010-04-01/Accounts/'+config.sid+'/Messages.json',{
  method:'POST',headers:{Authorization:'Basic '+Buffer.from(config.sid+':'+config.auth).toString('base64'),
   'Content-Type':'application/x-www-form-urlencoded'},body:params.toString(),signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('SMS provider rejected outbound message: '+response.status);
}
function normalPhone(input){
 const digits=String(input||'').replace(/\D/g,'');
 const value=digits.length===10?'+1'+digits:digits.length===11&&digits.startsWith('1')?'+'+digits:'';
 if(!S.validPhone(value)||!/^\+1\d{10}$/.test(value))throw Error('Enter a valid U.S. mobile number');
 return value;
}
function makeCode(){return crypto.randomBytes(5).toString('hex').slice(0,8).toUpperCase();}
const refFor=phone=>SUB.doc(S.hashPhone(phone));
function twiml(res,message){res.set('Content-Type','text/xml; charset=utf-8').set('Cache-Control','no-store').status(200).send(S.xml(message));}
exports.smsSubscribe=onRequest({region:REGION,memory:'256MiB',timeoutSeconds:20,maxInstances:3,
 invoker:'public',serviceAccount:SERVICE},async(req,res)=>{
 res.set('X-Content-Type-Options','nosniff').set('Cache-Control','no-store');
 if(req.method==='GET'){
  const config=await maybeConfig();
  res.json({ok:true,enabled:Boolean(config),sender:config?.from||null});return;
 }
 if(req.method!=='POST'){responseError(res,405,'GET or POST only');return;}
 const origin=req.get('origin');
 if(origin&&!['https://theknotcapacity.web.app','https://theknotcapacity.firebaseapp.com'].includes(origin)){
  responseError(res,403,'Open the official Knot Capacity website to subscribe');return;
 }
 const config=await maybeConfig();
 if(!config){responseError(res,503,'Text alerts are not connected yet. Please check back.');return;}
 try{
  const input=req.body||{};
  if(JSON.stringify(input).length>1800||input.accepted!==true)throw Error('Agree to receive texts before continuing');
  const phone=normalPhone(input.phone),preferences=S.validPrefs(input.preferences);
  const id=S.hashPhone(phone),ip=String(req.headers['x-forwarded-for']||req.ip||'').split(',')[0].slice(0,60);
  const ipHash=crypto.createHash('sha256').update(ip).digest('hex').slice(0,30);
  const day=new Date().toISOString().slice(0,10);
  const ipRef=db.collection('smsSignupLimits').doc(day+'_'+ipHash);
  const existingRef=PENDING.doc(id),now=Date.now(),code=makeCode();
  await db.runTransaction(async tx=>{
   const [limit,pending]=await Promise.all([tx.get(ipRef),tx.get(existingRef)]);
   const limitData=limit.exists?limit.data():{count:0};
   if((limitData.count||0)>=15)throw Object.assign(new Error('Too many attempts. Try again tomorrow.'),{status:429});
   if(pending.exists&&now-Date.parse(pending.data().createdAt)<10*60000)
    throw Object.assign(new Error('A signup was just created for this number. Try again in 10 minutes.'),{status:429});
   tx.set(ipRef,{count:(limitData.count||0)+1,updated:new Date(now).toISOString()});
   tx.set(existingRef,{phone,code,preferences,createdAt:new Date(now).toISOString(),
    expiresAt:new Date(now+30*60000).toISOString()});
  });
  // No text is sent to an unverified number. The recipient must initiate JOIN.
  res.json({ok:true,sender:config.from,code,expiresMinutes:30});
 }catch(e){responseError(res,e.status||400,e.message||'Could not create the signup');}
});
exports.smsInbound=onRequest({region:REGION,memory:'256MiB',timeoutSeconds:25,maxInstances:3,
 invoker:'public',serviceAccount:SERVICE},async(req,res)=>{
 if(req.method!=='POST'){res.status(405).send('POST only');return;}
 const config=await maybeConfig();
 if(!config){res.status(503).send('Unavailable');return;}
 const body=req.body||{};
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.values(body).some(x=>typeof x!=='string')){
  res.status(400).send('Invalid form');return;
 }
 const signature=req.get('x-twilio-signature');
 if(!S.signed(WEBHOOK,body,config.auth,signature)){
  res.status(403).send('Invalid signature');return;
 }
 const from=body.From,to=body.To;
 if(!S.validPhone(from)||to!==config.from){res.status(400).send('Invalid sender');return;}
 const id=S.hashPhone(from),subscriber=refFor(from),pending=PENDING.doc(id);
 const command=S.parse(body.Body||'');
 const prefix='Knot Capacity: ';
 const help='Commands: STATUS, DAYS MON WED FRI, HOURS 4PM-9PM, BELOW 50, ABOVE 80, OFF BELOW, OFF ABOVE, PAUSE, RESUME, STOP. Msg & data rates may apply.';
 try{
  if(command.cmd==='HELP'){twiml(res,prefix+help);return;}
  if(command.cmd==='STOP'){
   const old=await subscriber.get();
   if(old.exists)await subscriber.set({consent:false,enabled:false,phone:FieldValue.delete(),
    stoppedAt:new Date().toISOString(),preferences:FieldValue.delete(),state:FieldValue.delete()},{merge:true});
   await pending.delete();
   twiml(res,prefix+'You are unsubscribed. No more alerts. Text HELP for information.');return;
  }
  if(command.cmd==='JOIN'){
   const requested=await pending.get();
   if(!requested.exists||requested.data().code!==command.code||
    Date.parse(requested.data().expiresAt)<Date.now()){
    twiml(res,prefix+'Signup code invalid or expired. Request a new one at '+INFO);return;
   }
   const preferences=S.validPrefs(requested.data().preferences);
   await db.runTransaction(async tx=>{
    const fresh=await tx.get(pending);
    if(!fresh.exists||fresh.data().code!==command.code||
     Date.parse(fresh.data().expiresAt)<Date.now())return;
    tx.set(subscriber,{phone:from,...preferences,consent:true,enabled:true,state:{},
     joinedAt:new Date().toISOString(),updated:new Date().toISOString()});
    tx.delete(pending);
   });
   twiml(res,prefix+'You are subscribed. '+S.describe(preferences)+'. Up to 3 alerts/day. Reply STATUS to view, HELP to edit, or STOP to cancel. Msg & data rates may apply.');return;
  }
  const snap=await subscriber.get();
  if(!snap.exists||!snap.data().consent){
   twiml(res,prefix+'No active subscription. Sign up at '+INFO+' and text JOIN with your code.');return;
  }
  const existing=snap.data();
  if(command.cmd==='START'){
   twiml(res,prefix+'To restart after STOP, sign up again at '+INFO);return;
  }
  if(command.cmd==='STATUS'){
   twiml(res,prefix+(existing.enabled?'Alerts on: ':'Alerts paused: ')+S.describe(existing)+'. Reply HELP to edit or STOP to cancel.');return;
  }
  if(command.cmd==='PAUSE'||command.cmd==='RESUME'){
   await subscriber.update({enabled:command.cmd==='RESUME',state:{},updated:new Date().toISOString()});
   twiml(res,prefix+(command.cmd==='PAUSE'?'Alerts paused. Text RESUME to turn them back on.':'Alerts resumed. Text STOP to unsubscribe.'));return;
  }
  const next={days:existing.days,start:existing.start,end:existing.end,
   below:existing.below,above:existing.above};
  if(command.cmd==='BELOW')next.below=command.count;
  else if(command.cmd==='ABOVE')next.above=command.count;
  else if(command.cmd==='OFF')next[command.direction]=null;
  else if(command.cmd==='DAYS')next.days=command.days;
  else if(command.cmd==='HOURS'){next.start=command.start;next.end=command.end;}
  else{twiml(res,prefix+'Command not recognized. '+help);return;}
  let prefs;try{prefs=S.validPrefs(next);}catch(e){
   twiml(res,prefix+e.message+'. '+help);return;
  }
  await subscriber.update({...prefs,state:{},updated:new Date().toISOString()});
  twiml(res,prefix+'Preferences updated: '+S.describe(prefs)+'. Text STOP anytime.');
 }catch(e){
  logger.error('Inbound SMS handling failed',{error:String(e.message||e),command:command.cmd});
  res.status(503).send('Temporary service issue');
 }
});
exports.evaluateSmsAlerts=onSchedule({schedule:'*/5 * * * *',timeZone:'America/New_York',
 region:REGION,memory:'256MiB',timeoutSeconds:115,maxInstances:1,serviceAccount:SERVICE},async()=>{
 const config=await maybeConfig();if(!config)return;
 const status=await db.collection('system').doc('current').get();
 if(!status.exists)return;
 const reading=status.data(),age=(Date.now()-Date.parse(reading.sourceUpdated||''))/60000;
 if(!reading.open||reading.error||!Number.isFinite(reading.count)||!Number.isFinite(age)||age>3)return;
 let cursor=null,checked=0;
 for(let batchNo=0;batchNo<20;batchNo++){
  let query=SUB.where('consent','==',true).orderBy('__name__').limit(100);
  if(cursor)query=query.startAfter(cursor);
  const batch=await query.get();if(batch.empty)break;
  for(const doc of batch.docs){
   const p=doc.data();
   if(!p.enabled||!p.phone)continue;
   try{
    const decision=S.evaluate(p,p.state||{},reading.count,new Date());
    if(!decision.type){
     await doc.ref.update({state:decision.next});continue;
    }
    let shouldSend=false;
    await db.runTransaction(async tx=>{
     const latest=await tx.get(doc.ref);
     if(!latest.exists||!latest.data().consent||!latest.data().enabled)return;
     const newDecision=S.evaluate(latest.data(),latest.data().state||{},reading.count,new Date());
     if(!newDecision.type)return;
     tx.update(doc.ref,{state:newDecision.next});
     shouldSend=true;
    });
    if(!shouldSend)continue;
    const msg=decision.type==='below'
     ?'Knot Capacity: The Knot is at '+reading.count+' people, below your '+p.below+'-person alert. Reply STOP to unsubscribe.'
     :'Knot Capacity: The Knot is at '+reading.count+' people, above your '+p.above+'-person alert. Reply STOP to unsubscribe.';
    await sendSms(config,p.phone,msg);
   }catch(e){logger.warn('SMS alert evaluation failed',{id:doc.id,error:String(e.message||e)});}
   checked++;
  }
  cursor=batch.docs[batch.docs.length-1];if(batch.size<100)break;
 }
 logger.info('SMS alert check complete',{checked});
});
