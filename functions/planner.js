'use strict';
// Legacy functions retained as harmless stubs for a safe Firebase deployment.
// No old account, social, push, or event schedules execute. Existing private
// Firestore data is preserved until separately deleted at the owner's request.
const {onRequest}=require('firebase-functions/v2/https');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const REGION='us-east1',SERVICE='theknotcapacity@appspot.gserviceaccount.com';
exports.plannerApi=onRequest({region:REGION,memory:'256MiB',timeoutSeconds:10,
 maxInstances:1,invoker:'public',serviceAccount:SERVICE},(req,res)=>{
 res.set('Cache-Control','no-store').status(410).json({ok:false,
  error:'The climbing planner has been retired. Use /alerts.html for optional text alerts.'});
});
exports.evaluatePlannerAlerts=onSchedule({schedule:'0 4 * * *',timeZone:'America/New_York',
 region:REGION,memory:'256MiB',timeoutSeconds:10,maxInstances:1,serviceAccount:SERVICE},async()=>{});
exports.refreshKnotEvents=onSchedule({schedule:'0 4 * * *',timeZone:'America/New_York',
 region:REGION,memory:'256MiB',timeoutSeconds:10,maxInstances:1,serviceAccount:SERVICE},async()=>{});
