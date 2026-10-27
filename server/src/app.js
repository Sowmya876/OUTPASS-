import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import {rateLimit} from 'express-rate-limit';
import bcrypt from 'bcryptjs';

import mongoose from 'mongoose';
import {User} from './models.js';
import {leaveRoutes} from './leaves.js';
import {onboardingRoutes} from './onboarding.js';
import {authenticate,publicUser,fail,issueSession} from './auth.js';
import {assertDemoDatabase,professorDemoRoutes} from './professor-demo.js';
export function createApp(settings) {
 assertDemoDatabase(settings);
 const app=express();
 app.set('trust proxy',settings.trustProxyHops||false);
 app.locals.demoMode=Boolean(settings.demoMode);
 app.locals.demoReady=!settings.demoMode;
 app.use(helmet(),cors({origin:settings.origin}),express.json({limit:'16kb'}));
 app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');next();});
 app.get('/api/health',(req,res)=>res.status(mongoose.connection.readyState===1&&app.locals.demoReady?200:503).json({status:mongoose.connection.readyState===1&&app.locals.demoReady?'ok':'unavailable'}));
 app.use('/api',(req,res,next)=>{
 if(mongoose.connection.readyState!==1||!app.locals.demoReady)return res.status(503).set('Retry-After','5').json({message:'Database connection unavailable. Please try again shortly.'});
 next();
 });
 app.post('/api/auth/login',rateLimit({windowMs:15*60*1000,limit:30,message:{message:'Too many login attempts. Try again in 15 minutes.'},standardHeaders:'draft-8',legacyHeaders:false}),async(req,res)=>{
 const {email,password}=req.body||{};
 if(typeof email!=='string'||typeof password!=='string'||email.length>200||password.length>128) throw fail(400,'Enter a valid email and password');
 const user=await User.findOne({email:email.trim().toLowerCase()}).select('+password');
 if(!user||user.isDemo||settings.demoMode||!await bcrypt.compare(password,user.password)) throw fail(401,'Invalid email or password');
 const token=issueSession(user,settings.secret);
 res.json({token,user:publicUser(user)});
 });
 app.get('/api/auth/me',authenticate(settings.secret,{allowRestricted:true}),(req,res)=>res.json({user:publicUser(req.user)}));
 app.use('/api',professorDemoRoutes(settings));
 if(settings.demoMode)app.use('/api',rateLimit({windowMs:15*60000,limit:180,standardHeaders:'draft-8',legacyHeaders:false,message:{message:'Demo activity limit reached. Please try later.'}}),(req,res,next)=>{
 if(req.path.startsWith('/auth/')||req.path.startsWith('/admin/')&&(req.method!=='GET'||req.path!=='/admin/students'))throw fail(403,'Professor demo Admin is read-only; account and security changes are disabled');
 next();
 });
 app.use('/api',onboardingRoutes(settings));
 app.use('/api',leaveRoutes(settings.secret));
 return app;
}
export function errors(app) {
 app.use((req,res)=>res.status(404).json({message:'Route not found'}));
 app.use((err,req,res,next)=>{
 const status=err.status||(err.name==='ValidationError'||err.name==='CastError'?400:err.code===11000?409:500);
 res.status(status).json({message:status>=500?'Server error. Please try again.':err.code===11000?'An account already exists for this email':err.message});
 });
}
