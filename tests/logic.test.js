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
const weekly=L.addWeekly({},L.parts(date),49);
assert.equal(weekly['2-10'].n,1);
assert.equal(L.typical(weekly,L.parts(date)).average,49);
assert.equal(L.forecast(49,null,{},date),null);
const f=L.forecast(49,5,weekly,date);
assert.ok(f&&f.points.length>=2);
console.log('All backend logic tests passed.');
