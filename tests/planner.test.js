'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const P=require('../functions/planner-logic');
assert.equal(P.dayValid('2026-11-12'),true);
assert.equal(P.dayValid('2026-02-30'),false);
assert.equal(P.dayValid('../../secrets'),false);
const settings=P.preferences({enabled:true,days:[1,3,5],startMinute:960,endMinute:1260,
 threshold:50,direction:'both',forecastEnabled:false});
assert.deepEqual(settings.days,[1,3,5]);
assert.throws(()=>P.preferences({...settings,threshold:-1}));
assert.throws(()=>P.preferences({...settings,days:[]}));
assert.throws(()=>P.preferences({...settings,days:[1,1]}));
assert.throws(()=>P.preferences({...settings,startMinute:1300,endMinute:900}));
const monday=new Date('2026-11-16T21:00:00Z'); // Monday 4 PM EST
assert.equal(P.local(monday).dow,1);
assert.equal(P.local(monday).minute,960);
assert.equal(P.alertDecision(settings,{lastCount:55,lastDate:'2026-11-16'},46,monday).type,'below');
assert.equal(P.alertDecision(settings,{lastCount:45,lastDate:'2026-11-16'},55,monday).type,'above');
const sent=P.alertDecision(settings,{lastCount:55,lastDate:'2026-11-16'},46,monday);
assert.equal(P.alertDecision(settings,sent.next,44,new Date('2026-11-16T21:05:00Z')).type,null);
assert.equal(P.alertDecision(settings,{lastCount:55,lastDate:'2026-11-15'},46,monday).type,null);
assert.equal(P.alertDecision({...settings,days:[2]}, {lastCount:55,lastDate:'2026-11-16'},40,monday).type,null);
assert.equal(P.alertDecision({...settings,enabled:false},{lastCount:55,lastDate:'2026-11-16'},40,monday).type,null);
assert.equal(P.alertDecision({...settings,forecastEnabled:true},{lastCount:65,lastDate:'2026-11-16'},61,monday,{confidence:'EARLY',matchingDays:1,points:[{minutes:60,count:20}]}).type,null);
assert.deepEqual(P.plan({date:'2026-11-18',startMinute:1050,endMinute:1170,share:false},'2026-11-12'),
 {date:'2026-11-18',startMinute:1050,endMinute:1170,share:false});
assert.throws(()=>P.plan({date:'2026-11-10',startMinute:1050,endMinute:1170,share:true},'2026-11-12'));
assert.throws(()=>P.plan({date:'2026-11-13',startMinute:1050,endMinute:1060,share:true},'2026-11-12'));
assert.throws(()=>P.plan({date:'2026-11-13',startMinute:1050,endMinute:1170,share:'yes'},'2026-11-12'));
const sample='<h2>Night Climbing</h2><p>November 18, 2026 · 7 PM</p><h3>Expired Event</h3><p>January 4, 2023</p>';
const parsed=P.extractEvents(sample,new Date('2026-11-12T18:00:00Z'));
assert.equal(parsed.length,1);
assert.equal(parsed[0].title,'Night Climbing');
assert.equal(parsed[0].date,'2026-11-18');
assert.equal(P.extractEvents('<h2>No date event</h2><p>Sign up soon</p>').length,0);
const page=fs.readFileSync(path.join(__dirname,'../public/planner.html'),'utf8');
const client=fs.readFileSync(path.join(__dirname,'../public/planner.js'),'utf8');
for(const match of client.matchAll(/el\('([^']+)'\)/g)){
 assert.ok(page.includes('id="'+match[1]+'"'),'Missing planner DOM element: '+match[1]);
}
for(const id of ['historyDate','count','dayChart']){
 assert.ok(fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8').includes('id="'+id+'"'),
  'Live dashboard element removed: '+id);
}
console.log('Planner model and DOM tests passed.');
