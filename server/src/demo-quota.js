import {Leave} from './models.js';
import {fail} from './auth.js';
export const DEMO_REQUEST_LIMIT=200;
export const DEMO_CAPACITY_MESSAGE='Demo request limit reached. You can still sign in, switch roles, and finish existing requests.';
export async function demoRequestStatus(){
 const count=await Leave.countDocuments({isDemo:true});
 return {limit:DEMO_REQUEST_LIMIT,count,atCapacity:count>=DEMO_REQUEST_LIMIT,message:count>=DEMO_REQUEST_LIMIT?DEMO_CAPACITY_MESSAGE:null};
}
export async function createDemoLeave(values){
 // Historical leaves stay untouched and reserve the first N unused slots. Every new
 // demo creation path uses a unique slot; concurrent inserts cannot share one.
 // This works on standalone MongoDB as well as Atlas without transactions.
 await Leave.init();
 const [legacyCount,numbered]=await Promise.all([
 Leave.countDocuments({isDemo:true,demoQuotaSlot:{$exists:false}}),
 Leave.find({isDemo:true,demoQuotaSlot:{$exists:true}}).select('demoQuotaSlot -_id').lean()
 ]);
 const used=new Set(numbered.map(row=>row.demoQuotaSlot));
 let reserved=legacyCount;
 for(let slot=0;slot<DEMO_REQUEST_LIMIT;slot++){
 if(used.has(slot))continue;
 if(reserved>0){reserved--;continue;}
 try{return await Leave.create({...values,isDemo:true,demoQuotaSlot:slot});}
 catch(error){if(error.code===11000&&error.keyPattern?.demoQuotaSlot)continue;throw error;}
 }
 throw fail(429,DEMO_CAPACITY_MESSAGE);
}
