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
assert.equal(f.points.at(-1).count,0);
assert.equal(f.points.at(-1).high,0);
assert.equal(L.forecast(142,0,{},date).points[0].count,142);
for(const p of f.points){assert.ok(p.low>=0&&p.low<=p.count&&p.count<=p.high&&p.high>=p.count);}
for(const c of [0,100,105,149]){
 for(const rate of [-30,0,30]){
  const test=L.forecast(c,rate,{},date);
  assert.ok(test.points.every(x=>x.count>=0&&x.high>=x.count&&x.low>=0));
  assert.equal(test.points.at(-1).count,0);
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
// An abrupt manual reset must not manufacture an extreme downward trend.
const corrected=[
 {timestamp:'2026-11-10T14:00:00Z',count:120},
 {timestamp:'2026-11-10T14:05:00Z',count:124},
 {timestamp:'2026-11-10T14:06:00Z',count:60},
 {timestamp:'2026-11-10T14:15:00Z',count:63},
 {timestamp:'2026-11-10T14:20:00Z',count:65},
];
const correctedRate=L.slope(corrected,new Date('2026-11-10T14:30:00Z'),67);
assert.ok(correctedRate>0);
const H=require('../functions/history');
assert.equal(H.dateOnly('2026-11-10'),true);
assert.equal(H.dateOnly('2026-02-30'),false);
assert.equal(H.dateOnly('../system/current'),false);
const historyRecords=[
 {date:'2026-11-10',points:Array.from({length:15},(_,i)=>({timestamp:new Date(Date.parse('2026-11-10T15:00:00Z')+i*60000).toISOString(),count:80}))},
 {date:'2026-11-11',points:Array.from({length:15},(_,i)=>({timestamp:new Date(Date.parse('2026-11-11T15:00:00Z')+i*60000).toISOString(),count:60}))},
];
const observedDay=H.historical(historyRecords[0],'2026-11-10');
assert.equal(observedDay.points.length,15);
const future=H.future('2026-11-17',historyRecords);
assert.equal(future.mode,'future');
assert.equal(future.points.at(-1).count,0);
assert.equal(future.points.find(p=>p.minute===600).count,70); // General recent-days fallback
assert.equal(future.summary.referenceDays,2);
assert.equal(H.future('2026-11-17',[]).points.length,0);

const R=require('../functions/recounts');
const resetStart=new Date('2026-11-10T17:00:00Z');
let model={};
let previous={timestamp:'2026-11-10T16:59:00Z',count:100};
let out=R.update(model,previous,62,resetStart);
assert.equal(out.isReset,true);
assert.equal(out.estimatedNow,null);
model=out.state;
const after=new Date('2026-11-10T18:00:00Z');
out=R.update(model,{timestamp:'2026-11-10T17:59:00Z',count:112},72,after);
assert.equal(out.isReset,true);
assert.ok(out.departureRate>0);
assert.equal(out.estimatedNow,72);
model=out.state;
out=R.update(model,{timestamp:'2026-11-10T18:29:00Z',count:90},91,new Date('2026-11-10T18:30:00Z'));
assert.equal(out.isReset,false);
assert.ok(out.estimatedNow<91);
const anchored=L.forecast(91,10,{},new Date('2026-11-10T18:30:00Z'),out);
assert.equal(anchored.points[0].count,out.estimatedNow);
assert.equal(anchored.points.at(-1).count,0);
// A sharp downward reset should not create a "leaving fast" trend.
const inspected=R.inspect([
 {timestamp:'2026-11-10T16:59:00Z',count:100},
 {timestamp:'2026-11-10T17:00:00Z',count:62},
 {timestamp:'2026-11-10T17:59:00Z',count:112},
 {timestamp:'2026-11-10T18:00:00Z',count:72}
]);
assert.equal(inspected.state.resetCount,2);
const enhanced=H.future('2026-11-17',historyRecords);
assert.ok(enhanced.points.every(p=>p.count===null||(p.low<=p.count&&p.high>=p.count)));
assert.deepEqual(enhanced.points.at(-1),{minute:1380,count:0,low:0,high:0,days:0,assumedClose:true});
console.log('All backend logic tests passed.');
