import fs from 'node:fs';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {User,MailPreview} from './models.js';

export function assertLocalDemo(settings){
 let uri;try{uri=new URL(settings.uri);}catch{throw Error('Local demo database URI is invalid');}
 if(process.env.NODE_ENV==='production'||settings.databaseMode!=='local'||uri.protocol!=='mongodb:'||!['127.0.0.1','localhost','[::1]'].includes(uri.hostname)||uri.pathname!=='/outpass_local_demo')throw Error('Demo repair requires development local mode and the loopback outpass_local_demo database');
 if(mongoose.connection.readyState!==1||mongoose.connection.name!=='outpass_local_demo')throw Error('Connect to the persistent local demo database before repair');
}
export async function prepareLocalDemo(settings,credentialPath){
 assertLocalDemo(settings);
 const entries=[];
 for(const role of ['student','warden','guard','admin']){
 const email=role+'@outpass.demo',password=randomBytes(24).toString('base64url'),now=new Date();
 const user=await User.findOneAndUpdate({email},{$set:{role,password:await bcrypt.hash(password,12),requiresPasswordChange:false,activatedAt:now,invitationStatus:'activated'},$setOnInsert:{name:'Fictional Demo '+role,...(role==='student'?{rollNumber:'DEMO-001',hostel:'Demo Hostel',room:'D-01'}:{})},$inc:{tokenVersion:1},$unset:{accessTokenHash:1,accessTokenExpires:1,accessTokenKind:1}},{upsert:true,returnDocument:'after',runValidators:true});
 await MailPreview.updateMany({user:user._id,expiresAt:{$gt:now}},{$set:{expiresAt:now}});
 entries.push({role,email,password,id:user.id});
 }
 // This private plaintext file is explicitly requested for fictional LOCAL demos.
 // Production accounts, app authentication, and Atlas are never altered here.
 const fd=fs.openSync(credentialPath,'w',0o600);
 try{
 if(process.platform==='win32'){
 const name=process.env.USERNAME||os.userInfo().username,account=process.env.USERDOMAIN?process.env.USERDOMAIN+'\\'+name:name;
 execFileSync('icacls.exe',[String(credentialPath),'/inheritance:r','/grant:r',account+':(F)'],{stdio:'ignore',windowsHide:true});
 }
 fs.writeFileSync(fd,'OUTPASS - PRIVATE LOCAL FICTIONAL DEMO ACCOUNTS\nLogin: http://localhost:5173/login\nDatabase: persistent local outpass_local_demo only\nNo activation required. Keep this file private and out of Git.\nRerunning npm run demo:local rotates these passwords and signs out older sessions.\n\n'+entries.map(e=>e.role.toUpperCase()+'\nEmail: '+e.email+'\nPassword: '+e.password+'\n').join('\n'));
 }finally{fs.closeSync(fd);}
 return entries;
}
