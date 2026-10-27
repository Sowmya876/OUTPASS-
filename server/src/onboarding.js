import {Router} from 'express';
import {randomBytes,createHash} from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import {rateLimit} from 'express-rate-limit';
import {parse} from 'csv-parse/sync';
import {User,MailPreview} from './models.js';
import {authenticate,roles,fail,publicUser,issueSession} from './auth.js';
import {deliverInvitation,unseal} from './mail.js';
const digest=token=>createHash('sha256').update(token).digest('hex');
const domainOf=settings=>(settings.allowedStudentEmailDomain||'sst.scaler.com').trim().toLowerCase().replace(/^@/,'');
const trim=(value,min,max,label)=>{
 if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)throw fail(400,label+' must be '+min+' to '+max+' characters');
 return value.trim();
};
export function studentInput(body,settings){
 const email=trim(body.email,5,200,'Email').toLowerCase();
 if(!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+$/i.test(email)||email.split('@')[1]!==domainOf(settings))throw fail(400,'Use an official @'+domainOf(settings)+' email address');
 return {name:trim(body.name,2,100,'Name'),email,rollNumber:trim(body.rollNumber,1,40,'Student ID'),hostel:trim(body.hostel,1,80,'Hostel'),room:trim(body.room,1,30,'Room')};
}
export function validatePassword(password){
 if(typeof password!=='string'||password.length<12||Buffer.byteLength(password,'utf8')>72)throw fail(400,'Use a password of at least 12 characters and at most 72 UTF-8 bytes');
 return password;
}
export async function sendLink(user,kind,settings){
 const token=randomBytes(32).toString('base64url');
 const expires=new Date(Date.now()+(kind==='activation'?24*60:30)*60000);
 const updated=await User.findOneAndUpdate({_id:user._id,...(kind==='activation'?{requiresPasswordChange:true}:{})},{$set:{accessTokenHash:digest(token),accessTokenExpires:expires,accessTokenKind:kind}},{returnDocument:'after'});
 if(!updated)throw fail(409,'Account is already active');
 const preview=await deliverInvitation(updated,token,kind,settings);
 await User.updateOne({_id:user._id,accessTokenHash:digest(token)},{$set:{invitationStatus:preview.status,invitedAt:new Date()}});
 return preview;
}
export async function provisionStudent(body,settings){
 const values=studentInput(body,settings);
 if(await User.exists({email:values.email}))throw fail(409,'An account already exists for this email');
 // Independent 256-bit bootstrap password is hashed immediately and discarded.
 // Activation links are used instead of distributing plaintext passwords.
 const password=await bcrypt.hash(randomBytes(32).toString('base64url'),12);
 const user=await User.create({...values,role:'student',password,requiresPasswordChange:true,invitationStatus:'pending'});
 try{await sendLink(user,'activation',settings);}catch{await User.updateOne({_id:user._id},{$set:{invitationStatus:'failed'}});}
 return User.findById(user._id);
}
export const studentSummary=user=>({...publicUser(user),invitationStatus:user.invitationStatus||'not_required',invitedAt:user.invitedAt,activationExpiresAt:user.requiresPasswordChange?user.accessTokenExpires:undefined});
const limit=(count)=>rateLimit({windowMs:15*60*1000,limit:count,standardHeaders:'draft-8',legacyHeaders:false,message:{message:'Too many attempts. Please try again later.'}});
export function onboardingRoutes(settings){
 const router=Router();
 router.get('/onboarding/info',(req,res)=>res.json({allowedDomain:domainOf(settings),deliveryMode:settings.emailDeliveryEnabled?'restricted_email':'test_preview'}));
 router.post('/auth/forgot-password',limit(5),async(req,res)=>{
 const email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'';
 const generic={message:'If this account exists, recovery instructions will be prepared through the configured delivery channel. In test mode, contact your administrator.'};
 res.json(generic);
 // Respond before account lookup/delivery to avoid public account-enumeration timing.
 if(email.length<=200){
 try{const user=await User.findOne({email});
 if(user)await sendLink(user,user.requiresPasswordChange?'activation':'reset',settings);
 }catch{/* Public response already sent; no account details or secrets logged. */}
 }
 });
 router.post('/auth/activate',limit(15),async(req,res)=>{
 const {token,password}=req.body||{};
 if(typeof token!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(token))throw fail(400,'Activation or reset link is invalid or expired');
 validatePassword(password);
 const hash=await bcrypt.hash(password,12),now=new Date();
 const user=await User.findOneAndUpdate({accessTokenHash:digest(token),accessTokenExpires:{$gt:now},accessTokenKind:{$in:['activation','reset']}},{$set:{password:hash,requiresPasswordChange:false,activatedAt:now,invitationStatus:'activated'},$inc:{tokenVersion:1},$unset:{accessTokenHash:1,accessTokenExpires:1,accessTokenKind:1}},{returnDocument:'after'});
 if(!user)throw fail(400,'Activation or reset link is invalid or expired');
 await MailPreview.updateMany({user:user._id,expiresAt:{$gt:now}},{$set:{expiresAt:now}});
 res.json({message:'Password set. Sign in with your new password.'});
 });
 router.post('/auth/change-password',limit(10),authenticate(settings.secret,{allowRestricted:true}),async(req,res)=>{
 const {currentPassword,password}=req.body||{};
 validatePassword(password);
 if(typeof currentPassword!=='string'||currentPassword.length>128)throw fail(400,'Enter your current password');
 const user=await User.findById(req.user._id).select('+password');
 if(!await bcrypt.compare(currentPassword,user.password))throw fail(400,'Current password is incorrect');
 if(await bcrypt.compare(password,user.password))throw fail(400,'Choose a different password');
 const hashed=await bcrypt.hash(password,12);
 const updated=await User.findOneAndUpdate({_id:user._id,password:user.password,$or:[{tokenVersion:user.tokenVersion||0},...(!user.tokenVersion?[{tokenVersion:{$exists:false}}]:[])]},{$set:{password:hashed,requiresPasswordChange:false,activatedAt:new Date(),invitationStatus:'activated'},$inc:{tokenVersion:1},$unset:{accessTokenHash:1,accessTokenExpires:1,accessTokenKind:1}},{returnDocument:'after'});
 if(!updated)throw fail(409,'Account changed. Please sign in again');
 await MailPreview.updateMany({user:user._id,expiresAt:{$gt:new Date()}},{$set:{expiresAt:new Date()}});
 res.json({user:publicUser(updated),token:issueSession(updated,settings.secret)});
 });
 router.use('/admin',authenticate(settings.secret),roles('admin'));
 router.get('/admin/students',async(req,res)=>{
 const users=await User.find({role:'student',isDemo:req.user.isDemo?true:{$ne:true}}).sort({createdAt:-1}).limit(500);
 res.json({students:users.map(studentSummary),allowedDomain:domainOf(settings),deliveryMode:settings.emailDeliveryEnabled?'restricted_email':'test_preview'});
 });
 router.post('/admin/students',limit(50),async(req,res)=>{
 const user=await provisionStudent(req.body||{},settings);
 res.status(201).json({student:studentSummary(user)});
 });
 router.post('/admin/students/import',limit(15),async(req,res)=>{
 const csv=req.body?.csv;
 if(typeof csv!=='string'||csv.length>14000)throw fail(400,'Upload a CSV of at most 14,000 characters and 50 students');
 let rows;
 try{rows=parse(csv,{columns:headers=>headers.map(x=>x.trim()),skip_empty_lines:true,trim:true,bom:true,max_record_size:2000});}catch{throw fail(400,'Invalid CSV. Use headers name,email,rollNumber,hostel,room');}
 if(!rows.length||rows.length>50)throw fail(400,'Import 1 to 50 students at a time');
 const normalized=[],issues=[],seen=new Set();
 for(let i=0;i<rows.length;i++){
 try{const row=studentInput(rows[i],settings);if(seen.has(row.email))throw fail(400,'Duplicate email within CSV');seen.add(row.email);normalized.push({row,line:i+2});}catch(e){issues.push({line:i+2,message:e.message});}
 }
 const duplicates=await User.find({email:{$in:normalized.map(x=>x.row.email)}}).select('email');
 const existing=new Set(duplicates.map(x=>x.email));
 for(const item of normalized)if(existing.has(item.row.email))issues.push({line:item.line,message:'Account already exists'});
 if(issues.length)return res.status(400).json({message:'No students imported. Correct the listed rows and retry.',issues});
 const results=[];
 for(const item of normalized){try{const user=await provisionStudent(item.row,settings);results.push({line:item.line,created:true,id:user.id,invitationStatus:user.invitationStatus});}catch(e){results.push({line:item.line,created:false,message:e.code===11000?'Account already exists':e.status?e.message:'Could not create this account'});}}
 res.status(201).json({results,created:results.filter(x=>x.created).length,message:'Import complete. Review per-row results; successful rows are retained.'});
 });
 const validId=(req,res,next)=>{if(!mongoose.isValidObjectId(req.params.id))throw fail(400,'Invalid student ID');next();};
 router.post('/admin/students/:id/invitation',validId,async(req,res)=>{
 const user=await User.findOne({_id:req.params.id,role:'student'});
 if(!user)throw fail(404,'Student not found');
 if(!user.requiresPasswordChange)throw fail(409,'Student is already active. Use password recovery if needed.');
 await sendLink(user,'activation',settings);
 res.json({message:'New invitation prepared. Older activation links no longer work.'});
 });
 router.get('/admin/students/:id/invitation',validId,async(req,res)=>{
 const user=await User.findOne({_id:req.params.id,role:'student'});
 if(!user)throw fail(404,'Student not found');
 const preview=await MailPreview.findOne({user:user._id,expiresAt:{$gt:new Date()}}).sort({createdAt:-1}).select('+encrypted');
 if(!preview)throw fail(404,'No unexpired email preview. Prepare a new invitation or request recovery.');
 res.set('Cache-Control','no-store');
 const mail=unseal(preview.encrypted,settings.secret);
 res.json({mail,status:preview.status,kind:preview.kind,expiresAt:preview.expiresAt});
 });
 return router;
}
