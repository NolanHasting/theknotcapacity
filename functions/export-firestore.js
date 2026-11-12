'use strict';
// Run locally with GOOGLE_APPLICATION_CREDENTIALS, or from the manual GitHub Actions export workflow.
// No public HTTP endpoint, client credentials, or Firestore rule changes are needed.
const fs = require('node:fs');
const path = require('node:path');
const {initializeApp, applicationDefault} = require('firebase-admin/app');
const {getFirestore, FieldPath} = require('firebase-admin/firestore');
initializeApp({credential: applicationDefault(), projectId: process.env.GCLOUD_PROJECT || 'theknotcapacity'});
const db = getFirestore();
const out = path.resolve(process.env.EXPORT_DIR || path.join(__dirname, '..', 'exports'));
fs.mkdirSync(out, {recursive:true});
const csvCell = x => '"' + String(x === null || x === undefined ? '' : x).replace(/"/g, '""') + '"';
const toISO = x => typeof x === 'string' ? x : (x && typeof x.toDate === 'function' ? x.toDate().toISOString() : null);
async function main(){
 const exportedAt = new Date().toISOString();
 const days = [];
 const rows = [];
 let cursor = null;
 while(true){
  let q = db.collection('days').orderBy(FieldPath.documentId()).limit(100);
  if(cursor) q = q.startAfter(cursor);
  const snap = await q.get();
  if(snap.empty) break;
  for(const doc of snap.docs){
   const d=doc.data(), pts=Array.isArray(d.points)?d.points:[];
   days.push({id:doc.id,date:d.date || doc.id,updated:toISO(d.updated),points:pts.map(p=>({timestamp:toISO(p.timestamp),count:p.count}))});
   for(const p of pts){
    const timestamp=toISO(p.timestamp);
    rows.push({date:d.date || doc.id,timestamp,count:p.count});
   }
  }
  cursor = snap.docs[snap.docs.length-1];
  if(snap.size < 100) break;
 }
 rows.sort((a,b)=>String(a.timestamp).localeCompare(String(b.timestamp)));
 const [current,weekly] = await Promise.all([db.collection('system').doc('current').get(),db.collection('system').doc('weekly').get()]);
 const valid=rows.filter(r=>typeof r.count==='number'&&Number.isFinite(r.count)&&r.count>=0&&r.timestamp&&!isNaN(Date.parse(r.timestamp)));
 const uniqueDates=new Set(valid.map(r=>r.date));
 const counts=valid.map(r=>r.count);
 const summary={
  exportedAt,projectId:process.env.GCLOUD_PROJECT || 'theknotcapacity',
  dayDocuments:days.length,readings:rows.length,validReadings:valid.length,invalidReadings:rows.length-valid.length,
  uniqueDates:uniqueDates.size,firstReading:valid[0]?.timestamp || null,lastReading:valid[valid.length-1]?.timestamp || null,
  minimum:counts.length?counts.reduce((m,n)=>Math.min(m,n),Infinity):null,
  maximum:counts.length?counts.reduce((m,n)=>Math.max(m,n),-Infinity):null,
  average:counts.length?Math.round(100*counts.reduce((s,n)=>s+n,0)/counts.length)/100:null,
  aboveCapacityReadings:counts.filter(n=>n>=100).length,
  note:'Counts are individual observations, not unique visitors; consecutive minutes are correlated. Hourly comparisons should aggregate within each date before averaging across dates.'
 };
 const payload={summary,days,system:{current:current.exists?current.data():null,weekly:weekly.exists?weekly.data():null}};
 fs.writeFileSync(path.join(out,'firestore-history.json'),JSON.stringify(payload,null,2));
 const lines=['date,timestamp,count',...rows.map(r=>[r.date,r.timestamp,r.count].map(csvCell).join(','))];
 fs.writeFileSync(path.join(out,'occupancy-readings.csv'),lines.join('\n')+'\n');
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));
 process.stdout.write('Exported '+summary.readings+' readings from '+summary.dayDocuments+' days.\n');
 process.stdout.write('Files created: firestore-history.json, occupancy-readings.csv, summary.json\n');
}
main().catch(e=>{console.error('Firestore export failed:',e.message);process.exitCode=1;});