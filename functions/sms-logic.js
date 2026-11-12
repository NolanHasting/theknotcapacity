'use strict';
const crypto=require('node:crypto');
const DOW=['SUN','MON','TUE','WED','THU','FRI','SAT'];
function local(now=new Date()){
 const values=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',
  weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23',year:'numeric',
  month:'2-digit',day:'2-digit'}).formatToParts(now).map(x=>[x.type,x.value]));
 return {day:values.year+'-'+values.month+'-'+values.day,
  dow:DOW.indexOf(values.weekday.toUpperCase()),minute:Number(values.hour)*60+Number(values.minute)};
}
function validPrefs(p){
 if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Invalid preferences');
 if(!Array.isArray(p.days)||!p.days.length||p.days.length>7||
   new Set(p.days).size!==p.days.length||p.days.some(x=>!Number.isInteger(x)||x<0||x>6))throw Error('Select climbing days');
 if(!Number.isInteger(p.start)||!Number.isInteger(p.end)||p.start<0||p.end>1440||
    p.start>=p.end)throw Error('Choose a valid time range');
 for(const k of ['below','above']){
  if(p[k]!==null&&(!Number.isInteger(p[k])||p[k]<5||p[k]>200))throw Error('Choose a threshold from 5 to 200');
 }
 if(p.below===null&&p.above===null)throw Error('Enable at least one alert');
 return {days:p.days.slice().sort(),start:p.start,end:p.end,below:p.below,above:p.above};
}
function timeString(m){
 const h=Math.floor(m/60),min=m%60;
 return (h%12||12)+(min?':'+String(min).padStart(2,'0'):'')+(h<12?'AM':'PM');
}
function describe(p){
 const days=p.days.length===7?'every day':p.days.map(x=>DOW[x].slice(0,1)+DOW[x].slice(1).toLowerCase()).join(', ');
 const thresholds=[p.below===null?'':'below '+p.below,p.above===null?'':'above '+p.above].filter(Boolean).join(' or ');
 return days+' '+timeString(p.start)+'–'+timeString(p.end)+'; '+thresholds;
}
function parse(text){
 const raw=String(text||'').trim().toUpperCase().replace(/\s+/g,' ');
 if(['STOP','STOPALL','UNSUBSCRIBE','CANCEL','END','QUIT'].includes(raw))return {cmd:'STOP'};
 if(['START','UNSTOP'].includes(raw))return {cmd:'START'};
 if(['HELP','INFO'].includes(raw))return {cmd:'HELP'};
 if(['STATUS','SETTINGS','PREFS'].includes(raw))return {cmd:'STATUS'};
 if(raw==='PAUSE')return {cmd:'PAUSE'};
 if(raw==='RESUME')return {cmd:'RESUME'};
 const join=/^JOIN ([A-Z0-9]{8})$/.exec(raw);if(join)return {cmd:'JOIN',code:join[1]};
 const n=/^(BELOW|ABOVE) (\d{1,3})$/.exec(raw);
 if(n)return {cmd:n[1],count:Number(n[2])};
 const off=/^OFF (BELOW|ABOVE)$/.exec(raw);if(off)return {cmd:'OFF',direction:off[1].toLowerCase()};
 const days=/^DAYS (.+)$/.exec(raw);
 if(days){
  const args=days[1]==='ALL'?DOW:days[1].split(/[ ,]+/).filter(Boolean);
  const converted=args.map(x=>DOW.findIndex(d=>d===x||d.startsWith(x)&&x.length>=3));
  if(converted.some(x=>x<0)||!converted.length||new Set(converted).size!==converted.length)return {cmd:'INVALID'};
  return {cmd:'DAYS',days:converted};
 }
 const hours=/^HOURS (\d{1,2})(?::(00|30))?\s*[-–]\s*(\d{1,2})(?::(00|30))?$/.exec(raw);
 if(hours)return {cmd:'HOURS',start:Number(hours[1])*60+Number(hours[2]||0),
  end:Number(hours[3])*60+Number(hours[4]||0)};
 return {cmd:'INVALID'};
}
function evaluate(p,state,count,now){
 const t=local(now),next={...state};
 if(next.day!==t.day){next.day=t.day;next.sentToday=0;next.lastCount=null;}
 const active=p.enabled!==false&&p.consent===true&&
  p.days.includes(t.dow)&&t.minute>=p.start&&t.minute<p.end;
 const previous=Number.isFinite(next.lastCount)?next.lastCount:null;
 next.lastCount=active?count:null;
 if(!active||!Number.isFinite(count))return {next,type:null};
 const old=Date.parse(next.lastSentAt||'');
 const cooled=!Number.isFinite(old)||(now.getTime()-old)>=90*60000;
 if(!cooled||(next.sentToday||0)>=3)return {next,type:null};
 let type=null;
 // Hysteresis: crossing by at least 3 people prevents alert ping-pong.
 if(previous!==null&&p.below!==null&&previous>=p.below&&count<=p.below-3)type='below';
 else if(previous!==null&&p.above!==null&&previous<=p.above&&count>=p.above+3)type='above';
 if(type){next.lastSentAt=now.toISOString();next.sentToday=(next.sentToday||0)+1;}
 return {next,type};
}
function hashPhone(number){return crypto.createHash('sha256').update(number).digest('hex');}
function validPhone(n){return typeof n==='string'&&/^\+[1-9]\d{7,14}$/.test(n);}
function twilioSignature(url,params,authToken){
 const base=url+Object.keys(params).sort().map(k=>k+String(params[k])).join('');
 return crypto.createHmac('sha1',authToken).update(base).digest('base64');
}
function signed(url,params,token,signature){
 if(typeof signature!=='string'||!signature)return false;
 const expected=Buffer.from(twilioSignature(url,params,token));
 const actual=Buffer.from(signature);
 return expected.length===actual.length&&crypto.timingSafeEqual(expected,actual);
}
function xml(message){
 const safe=String(message).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 return '<?xml version="1.0" encoding="UTF-8"?><Response><Message>'+safe+'</Message></Response>';
}
module.exports={local,validPrefs,describe,parse,evaluate,hashPhone,validPhone,twilioSignature,signed,xml};
