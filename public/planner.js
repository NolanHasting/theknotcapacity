import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,
 sendEmailVerification,signOut as firebaseSignOut} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
import {getMessaging,getToken,deleteToken,isSupported} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging.js';
'use strict';
const el=id=>document.getElementById(id),html=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const weekday=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],shortTime=m=>{
 const h=Math.floor(m/60),suffix=h<12?'AM':'PM';
 return (h%12||12)+(m%60?':'+String(m%60).padStart(2,'0'):'')+' '+suffix;
};
const localDate=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const addDays=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
let auth=null,app=null,current=null,profile=null,token=null,sw=null,loading=false,selectedDays=[1,2,3,4,5],myPlans=[],friends=[];
const info=(msg,error=false)=>{const target=el('plannerMessage');target.textContent=msg||'';target.classList.toggle('is-error',error);};
const waiting=(value)=>{loading=value;document.querySelectorAll('#plannerPrivate button,#loginSection button').forEach(b=>b.disabled=value);};
const empty=(message)=>'<div class="fine">'+html(message)+'</div>';
function optionTime(id,from=7,to=23,step=30){
 const select=el(id);select.innerHTML='';
 for(let minutes=from*60;minutes<=to*60;minutes+=step){
  const opt=document.createElement('option');opt.value=String(minutes);opt.textContent=shortTime(minutes);select.append(opt);
 }
}
['alertStart','alertEnd','planStart','planEnd'].forEach(id=>optionTime(id));
el('alertStart').value=String(16*60);el('alertEnd').value=String(21*60);
el('planStart').value=String(18*60);el('planEnd').value=String(20*60);
el('planDate').min=localDate();el('planDate').max=addDays(localDate(),30);el('planDate').value=localDate();
el('alertThreshold').addEventListener('input',()=>el('thresholdValue').textContent=el('alertThreshold').value);
function renderDays(){
 el('alertDays').innerHTML=weekday.map((label,i)=>'<button type="button" class="day-pill'+(selectedDays.includes(i)?' is-selected':'')+'" data-day="'+i+'" aria-pressed="'+selectedDays.includes(i)+'">'+label+'</button>').join('');
}
el('alertDays').addEventListener('click',e=>{
 const btn=e.target.closest('[data-day]');if(!btn)return;
 const day=Number(btn.dataset.day);selectedDays=selectedDays.includes(day)?selectedDays.filter(x=>x!==day):[...selectedDays,day];
 renderDays();
});
renderDays();
async function request(kind,body){
 const user=auth?.currentUser;
 if(!user||!user.emailVerified)throw Error('Verify your email and sign in first.');
 const jwt=await user.getIdToken();
 const res=await fetch('/api/planner'+(kind?'?kind='+encodeURIComponent(kind):''),{
  method:body?'POST':'GET',headers:{Authorization:'Bearer '+jwt,...(body?{'Content-Type':'application/json'}:{})},
  body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const data=await res.json();
 if(!res.ok||!data.ok)throw Error(data.error||'Request failed');
 return data;
}
async function events(){
 try{
  const res=await fetch('/api/planner?kind=events',{cache:'no-store'});const data=await res.json();
  if(!res.ok||!data.ok)throw Error('The event feed is unavailable');
  const items=(data.events||[]).filter(x=>x.date>=localDate());
  const content=items.length?items.map(x=>'<div class="planner-item"><div><strong>'+html(x.title)+'</strong><small>'+html(x.date)+'</small></div><a href="'+html(x.url)+'" target="_blank" rel="noopener noreferrer">Details ↗</a></div>').join(''):
   empty('No confirmed upcoming events were found. Check the gym’s official calendar.');
  el('guestEvents').innerHTML=content;el('plannerEvents').innerHTML=content;
 }catch(e){el('guestEvents').innerHTML=empty('The gym calendar is temporarily unavailable.');el('plannerEvents').innerHTML=empty('Please check the official gym calendar.');}
}
events();
function showProfile(p){
 profile=p;
 el('welcomeName').textContent='Hi, '+p.displayName;
 el('myFriendCode').textContent=p.friendCode;
 const settings=p.alerts||{};
 el('alertEnabled').checked=settings.enabled===true;
 selectedDays=Array.isArray(settings.days)?settings.days:[1,2,3,4,5];renderDays();
 el('alertStart').value=String(settings.startMinute??960);el('alertEnd').value=String(settings.endMinute??1260);
 el('alertThreshold').value=String(settings.threshold??50);el('thresholdValue').textContent=el('alertThreshold').value;
 document.querySelectorAll('[name=alertDirection]').forEach(r=>r.checked=r.value===(settings.direction||'below'));
 el('forecastAlert').checked=settings.forecastEnabled===true;
}
async function loadPlans(){
 const res=await request('plans');myPlans=res.plans||[];
 el('myPlans').innerHTML=myPlans.length?myPlans.map(p=>'<div class="planner-item"><div><strong>'+html(p.date)+' · '+shortTime(p.startMinute)+'–'+shortTime(p.endMinute)+'</strong><small>'+(p.share?'Shared with approved friends':'Private session')+'</small></div><button class="planner-outline" data-delete-plan="'+html(p.id)+'" aria-label="Delete session">Remove</button></div>').join(''):empty('No climbing plans yet.');
}
async function loadFriends(){
 const res=await request('friends');friends=res.friends||[];
 el('friendRequests').innerHTML=(res.requests||[]).length?res.requests.map(r=>'<div class="planner-item"><div><strong>'+html(r.name||'Climber')+'</strong><small>Wants to connect</small></div><div class="planner-actions"><button class="planner-primary" data-accept="'+html(r.uid)+'">Accept</button><button class="planner-outline" data-reject="'+html(r.uid)+'">Decline</button></div></div>').join(''):empty('No pending requests.');
 const items=friends.flatMap(f=>f.plans.map(p=>({...p,friendUid:f.uid,friendName:f.name})));
 items.sort((a,b)=>a.date.localeCompare(b.date)||a.startMinute-b.startMinute);
 let content=items.length?items.map(p=>{
  const mine=myPlans.find(x=>x.date===p.date&&x.startMinute<p.endMinute&&x.endMinute>p.startMinute);
  const overlap=mine?' · '+Math.min(p.endMinute,mine.endMinute)-Math.max(p.startMinute,mine.startMinute)+' min overlap with your plan':'';
  return '<div class="planner-item"><div><strong>'+html(p.friendName)+'</strong><small>'+html(p.date)+' · '+shortTime(p.startMinute)+'–'+shortTime(p.endMinute)+html(overlap)+'</small></div></div>';
 }).join(''):empty('Your friends have no shared upcoming sessions.');
 el('friendPlans').innerHTML=content;
 if(friends.length)el('friendPlans').innerHTML+=friends.map(f=>'<div class="planner-item"><strong>'+html(f.name)+'</strong><button class="planner-outline" data-remove="'+html(f.uid)+'">Remove friend</button></div>').join('');
}
async function reload(){
 const [mine]=await Promise.all([request('me'),events()]);
 showProfile(mine.profile);await loadPlans();await loadFriends();
}
function error(e){const code=e?.code||'';return ({
 'auth/email-already-in-use':'That email already has an account.',
 'auth/invalid-credential':'Incorrect email or password.',
 'auth/weak-password':'Choose a stronger password.',
 'auth/operation-not-allowed':'Email sign-in must be enabled in Firebase.',
 'auth/network-request-failed':'Connection unavailable. Try again.'
 })[code]||e?.message||'Something went wrong.';}
async function handleAuth(user){
 current=user;el('loginSection').hidden=!!user&&user.emailVerified;el('plannerPrivate').hidden=!user||!user.emailVerified;
 if(!user){el('plannerConnection').textContent='Private by default';return;}
 if(!user.emailVerified){el('plannerConnection').textContent='Email verification needed';
  info('Check your email for a verification link. After verifying, refresh this page to continue.');return;}
 el('plannerConnection').textContent='Signed in';
 try{await reload();info('');}catch(e){info(error(e),true);}
}
async function wrap(task){
 if(loading)return;waiting(true);
 try{await task();}catch(e){info(error(e),true);}finally{waiting(false);}
}
el('signIn').onclick=()=>wrap(async()=>{
 await signInWithEmailAndPassword(auth,el('emailInput').value.trim(),el('passwordInput').value);
});
el('signUp').onclick=()=>wrap(async()=>{
 const password=el('passwordInput').value;if(password.length<8)throw Error('Use a password of at least 8 characters');
 const credential=await createUserWithEmailAndPassword(auth,el('emailInput').value.trim(),password);
 await sendEmailVerification(credential.user);
 info('Account created. Verify your email, then refresh this page.');
});
el('signOut').onclick=()=>wrap(async()=>{await firebaseSignOut(auth);info('Signed out.');});
el('saveAlerts').onclick=()=>wrap(async()=>{
 const direction=document.querySelector('[name=alertDirection]:checked')?.value||'below';
 const alerts={enabled:el('alertEnabled').checked,days:selectedDays.slice().sort(),startMinute:Number(el('alertStart').value),
  endMinute:Number(el('alertEnd').value),threshold:Number(el('alertThreshold').value),direction,
  forecastEnabled:el('forecastAlert').checked};
 await request(null,{action:'alerts.save',alerts});info('Alert preferences saved.');
});
el('addPlan').onclick=()=>wrap(async()=>{
 const plan={date:el('planDate').value,startMinute:Number(el('planStart').value),endMinute:Number(el('planEnd').value),share:el('sharePlan').checked};
 await request(null,{action:'plans.save',plan});await loadPlans();info('Climbing session saved.');
});
el('myPlans').onclick=e=>{const target=e.target.closest('[data-delete-plan]');if(!target)return;
 wrap(async()=>{await request(null,{action:'plans.delete',id:target.dataset.deletePlan});await loadPlans();info('Session removed.');});};
el('copyCode').onclick=()=>{navigator.clipboard.writeText(el('myFriendCode').textContent).then(()=>info('Friend code copied.'),()=>info('Copy the code shown above.'));};
el('sendRequest').onclick=()=>wrap(async()=>{await request(null,{action:'friend.request',code:el('friendCodeInput').value});el('friendCodeInput').value='';info('Friend request sent.');});
el('friendRequests').onclick=e=>{
 const button=e.target.closest('[data-accept],[data-reject]');if(!button)return;
 wrap(async()=>{await request(null,{action:button.dataset.accept?'friend.accept':'friend.reject',uid:button.dataset.accept||button.dataset.reject});
 await loadFriends();info('Friend request updated.');});
};
el('friendPlans').onclick=e=>{const btn=e.target.closest('[data-remove]');if(!btn)return;
 if(!confirm('Remove this friend? Shared plans will no longer be visible.'))return;
 wrap(async()=>{await request(null,{action:'friend.remove',uid:btn.dataset.remove});await loadFriends();info('Friend removed.');});};
async function notificationReady(){
 if(!('serviceWorker' in navigator)||!('Notification' in window))throw Error('Web push is not supported by this browser.');
 if(/iPhone|iPad|iPod/.test(navigator.userAgent)&&!window.matchMedia('(display-mode: standalone)').matches)
  throw Error('On iPhone, first use Share → Add to Home Screen, then open the installed app.');
 const supported=await isSupported();if(!supported)throw Error('Notifications are not supported on this device.');
 const vapid=window.KNOT_PLANNER_CONFIG?.vapidKey;
 if(!vapid)throw Error('Push notifications have not been configured yet.');
 sw=await navigator.serviceWorker.register('/firebase-messaging-sw.js',{scope:'/'});
 const permission=await Notification.requestPermission();
 if(permission!=='granted')throw Error('Notification permission was not granted.');
 const messaging=getMessaging(app);
 token=await getToken(messaging,{vapidKey:vapid,serviceWorkerRegistration:sw});
 if(!token)throw Error('Could not register a notification token.');
 await request(null,{action:'push.register',token});
 el('pushStatus').textContent='Notifications enabled on this device.';
}
el('enablePush').onclick=()=>wrap(async()=>{await notificationReady();info('Notifications enabled for this device.');});
el('disablePush').onclick=()=>wrap(async()=>{
 if(!token)throw Error('This device has no active notification subscription in this session.');
 await request(null,{action:'push.remove',token});
 try{await deleteToken(getMessaging(app));}catch(_){}
 token=null;el('pushStatus').textContent='Notifications disabled for this device.';info('Device notifications disabled.');
});
el('deleteAccount').onclick=()=>{
 if(!confirm('Delete your planner account, alerts, friends and saved climbing plans? This cannot be undone.'))return;
 wrap(async()=>{
  await request(null,{action:'account.delete'});
  await firebaseSignOut(auth);info('Planner account and personal data deleted.');
 });
};
(async()=>{
 try{
  const response=await fetch('/__/firebase/init.json',{cache:'no-store'});
  if(!response.ok)throw Error('Firebase authentication setup is unavailable.');
  const config=await response.json();
  if(!config.apiKey||!config.projectId)throw Error('Firebase web configuration is missing.');
  app=initializeApp(config);auth=getAuth(app);
  onAuthStateChanged(auth,handleAuth,e=>info(error(e),true));
 }catch(e){el('plannerConnection').textContent='Setup needed';info('Account sign-in is not ready yet: '+error(e),true);}
})();
