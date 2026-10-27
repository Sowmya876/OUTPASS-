import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import mongoose from 'mongoose';
import {config} from './config.js';
import {Leave} from './models.js';
import {prepareLocalDemo} from './prepare-local-demo.js';
const settings=config();
if(settings.databaseMode!=='local')throw Error('Demo setup is allowed only in explicit local database mode');
const base='http://127.0.0.1:5173/api',sessions={};
async function api(path,body,token,method='POST'){
 const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();if(!response.ok)throw Error('Demo API check failed: '+path+' (HTTP '+response.status+')');return data;
}
try{
 await mongoose.connect(settings.uri,{serverSelectionTimeoutMS:5000});
 await mongoose.connection.db.command({ping:1});
 console.log('Authenticated persistent local database ping passed.');
 const ignore=fs.readFileSync(new URL('../../.gitignore',import.meta.url),'utf8');
 if(!ignore.split(/\r?\n/).includes('DEMO_LOGIN_CREDENTIALS.txt'))throw Error('Credential filename must be gitignored before setup');
 const entries=await prepareLocalDemo(settings,fileURLToPath(new URL('../../DEMO_LOGIN_CREDENTIALS.txt',import.meta.url)));
 for(const {role,email,password} of entries){
 const login=await api('/auth/login',{email,password});assert.equal(login.user.role,role);assert.equal(login.user.requiresPasswordChange,false);
 const me=await api('/auth/me',null,login.token,'GET');assert.equal(me.user.role,role);sessions[role]=login.token;
 console.log(role+' activated demo account, API login and authenticated session passed.');
 }
 if(['student','warden','guard'].every(role=>sessions[role])){
 const departure=new Date(Date.now()+1500),returnBy=new Date(Date.now()+3600000);
 const submitted=await api('/leaves',{destination:'Fictional demo library',reason:'Local demonstration workflow verification',departure,returnBy},sessions.student);
 const id=submitted.leave._id;
 await api('/leaves/'+id+'/decision',{decision:'approved',note:'Fictional local demonstration'},sessions.warden,'PATCH');
 const pass=await api('/leaves/'+id+'/pass',null,sessions.student,'GET');assert.match(pass.qr,/^data:image\/png;base64,/);
 await delay(Math.max(0,departure.getTime()-Date.now()+100));
 assert.equal((await api('/gate/validate',{token:pass.token},sessions.guard)).nextAction,'checkout');
 await api('/gate/record',{token:pass.token,action:'checkout'},sessions.guard);
 let own=await api('/leaves',null,sessions.student,'GET');assert.equal(own.leaves.find(l=>l._id===id).status,'checked_out');
 assert.equal((await api('/gate/validate',{token:pass.token},sessions.guard)).nextAction,'return');
 await api('/gate/record',{token:pass.token,action:'return'},sessions.guard);
 own=await api('/leaves',null,sessions.student,'GET');const complete=own.leaves.find(l=>l._id===id);assert.equal(complete.status,'returned');assert.ok(complete.checkedOutAt&&complete.returnedAt);
 await mongoose.disconnect();await mongoose.connect(settings.uri,{serverSelectionTimeoutMS:5000});
 assert.equal((await Leave.findById(id)).status,'returned');
 console.log('Vite -> API -> persistent MongoDB: request, approval, QR, checkout, return, student history and reconnect persistence all passed.');
 }
 if(sessions.admin){const list=await api('/admin/students',null,sessions.admin,'GET');assert.ok(list.students.length);console.log('Admin dashboard API passed.');}
 console.log('Ready for immediate login. Private credentials: DEMO_LOGIN_CREDENTIALS.txt in the project root. No activation needed.');
}catch(error){console.error(error.message.startsWith('Demo API')?error.message:'Local demo verification failed; no credentials logged.');process.exitCode=1;}
finally{await mongoose.disconnect();}
