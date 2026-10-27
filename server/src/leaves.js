import {Router} from 'express';
import {randomBytes,createHash} from 'node:crypto';
import QRCode from 'qrcode';
import mongoose from 'mongoose';
import {Leave} from './models.js';
import {authenticate,roles,fail} from './auth.js';
import {createDemoLeave} from './demo-quota.js';
export const hashToken=token=>createHash('sha256').update(token).digest('hex');
const studentFields='name email rollNumber hostel room';
const gateStudentFields='name rollNumber hostel room';
const gateSelect='-reason -decisionNote -decidedBy';
const scope=req=>({isDemo:req.user.isDemo?true:{$ne:true}});
const cleanText=(value,min,max,label)=>{
 if(typeof value!=='string'||value.trim().length<min||value.trim().length>max) throw fail(400,label+' must be '+min+'?'+max+' characters');
 return value.trim();
};
const validId=(req,res,next)=>{if(!mongoose.isValidObjectId(req.params.id))throw fail(400,'Invalid request ID');next();};
export function leaveRoutes(secret) {
 const router=Router();
 router.use(authenticate(secret));
 router.get('/leaves',roles('student','warden'),async(req,res)=>{
 const filter={...scope(req),...(req.user.role==='student'?{student:req.user._id}:{})};
 const leaves=await Leave.find(filter).populate('student',studentFields).sort({createdAt:-1}).limit(300);
 res.json({leaves});
 });
 router.post('/leaves',roles('student'),async(req,res)=>{
 const {destination,reason,departure,returnBy}=req.body||{};
 const start=new Date(departure),end=new Date(returnBy);
 if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||start<=new Date()||end<=start||end-start>30*86400000) throw fail(400,'Choose a future departure and a later return within 30 days');
 const values={isDemo:Boolean(req.user.isDemo),student:req.user._id,destination:cleanText(destination,3,160,'Destination'),reason:cleanText(reason,5,1000,'Reason'),departure:start,returnBy:end};
 const leave=req.user.isDemo?await createDemoLeave(values):await Leave.create(values);
 res.status(201).json({leave});
 });
 router.patch('/leaves/:id/decision',roles('warden'),validId,async(req,res)=>{
 const {decision,note=''}=req.body||{};
 if(!['approved','rejected'].includes(decision)) throw fail(400,'Choose approved or rejected');
 if(typeof note!=='string'||note.trim().length>500)throw fail(400,'Decision note must be at most 500 characters');
 if(decision==='rejected'&&!note.trim())throw fail(400,'Provide a reason for rejection');
 const token=decision==='approved'?randomBytes(32).toString('base64url'):undefined;
 const update={status:decision,decisionNote:note.trim(),decidedBy:req.user._id,decidedAt:new Date()};
 if(token){update.passToken=token;update.passHash=hashToken(token);}
 const leave=await Leave.findOneAndUpdate({...scope(req),_id:req.params.id,status:'pending',returnBy:{$gt:new Date()}},{$set:update,...(decision==='rejected'?{$unset:{demoActiveKey:1}}:{})},{returnDocument:'after'}).populate('student',studentFields);
 if(!leave) throw fail(409,'Request is missing, expired, or already reviewed');
 res.json({leave});
 });
 router.get('/leaves/:id/pass',roles('student'),validId,async(req,res)=>{
 const leave=await Leave.findOne({...scope(req),_id:req.params.id,student:req.user._id}).select('+passToken');
 if(!leave)throw fail(404,'Request not found');
 if(!['approved','checked_out'].includes(leave.status)||!leave.passToken)throw fail(409,'No active QR pass for this request');
 res.set('Cache-Control','no-store');
 res.json({token:leave.passToken,qr:await QRCode.toDataURL(leave.passToken,{width:320,margin:2}),leave});
 });
 router.get('/stats',roles('warden'),async(req,res)=>{
 const groups=await Leave.aggregate([{$match:scope(req)},{$group:{_id:'$status',count:{$sum:1}}}]);
 const stats={total:0,pending:0,approved:0,rejected:0,checked_out:0,returned:0};
 for(const g of groups){stats[g._id]=g.count;stats.total+=g.count;}
 res.json({stats});
 });
 const readToken=req=>{
 const token=req.body?.token;
 if(typeof token!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(token))throw fail(400,'Invalid pass token');
 return hashToken(token);
 };
 router.post('/gate/validate',roles('guard'),async(req,res)=>{
 const leave=await Leave.findOne({...scope(req),passHash:readToken(req)}).select(gateSelect).populate('student',gateStudentFields);
 if(!leave)throw fail(404,'Pass not found');
 if(!['approved','checked_out'].includes(leave.status))throw fail(409,'Pass has already been used or is inactive');
 const now=new Date();
 if(leave.status==='approved'&&(now<leave.departure||now>leave.returnBy))throw fail(409,'Pass is outside its checkout window');
 res.json({leave,nextAction:leave.status==='approved'?'checkout':'return',overdue:now>leave.returnBy});
 });
 router.post('/gate/record',roles('guard'),async(req,res)=>{
 const hash=readToken(req),action=req.body.action,now=new Date();
 if(!['checkout','return'].includes(action))throw fail(400,'Choose checkout or return');
 const filter={...scope(req),passHash:hash,status:action==='checkout'?'approved':'checked_out'};
 if(action==='checkout'){filter.departure={$lte:now};filter.returnBy={$gte:now};}
 const update=action==='checkout'?{status:'checked_out',checkedOutAt:now,checkoutGuard:req.user._id}:{status:'returned',returnedAt:now,returnGuard:req.user._id};
 const leave=await Leave.findOneAndUpdate(filter,{$set:update,...(action==='return'?{$unset:{demoActiveKey:1}}:{})},{returnDocument:'after'}).select(gateSelect).populate('student',gateStudentFields);
 if(!leave)throw fail(409,'Scan rejected: invalid, duplicate, expired, or wrong action. Validate the pass again.');
 res.json({leave,message:action==='checkout'?'Checkout recorded':'Return recorded'});
 });
 router.get('/gate/history',roles('guard'),async(req,res)=>{
 const leaves=await Leave.find({...scope(req),status:{$in:['checked_out','returned']}}).select(gateSelect).populate('student',gateStudentFields).sort({updatedAt:-1}).limit(50);
 res.json({leaves});
 });
 return router;
}
