import jwt from 'jsonwebtoken';
import {User,DemoSession} from './models.js';
export const fail=(status,message)=>Object.assign(new Error(message),{status});
export const issueSession=(user,secret,extra={})=>jwt.sign({role:user.role,version:user.tokenVersion||0,...extra},secret,{subject:user.id,expiresIn:user.isDemo?'30m':'8h',algorithm:'HS256',issuer:'outpass',audience:'outpass-web'});
export function authenticate(secret,{allowRestricted=false}={}) {return async(req,res,next)=>{
 const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
 if(!token) throw fail(401,'Please log in');
 let payload;
 try {payload=jwt.verify(token,secret,{algorithms:['HS256'],issuer:'outpass',audience:'outpass-web'});req.user=await User.findById(payload.sub);} catch {throw fail(401,'Session expired. Please log in again');}
 if(!req.user||(payload.version||0)!==(req.user.tokenVersion||0)) throw fail(401,'Session expired. Please log in again');
 if(req.user.isDemo){
 if(!req.app.locals.demoMode||!payload.demoSession)throw fail(401,'Demo session unavailable');
 const session=await DemoSession.exists({_id:payload.demoSession,user:req.user._id,version:payload.demoVersion,expiresAt:{$gt:new Date()}});
 if(!session)throw fail(401,'Demo role changed or session expired');
 req.demoSession=payload.demoSession;req.demoVersion=payload.demoVersion;
 }else if(req.app.locals.demoMode)throw fail(403,'This deployment accepts fictional demo accounts only');
 if(req.user.requiresPasswordChange&&!allowRestricted)throw fail(403,'Set a new password before accessing your workspace');
 next();
};}
export const roles=(...allowed)=>(req,res,next)=>{if(!allowed.includes(req.user.role)) throw fail(403,'You do not have access to this action');next();};
export const publicUser=u=>({id:u.id,name:u.name,email:u.email,role:u.role,rollNumber:u.rollNumber,hostel:u.hostel,room:u.room,requiresPasswordChange:Boolean(u.requiresPasswordChange),activatedAt:u.activatedAt,isDemo:Boolean(u.isDemo)});
