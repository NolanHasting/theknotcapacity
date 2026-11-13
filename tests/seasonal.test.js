'use strict';
const assert=require('node:assert/strict');
const S=require('../functions/seasonal');
const L=require('../functions/logic');
const dates=['2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07','2026-11-08','2026-11-09'];
function reading(date,hour,minute,count){
 return {timestamp:new Date(date+'T'+String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0')+':00-05:00').toISOString(),count};
}
function day(date,shift=0){
 return {date,points:[
  reading(date,9,59,50),reading(date,10,0,25+shift),
  reading(date,16,59,115),reading(date,17,0,92+shift),
  reading(date,20,59,72),reading(date,21,0,34+shift)
 ]};
}
const docs=dates.map((d,i)=>day(d,(i%3-1)*6));
const now=new Date('2026-11-10T15:30:00Z');
const model=S.train(docs,now);
assert.equal(model.days,7);
assert.equal(model.recounts,21);
const p10=S.profile(model,{dow:2,hour:10,minute:30});
const p18=S.profile(model,{dow:2,hour:18,minute:0});
const p21=S.profile(model,{dow:2,hour:21,minute:0});
assert.ok(p10&&p18&&p21);
assert.ok(p18.count>p10.count+25,'Evening must be busier than morning on observed recount pattern');
assert.ok(p21.count<p18.count,'The later evening should decline when observed recounts do');
const forecast=S.project(35,0,model,now);
assert.equal(forecast.points[0].count,35);
const at17=forecast.points.find(x=>x.minutes===390);
assert.ok(at17&&at17.count>40,'Live forecast should follow the observed evening buildup');
assert.equal(forecast.points.at(-1).count,0,'Closing zero is a schedule assumption');
assert.equal(forecast.points.at(-1).high,0);
assert.equal(forecast.points[0].high,forecast.points[0].low);
const future=S.futureDay('2026-11-17',model);
assert.equal(future.mode,'future');
const morning=future.points.find(x=>x.minute===630),evening=future.points.find(x=>x.minute===1080);
assert.ok(morning.count<evening.count,'Future-date curve should preserve evening peak');
assert.equal(future.points.at(-1).count,0);
assert.ok(future.points.every(x=>x.count===null||x.low<=x.count&&x.high>=x.count));
const calibrated={horizons:{
  15:{days:5,samples:40,p80:6},
  30:{days:5,samples:40,p80:11},
  60:{days:5,samples:40,p80:18},
  120:{days:5,samples:40,p80:25},
  240:{days:5,samples:40,p80:35},
  480:{days:5,samples:40,p80:45}
}};
assert.equal(S.band(calibrated,15,true),6);
assert.equal(S.band(calibrated,60,true),18);
assert.ok(S.band(calibrated,90,true)>18);
const fitted=S.project(35,0,model,now,calibrated);
assert.equal(fitted.intervalType,'recount-calibrated-80');
assert.ok(fitted.points.find(x=>x.minutes===60).high-fitted.points.find(x=>x.minutes===60).count>=17);
const scarce=S.project(35,0,model,now,{horizons:{}});
assert.notEqual(scarce.intervalType,'recount-calibrated-80');
assert.equal(S.quantile([1,2,3,4,5],.8),5);
const cv=S.backtest(docs,now);
assert.equal(cv.version,'recount-seasonal-v4');
assert.equal(cv.horizons[60].p80,null,'Never claim calibrated ranges without independent days');
assert.equal(S.anchorPoints({date:'2026-11-10',points:[reading('2026-11-10',10,0,20)]}).length,0);
console.log('Recount-trained seasonal model tests passed.');
