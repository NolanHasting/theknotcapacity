'use strict';
const assert=require('node:assert/strict');
const L=require('../functions/logic');
for(const [count,label] of [[0,'GREAT'],[25,'GREAT'],[26,'GOOD'],[50,'GOOD'],[51,'BUSY'],[75,'BUSY'],[76,'BAD'],[99,'BAD'],[100,'AT CAPACITY'],[105,'AT CAPACITY']]){
 assert.equal(L.crowd(count,true).label,label);
}
assert.equal(L.crowd(75,false).label,'CLOSED');
assert.equal(L.trend(5,true).key,'rising');
assert.equal(L.trend(-5,true).key,'falling');
assert.equal(L.trend(0,true).key,'steady');
assert.equal(L.trend(null,true).key,'learning');
const date=new Date('2026-11-10T15:30:00Z'); // Tue 10:30 AM Eastern
assert.deepEqual(L.parts(date),{day:'2026-11-10',dow:2,hour:10,minute:30});
assert.equal(L.openNow(L.parts(date)),true);
let weekly=L.addWeekly({},L.parts(date),49);
assert.equal(weekly['2-10'].n,1);
assert.equal(L.typical(weekly,L.parts(date)).average,49);
const fallback=L.forecast(49,null,{},date);
assert.ok(fallback&&fallback.points.length>20&&fallback.confidence==='EARLY');
assert.equal(fallback.points[fallback.points.length-1].minutes,750);
const f=L.forecast(49,5,weekly,date);
assert.ok(f&&f.points.length>2);
for(const p of f.points){assert.ok(p.low>=0&&p.low<=p.count&&p.count<=p.high&&p.high<=100);}
for(const c of [0,100,105,149]){
 for(const rate of [-30,0,30]){
  const test=L.forecast(c,rate,{},date);
  assert.ok(test.points.every(x=>x.count<=100&&x.high<=100&&x.low>=0));
 }
}
// Same-hour mean must weight days equally, not the day that supplied more samples.
const first={day:'2026-11-03',dow:2,hour:10,minute:10};
const next={day:'2026-11-10',dow:2,hour:10,minute:10};
let w={};for(let i=0;i<60;i++)w=L.addWeekly(w,first,20);
w=L.addWeekly(w,next,80);
assert.equal(L.typical(w,next).average,50);
assert.equal(L.typical(w,next).days,2);
assert.equal(L.typical(w,next).samples,61);
// No past hour suggestions; provisional single-day values are clearly labeled.
const b=L.best(w,date);
assert.ok(b.every(x=>x.hour>=11));
assert.equal(L.slope([],date,48),null);
const observed=[{timestamp:'2026-11-10T15:00:00Z',count:20},{timestamp:'2026-11-10T15:10:00Z',count:24},{timestamp:'2026-11-10T15:20:00Z',count:28}];
assert.ok(L.slope(observed,date,32)>0);
console.log('All backend logic tests passed.');
