'use strict';
const {onRequest}=require('firebase-functions/v2/https');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const {getMessaging}=require('firebase-admin/messaging');
const {logger}=require('firebase-functions');
const crypto=require('node:crypto');
const P=require('./planner-logic');
const REGION='us-east1',SERVICE='theknotcapacity@appspot.gserviceaccount.com';
const db=getFirestore(),users=db.collection('plannerUsers'),codes=db.collection('plannerCodes');
const profileRef=uid=>users.doc(uid);
const validId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{10,128}$/.test(s);
const safeName=s=>typeof s==='string'?s.replace(/[<>]/g,'').trim().slice(0,35):'';
const bad=(status,message)=>{const e=new Error(message);e.status=status;throw e;};
function nameFromAuth(u){const n=safeName((u.email||'').split('@')[0]);return n||'Climber';}
async function verified(req){
 const match=/^Bearer (\S+)$/.exec(req.headers.authorization||'');
 if(!match)bad(401,'Sign in to continue');
 let decoded;
 try{decoded=await getAuth().verifyIdToken(match[1],true);}catch(e){bad(401,'Session expired. Sign in again.');}
 if(!decoded.email_verified)bad(403,'Verify your email, then refresh your session.');
 return decoded;
}
async function ensureProfile(u){
 const ref=profileRef(u.uid);
 const existing=await ref.get();if(existing.exists)return existing.data();
 const code=crypto.randomBytes(8).toString('base64url').toUpperCase().slice(0,11);
 const user={displayName:nameFromAuth(u),friendCode:code,friends:[],
  alerts:P.defaults(),alertState:{},createdAt:new Date().toISOString()};
 await db.runTransaction(async tx=>{
  const [doc,codeDoc]=await Promise.all([tx.get(ref),tx.get(codes.doc(code))]);
  if(doc.exists)return;
  if(codeDoc.exists)bad(503,'Could not create invite code. Please retry.');
  tx.create(ref,user);tx.create(codes.doc(code),{uid:u.uid});
 });
 return (await ref.get()).data();
}
async function getFriendPlans(uid,friendUids){
 const ids=friendUids.slice(0,20).filter(validId);
 const found=[];
 for(const id of ids){
  const doc=await profileRef(id).get();
  if(!doc.exists||!(doc.data().friends||[]).includes(uid))continue;
  const plans=await profileRef(id).collection('plans').where('share','==',true).limit(30).get();
  found.push({uid:id,name:doc.data().displayName||'Climber',
   plans:plans.docs.map(p=>({id:p.id,...p.data()})).filter(p=>p.date>=P.local(new Date()).date)});
 }
 return found;
}
async function getPlanner(req,res){
 const kind=req.query.kind||'me';
 if(kind==='events'){
  const events=await db.collection('plannerPublic').doc('events').get();
  res.json({ok:true,events:events.exists?events.data().events||[]:[],updated:events.exists?events.data().updated:null,
   eventsUrl:'https://climbtheknot.com/events/',closuresUrl:'https://climbtheknot.com/closures/',calendarUrl:'https://portal.climbtheknot.com/gnv/n/calendar'});
  return;
 }
 const u=await verified(req),p=await ensureProfile(u);
 if(kind==='me'){
  res.json({ok:true,profile:{displayName:p.displayName,friendCode:p.friendCode,
   alerts:p.alerts||P.defaults(),friendsCount:(p.friends||[]).length}});
 }else if(kind==='friends'){
  const requests=await profileRef(u.uid).collection('requests').limit(30).get();
  const contacts=await getFriendPlans(u.uid,p.friends||[]);
  res.json({ok:true,friends:contacts,requests:requests.docs.map(d=>({uid:d.id,...d.data()}))});
 }else if(kind==='plans'){
  const snap=await profileRef(u.uid).collection('plans').limit(50).get();
  res.json({ok:true,plans:snap.docs.map(d=>({id:d.id,...d.data()})).filter(v=>v.date>=P.local(new Date()).date).sort((a,b)=>a.date.localeCompare(b.date)||a.startMinute-b.startMinute)});
 }else bad(400,'Unknown request');
}
async function postPlanner(req,res){
 const u=await verified(req),profile=await ensureProfile(u),body=req.body||{},action=body.action;
 if(typeof action!=='string'||JSON.stringify(body).length>12000)bad(400,'Invalid request');
 const ref=profileRef(u.uid);
 if(action==='account.delete'){
  // Only a recent login can destroy private account data.
  const authAge=Date.now()-(Number(u.auth_time)||0)*1000;
  if(!Number.isFinite(authAge)||authAge>10*60*1000)bad(403,'Sign out and sign back in before deleting your account.');
  const [plans,push,requests,sent]=await Promise.all([
   ref.collection('plans').limit(100).get(),
   ref.collection('pushTokens').limit(100).get(),
   ref.collection('requests').limit(100).get(),
   ref.collection('sentRequests').limit(100).get()
  ]);
  const batch=db.batch();
  for(const doc of [...plans.docs,...push.docs,...requests.docs,...sent.docs])batch.delete(doc.ref);
  for(const doc of sent.docs)batch.delete(profileRef(doc.id).collection('requests').doc(u.uid));
  for(const friendId of (profile.friends||[])){
   const other=profileRef(friendId),doc=await other.get();
   if(doc.exists)batch.update(other,{friends:FieldValue.arrayRemove(u.uid)});
   batch.delete(other.collection('requests').doc(u.uid));
  }
  batch.delete(codes.doc(profile.friendCode));
  batch.delete(ref);
  await batch.commit();
  await getAuth().deleteUser(u.uid);
  res.json({ok:true});return;
 }
 if(action==='profile.save'){
  const displayName=safeName(body.displayName);
  if(displayName.length<2)bad(400,'Enter a name with at least two characters');
  await ref.update({displayName});res.json({ok:true});return;
 }
 if(action==='alerts.save'){
  const alerts=P.preferences(body.alerts);
  await ref.update({alerts,alertState:{}});res.json({ok:true,alerts});return;
 }
 if(action==='push.register'){
  const token=body.token;
  if(typeof token!=='string'||token.length<30||token.length>4096)bad(400,'Invalid notification subscription');
  const key=crypto.createHash('sha256').update(token).digest('hex');
  await ref.collection('pushTokens').doc(key).set({token,updated:new Date().toISOString()});
  res.json({ok:true});return;
 }
 if(action==='push.remove'){
  const token=body.token;
  if(typeof token!=='string')bad(400,'Invalid subscription');
  const key=crypto.createHash('sha256').update(token).digest('hex');
  await ref.collection('pushTokens').doc(key).delete();res.json({ok:true});return;
 }
 if(action==='plans.save'){
  const clean=P.plan(body.plan,P.local(new Date()).date);
  const id=body.id;
  const target=id&&typeof id==='string'&&/^[0-9a-f-]{36}$/i.test(id)?id:crypto.randomUUID();
  const existing=await ref.collection('plans').doc(target).get();
  if(!existing.exists){
   const many=await ref.collection('plans').limit(31).get();
   if(many.size>=30)bad(429,'Delete an older plan before adding another');
  }
  await ref.collection('plans').doc(target).set({...clean,updated:new Date().toISOString()});
  res.json({ok:true,id:target});return;
 }
 if(action==='plans.delete'){
  if(typeof body.id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.id))bad(400,'Invalid plan');
  await ref.collection('plans').doc(body.id).delete();res.json({ok:true});return;
 }
 if(action==='friend.request'){
  const code=String(body.code||'').trim().toUpperCase();
  if(!/^[A-Z0-9_-]{11}$/.test(code))bad(400,'Enter a valid friend code');
  const found=await codes.doc(code).get();
  if(!found.exists)bad(404,'Friend code not found');
  const recipient=found.data().uid;
  if(recipient===u.uid)bad(400,'You cannot add yourself');
  if((profile.friends||[]).includes(recipient))bad(409,'Already friends');
  const now=new Date(),last=Date.parse(profile.lastRequestAt||'');
  if(Number.isFinite(last)&&now.getTime()-last<60000)bad(429,'Please try again in a minute');
  // Never reveal recipient's profile or plan without acceptance.
  const sendBatch=db.batch();
  sendBatch.set(profileRef(recipient).collection('requests').doc(u.uid),{
   name:profile.displayName||'Climber',createdAt:now.toISOString()});
  sendBatch.set(ref.collection('sentRequests').doc(recipient),{createdAt:now.toISOString()});
  sendBatch.update(ref,{lastRequestAt:now.toISOString()});
  await sendBatch.commit();
  res.json({ok:true});return;
 }
 if(action==='friend.accept'||action==='friend.reject'){
  const other=body.uid;
  if(!validId(other)||other===u.uid)bad(400,'Invalid request');
  const request=ref.collection('requests').doc(other);
  if(action==='friend.reject'){
   const b=db.batch();b.delete(request);b.delete(profileRef(other).collection('sentRequests').doc(u.uid));await b.commit();res.json({ok:true});return;
  }
  await db.runTransaction(async tx=>{
   const [ask,self,friend]=await Promise.all([tx.get(request),tx.get(ref),tx.get(profileRef(other))]);
   if(!ask.exists||!friend.exists)bad(404,'Friend request unavailable');
   if((self.data().friends||[]).length>=20||(friend.data().friends||[]).length>=20)bad(400,'Friend limit reached');
   tx.update(ref,{friends:FieldValue.arrayUnion(other)});
   tx.update(profileRef(other),{friends:FieldValue.arrayUnion(u.uid)});
   tx.delete(request);
   tx.delete(profileRef(other).collection('sentRequests').doc(u.uid));
  });
  res.json({ok:true});return;
 }
 if(action==='friend.remove'){
  const other=body.uid;
  if(!validId(other))bad(400,'Invalid friend');
  await db.runTransaction(async tx=>{
   const friend=await tx.get(profileRef(other));
   tx.update(ref,{friends:FieldValue.arrayRemove(other)});
   if(friend.exists)tx.update(profileRef(other),{friends:FieldValue.arrayRemove(u.uid)});
  });
  res.json({ok:true});return;
 }
 bad(400,'Unknown action');
}
exports.plannerApi=onRequest({region:REGION,memory:'256MiB',timeoutSeconds:30,
 maxInstances:5,invoker:'public',serviceAccount:SERVICE},async(req,res)=>{
 res.set('Cache-Control','no-store').set('X-Content-Type-Options','nosniff');
 try{
  if(req.method==='GET')await getPlanner(req,res);
  else if(req.method==='POST')await postPlanner(req,res);
  else bad(405,'GET or POST only');
 }catch(e){
  const status=e.status||500;
  if(status===500)logger.error('Planner API failure',e);
  res.status(status).json({ok:false,error:status===500?'Could not complete this request. Please retry.':e.message});
 }
});
exports.evaluatePlannerAlerts=onSchedule({schedule:'*/5 * * * *',timeZone:'America/New_York',
 region:REGION,memory:'256MiB',timeoutSeconds:110,maxInstances:1,serviceAccount:SERVICE},async()=>{
 const now=new Date(),p=P.local(now);
 const status=await db.collection('system').doc('current').get();
 if(!status.exists)return;
 const state=status.data(),age=(Date.now()-Date.parse(state.sourceUpdated||''))/60000;
 if(!state.open||state.error||!Number.isFinite(state.count)||!Number.isFinite(age)||age>3)return;
 let last=null,processed=0;
 for(let page=0;page<20;page++){
  let query=users.where('alerts.enabled','==',true).limit(100);
  if(last)query=query.startAfter(last);
  const batch=await query.get();if(batch.empty)break;
  for(const doc of batch.docs){
   processed++;
   try{
    const data=doc.data(),decision=P.alertDecision(data.alerts,data.alertState||{},state.count,now,state.forecast);
    if(!decision.type){
     // Keep the prior alert clock while updating the last observed count.
     await doc.ref.update({alertState:decision.next});continue;
    }
    let accepted=false,sendDecision=null;
    await db.runTransaction(async tx=>{
     const fresh=await tx.get(doc.ref);
     if(!fresh.exists||!fresh.data().alerts?.enabled)return;
     const check=P.alertDecision(fresh.data().alerts,fresh.data().alertState||{},state.count,now,state.forecast);
     if(!check.type)return;
     tx.update(doc.ref,{alertState:check.next});accepted=true;sendDecision=check;
    });
    if(!accepted)continue;
    const tokens=await doc.ref.collection('pushTokens').limit(10).get();
    const message=P.alertText(sendDecision.type,state.count,data.alerts.threshold,sendDecision.predicted);
    if(!message)continue;
    for(const tokenDoc of tokens.docs){
     try{
      await getMessaging().send({token:tokenDoc.data().token,
       notification:{title:message.title,body:message.body},
       webpush:{notification:{title:message.title,body:message.body,
        icon:'/logo.png',badge:'/logo.png',tag:'knot-crowd-alert'},
        fcmOptions:{link:'https://theknotcapacity.web.app/planner.html'}}});
     }catch(e){
      logger.warn('Push delivery failed',{uid:doc.id,code:e.code});
      if(['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(e.code))
       await tokenDoc.ref.delete();
     }
    }
   }catch(e){logger.error('Alert evaluation failed',{uid:doc.id,error:String(e)});}
  }
  last=batch.docs[batch.docs.length-1];
  if(batch.size<100)break;
 }
 logger.info('Planner alerts checked',{processed,sourceMinute:state.lastMinuteId});
});
exports.refreshKnotEvents=onSchedule({schedule:'every 6 hours',timeZone:'America/New_York',
 region:REGION,memory:'256MiB',timeoutSeconds:40,maxInstances:1,serviceAccount:SERVICE},async()=>{
 const url='https://climbtheknot.com/events/';
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),10000);
 try{
  const response=await fetch(url,{signal:ctrl.signal,headers:{Accept:'text/html','User-Agent':'KnotCapacityEventCalendar/1.0'}});
  if(!response.ok)throw Error('Events page HTTP '+response.status);
  const html=await response.text();
  const events=P.extractEvents(html);
  // Never replace a previously valid event listing with an empty parsing result.
  const value={lastChecked:new Date().toISOString(),source:url};
  if(events.length){value.events=events;value.updated=new Date().toISOString();}
  await db.collection('plannerPublic').doc('events').set(value,{merge:true});
  logger.info('Event source checked',{parsed:events.length});
 }catch(e){logger.warn('Event calendar refresh failed',e);}finally{clearTimeout(timer);}
});
