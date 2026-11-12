'use strict';
// Pure validators and threshold evaluation, used by both API and regression tests.
const TZ='America/New_York';
const DAYS=[0,1,2,3,4,5,6];
const bounded=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
const dayValid=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
 !Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
const defaults=()=>({enabled:false,days:[1,2,3,4,5],startMinute:16*60,endMinute:21*60,
 threshold:50,direction:'below',forecastEnabled:false});
function preferences(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid preferences');
 const days=input.days;
 if(!Array.isArray(days)||days.length<1||days.length>7||new Set(days).size!==days.length||
  !days.every(d=>DAYS.includes(d)))throw Error('Choose at least one day');
 if(!bounded(input.startMinute,0,1439)||!bounded(input.endMinute,1,1440)||
  input.endMinute<=input.startMinute)throw Error('Choose a valid time window');
 if(!bounded(input.threshold,5,200))throw Error('Threshold must be 5–200');
 if(!['below','above','both'].includes(input.direction))throw Error('Choose an alert direction');
 return {enabled:input.enabled===true,days:days.slice().sort(),startMinute:input.startMinute,
  endMinute:input.endMinute,threshold:input.threshold,direction:input.direction,
  forecastEnabled:input.forecastEnabled===true};
}
function plan(input,today){
 if(!input||!dayValid(input.date)||!dayValid(today))throw Error('Invalid date');
 const offset=Math.round((Date.parse(input.date+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000);
 if(offset<0||offset>30)throw Error('Choose a day within the next 30 days');
 if(!bounded(input.startMinute,0,1439)||!bounded(input.endMinute,1,1440)||
  input.endMinute-input.startMinute<30)throw Error('Plans must last at least 30 minutes');
 if(typeof input.share!=='boolean')throw Error('Choose whether to share the plan');
 return {date:input.date,startMinute:input.startMinute,endMinute:input.endMinute,share:input.share};
}
function local(now){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:TZ,weekday:'short',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now)
  .map(x=>[x.type,x.value]));
 return {dow:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(p.weekday),
  minute:Number(p.hour)*60+Number(p.minute),date:p.year+'-'+p.month+'-'+p.day};
}
function alertDecision(prefs,state,count,now,forecast){
 const when=local(now);
 if(!prefs.enabled||!prefs.days.includes(when.dow)||
  when.minute<prefs.startMinute||when.minute>=prefs.endMinute||!Number.isFinite(count)){
  return {type:null,next:{...state,lastCount:null}};
 }
 const base={...state,lastCount:count,lastDate:when.date};
 const prev=state.lastDate===when.date?state.lastCount:null;
 const crossedDown=Number.isFinite(prev)&&prev>=prefs.threshold&&count<=prefs.threshold-3;
 const crossedUp=Number.isFinite(prev)&&prev<=prefs.threshold&&count>=prefs.threshold+3;
 const since=(now.getTime()-Date.parse(state.lastSentAt||''))/60000;
 const cooled=!Number.isFinite(since)||since>=90;
 if(cooled&&crossedDown&&['below','both'].includes(prefs.direction))
  return {type:'below',next:{...base,lastSentAt:now.toISOString()}};
 if(cooled&&crossedUp&&['above','both'].includes(prefs.direction))
  return {type:'above',next:{...base,lastSentAt:now.toISOString()}};
 // Forecast messages are once per day, never based on an EARLY/no-data model.
 if(cooled&&prefs.forecastEnabled&&state.lastForecastDate!==when.date&&
  forecast?.confidence==='DEVELOPING'&&forecast.matchingDays>=2&&
  Array.isArray(forecast.points)){
  const next=forecast.points.find(p=>p.minutes===60);
  if(next&&Number.isFinite(next.count)&&when.minute+60<prefs.endMinute){
   if(next.count<=prefs.threshold-5&&count>prefs.threshold)
    return {type:'forecast_below',predicted:next.count,next:{...base,lastSentAt:now.toISOString(),lastForecastDate:when.date}};
   if(next.count>=prefs.threshold+5&&count<prefs.threshold)
    return {type:'forecast_above',predicted:next.count,next:{...base,lastSentAt:now.toISOString(),lastForecastDate:when.date}};
  }
 }
 return {type:null,next:base};
}
function alertText(type,count,threshold,predicted){
 if(type==='below')return {title:'Good time to climb',body:'The Knot dropped to '+count+' people, below your '+threshold+'-person alert.'};
 if(type==='above')return {title:'The Knot is filling up',body:'The Knot reached '+count+' people, above your '+threshold+'-person alert.'};
 if(type==='forecast_below')return {title:'Quieter crowd expected',body:'Around '+predicted+' people predicted in an hour. Current count: '+count+'.'};
 if(type==='forecast_above')return {title:'Crowd expected to rise',body:'Around '+predicted+' people predicted in an hour. Current count: '+count+'.'};
 return null;
}
function cleanText(s,max=100){
 if(typeof s!=='string')return '';
 return s.replace(/<[^>]*>/g,' ').replace(/&(?:amp|#38);/g,'&').replace(/&nbsp;/g,' ')
 .replace(/&(?:quot|#34);/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim().slice(0,max);
}
function extractEvents(html,now=new Date()){
 if(typeof html!=='string'||html.length>1500000)return [];
 const candidates=[];
 // Dates must be adjacent to a heading. No source date means no invented event.
 const re=/<h([234])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
 let m;
 const months={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
 while((m=re.exec(html))&&candidates.length<30){
  const title=cleanText(m[2],90);
  if(title.length<4||/^(events|event calendar|our next event|code of conduct|address)$/i.test(title))continue;
  const snippet=cleanText(html.slice(re.lastIndex,re.lastIndex+420),400);
  const date=snippet.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(20\d{2})\b/i);
  if(!date)continue;
  const month=months[date[1].slice(0,3).toLowerCase()],day=Number(date[2]),year=Number(date[3]);
  const iso=year+'-'+String(month+1).padStart(2,'0')+'-'+String(day).padStart(2,'0');
  if(!dayValid(iso))continue;
  const delta=(Date.parse(iso+'T12:00:00Z')-Date.parse(local(now).date+'T12:00:00Z'))/86400000;
  if(delta<0||delta>90)continue;
  candidates.push({title,date:iso,url:'https://climbtheknot.com/events/'});
 }
 const seen=new Set();
 return candidates.filter(x=>{const key=x.title.toLowerCase()+'|'+x.date;if(seen.has(key))return false;seen.add(key);return true;}).slice(0,12);
}
module.exports={defaults,preferences,plan,local,alertDecision,alertText,dayValid,extractEvents};
