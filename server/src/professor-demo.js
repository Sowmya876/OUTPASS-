import {Router} from 'express';
import mongoose from 'mongoose';
import {randomBytes} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {rateLimit} from 'express-rate-limit';
import {User,Leave,DemoSession} from './models.js';
import {authenticate,roles,issueSession,publicUser,fail} from './auth.js';
import {createDemoLeave,demoRequestStatus} from './demo-quota.js';
export const demoRoles=['student','warden','guard','admin'];
export function assertDemoDatabase(settings){
 if(!settings.demoMode)return;
 let uri;try{uri=new URL(settings.uri);}catch{throw Error('Demo requires a dedicated database URI');}
 if(settings.deploymentEnvironment!=='demo'||!/^\/outpass_professor_demo(?:_[a-z0-9]+)?$/i.test(uri.pathname))throw Error('DEMO_MODE requires APP_ENV=demo and a dedicated outpass_professor_demo database');
 if(settings.productionUri){const production=new URL(settings.productionUri);if(production.pathname===uri.pathname)throw Error('Demo database must differ from the normal database');}
}
export async function prepareProfessorDemo(settings){
 assertDemoDatabase(settings);
 if(!settings.demoMode)throw Error('DEMO_MODE is not enabled');
 if(!/^outpass_professor_demo(?:_[a-z0-9]+)?$/i.test(mongoose.connection.name))throw Error('Connected database is not the dedicated professor demo database');
 if(await User.exists({isDemo:{$ne:true}})||await Leave.exists({isDemo:{$ne:true}}))throw Error('Demo database contains unmarked records; refusing to expose it');
 await User.init();await Leave.init();
 for(const role of demoRoles){
 const email=role+'@professor.outpass.example';
 // setOnInsert preserves IDs, bcrypt hashes and request history on every rerun.
 if(!await User.exists({email,isDemo:true}))await User.updateOne({email,isDemo:true},{$setOnInsert:{name:'Demo '+role[0].toUpperCase()+role.slice(1),email,role,isDemo:true,password:await bcrypt.hash(randomBytes(32).toString('base64url'),12),requiresPasswordChange:false,activatedAt:new Date(),invitationStatus:'activated',...(role==='student'?{rollNumber:'PROF-DEMO-001',hostel:'Demo Hall',room:'D-01'}:{})}},{upsert:true});
 }
}
async function ensureRequest(){
 const student=await User.findOne({role:'student',isDemo:true});
 await Leave.updateOne({demoActiveKey:'professor-workflow',status:{$in:['pending','approved']},returnBy:{$lte:new Date()}},{$unset:{demoActiveKey:1}});
 const existing=await Leave.findOne({demoActiveKey:'professor-workflow'});if(existing)return {leave:existing,created:false};
 try{return {leave:await createDemoLeave({demoActiveKey:'professor-workflow',student:student._id,destination:'Campus library demonstration',reason:'Fictional professor evaluation: approve, verify, checkout and return.',departure:new Date(Date.now()-60000),returnBy:new Date(Date.now()+4*3600000),status:'pending'}),created:true};}
 catch(error){
 if(error.code===11000||error.status===429){const active=await Leave.findOne({demoActiveKey:'professor-workflow'});if(active)return {leave:active,created:false};}
 throw error;
 }
}
export function professorDemoRoutes(settings){
 const router=Router();
 router.get('/demo/info',(req,res)=>res.json({enabled:Boolean(settings.demoMode),roles:settings.demoMode?demoRoles:[]}));
 if(!settings.demoMode){router.post('/auth/demo',(req,res)=>res.status(404).json({message:'Demo mode is disabled'}));return router;}
 const limiter=rateLimit({windowMs:15*60000,limit:40,standardHeaders:'draft-8',legacyHeaders:false,message:{message:'Demo access limit reached. Try again later.'}});
 router.post('/auth/demo',limiter,async(req,res)=>{
 if(req.headers.origin&&req.headers.origin!==settings.origin)throw fail(403,'Demo requests must originate from this website');
 const role=req.body?.role;if(!demoRoles.includes(role))throw fail(400,'Choose Student, Warden, Guard or Admin');
 let previous;
 if(req.headers.authorization){await authenticate(settings.secret)(req,res,()=>{});if(!req.user.isDemo)throw fail(403,'Sign out before exploring the isolated demo');previous={id:req.demoSession,version:req.demoVersion};}
 const user=await User.findOne({role,isDemo:true});if(!user)throw fail(503,'Demo setup is not ready');
 const expiresAt=new Date(Date.now()+30*60000);
 const session=previous?await DemoSession.findOneAndUpdate({_id:previous.id,version:previous.version,expiresAt:{$gt:new Date()}},{$set:{user:user._id,expiresAt},$inc:{version:1}},{returnDocument:'after'}):await DemoSession.create({user:user._id,expiresAt});
 if(!session)throw fail(409,'Demo role changed in another tab. Sign in to the demo again');
 res.json({user:publicUser(user),token:issueSession(user,settings.secret,{demoSession:session.id,demoVersion:session.version})});
 });
 const activityLimit=rateLimit({windowMs:15*60000,limit:180,standardHeaders:'draft-8',legacyHeaders:false,message:{message:'Demo activity limit reached. Please try later.'}});
 router.get('/demo/status',activityLimit,authenticate(settings.secret),async(req,res)=>{
 if(!req.user.isDemo)throw fail(403,'Demo session required');res.json(await demoRequestStatus());
 });
 router.post('/demo/request',activityLimit,authenticate(settings.secret),roles('student'),async(req,res)=>{
 if(!req.user.isDemo)throw fail(403,'Demo session required');res.json(await ensureRequest());
 });
 router.post('/auth/demo/logout',authenticate(settings.secret),async(req,res)=>{
 if(!req.user.isDemo)throw fail(403,'Demo session required');
 await DemoSession.updateOne({_id:req.demoSession},{$inc:{version:1},$set:{expiresAt:new Date()}});res.json({message:'Demo signed out'});
 });
 return router;
}
