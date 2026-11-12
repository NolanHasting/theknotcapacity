'use strict';
const $=id=>document.getElementById(id);
const DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const selected=new Set([1,2,3,4,5]);
let available=false,sender='';
function displayDays(){
 $('smsDays').innerHTML='';
 DOW.forEach((name,index)=>{
  const b=document.createElement('button');
  b.type='button';b.className='alerts-day'+(selected.has(index)?' selected':'');
  b.textContent=name;b.setAttribute('aria-pressed',String(selected.has(index)));
  b.onclick=()=>{selected.has(index)?selected.delete(index):selected.add(index);displayDays();};
  $('smsDays').append(b);
 });
}
function timeLabel(minutes){
 const h=Math.floor(minutes/60),m=minutes%60;
 return (h%12||12)+(m?':'+String(m).padStart(2,'0'):'')+(h<12?' AM':' PM');
}
for(const id of ['smsStart','smsEnd']){
 for(let minute=7*60;minute<=23*60;minute+=30){
  const option=document.createElement('option');
  option.value=minute;option.textContent=timeLabel(minute);$(id).append(option);
 }
}
$('smsStart').value=16*60;$('smsEnd').value=21*60;
$('smsAbove').disabled=true;
$('smsBelowOn').onchange=()=>$('smsBelow').disabled=!$('smsBelowOn').checked;
$('smsAboveOn').onchange=()=>$('smsAbove').disabled=!$('smsAboveOn').checked;
displayDays();
const message=(text,isError=false)=>{
 $('smsStatus').textContent=text;
 $('smsStatus').classList.toggle('error',isError);
};
(async()=>{
 try{
  const res=await fetch('/api/sms/config',{cache:'no-store'});
  const data=await res.json();
  available=res.ok&&data.ok&&data.enabled&&data.sender;
  if(available){
   sender=data.sender;$('smsSubmit').disabled=false;
   message('Text alerts are available.');
   $('smsSubmitNote').textContent='No account required. To confirm, you will send a JOIN message from your own phone.';
  }else{
   message('Text alerts are not connected yet. The signup form will be available after setup.');
   $('smsSubmitNote').textContent='No number is collected until SMS service is active.';
  }
 }catch(e){message('Text alert availability could not be checked.',true);}
})();
$('smsForm').addEventListener('submit',async e=>{
 e.preventDefault();
 if(!available)return;
 const below=$('smsBelowOn').checked?Number($('smsBelow').value):null;
 const above=$('smsAboveOn').checked?Number($('smsAbove').value):null;
 const prefs={days:[...selected].sort(),start:Number($('smsStart').value),
  end:Number($('smsEnd').value),below,above};
 if(!prefs.days.length){message('Choose at least one day.',true);return;}
 if(prefs.start>=prefs.end){message('Choose an end time later than your start time.',true);return;}
 if(below===null&&above===null){message('Select at least one alert threshold.',true);return;}
 if((below!==null&&(below<5||below>200||!Number.isInteger(below)))||
  (above!==null&&(above<5||above>200||!Number.isInteger(above)))){
  message('Choose a threshold between 5 and 200.',true);return;
 }
 if(!$('smsConsent').checked){message('Please accept the text notification terms.',true);return;}
 $('smsSubmit').disabled=true;message('Creating your signup…');
 try{
  const res=await fetch('/api/sms/config',{method:'POST',cache:'no-store',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({phone:$('smsPhone').value,preferences:prefs,accepted:true})});
  const data=await res.json();
  if(!res.ok||!data.ok)throw Error(data.error||'Signup unavailable');
  const cmd='JOIN '+data.code;
  $('smsCode').textContent=cmd;
  $('smsDestination').textContent=data.sender;
  $('smsJoin').hidden=false;
  const sep=/iPhone|iPad|iPod/i.test(navigator.userAgent)?'&':'?';
  $('smsOpenMessages').href='sms:'+data.sender+sep+'body='+encodeURIComponent(cmd);
  $('smsJoin').scrollIntoView({behavior:'smooth',block:'nearest'});
  message('Finish by sending the JOIN text. No notifications will be sent before you confirm.');
  $('smsPhone').value='';
 }catch(err){message(err.message||'Could not start signup.',true);}
 finally{$('smsSubmit').disabled=!available;}
});
$('copySmsCode').onclick=async()=>{
 try{await navigator.clipboard.writeText($('smsCode').textContent);message('JOIN code copied.');}
 catch(e){message('Select the JOIN code and copy it manually.');}
};
