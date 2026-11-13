'use strict';
const L=require('./logic');
function health(status={},now=new Date()){
 const p=L.parts(now),scheduledOpen=L.openNow(p);
 const stamp=Date.parse(status.sourceUpdated||'');
 const age=(now.getTime()-stamp)/60000;
 // An old stored open/closed flag is not proof of current opening hours.
 const live=scheduledOpen&&status.open===true&&
  Number.isFinite(age)&&age>=0&&age<=3&&!status.error;
 const state=!scheduledOpen?'closed':live?'live':
  status.open===true&&Number.isFinite(age)&&age>=0&&age<=30?'delayed':'offline';
 return {scheduledOpen,state,sourceAgeMinutes:Number.isFinite(age)&&age>=0?Math.round(age):null};
}
module.exports={health};
