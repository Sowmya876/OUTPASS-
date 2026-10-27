import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {MongoMemoryServer} from 'mongodb-memory-server';
import {createServer} from 'vite';
import viteConfig from '../../client/vite.config.js';
import {createApp,errors} from '../src/app.js';
import {User} from '../src/models.js';

let mongo,backend,vite,origin,password,clientApi;
before(async()=>{
 mongo=await MongoMemoryServer.create();await mongoose.connect(mongo.getUri());
 const app=createApp({secret:randomBytes(48).toString('hex'),origin:'http://localhost:5173'});errors(app);
 backend=app.listen(0,'127.0.0.1');await new Promise(resolve=>backend.once('listening',resolve));
 assert.equal(viteConfig.server.proxy['/api'],'http://127.0.0.1:5000');
 vite=await createServer({...viteConfig,configFile:false,root:fileURLToPath(new URL('../../client',import.meta.url)),server:{...viteConfig.server,host:'127.0.0.1',port:0,open:false,proxy:{'/api':'http://127.0.0.1:'+backend.address().port}}});
 await vite.listen();origin='http://127.0.0.1:'+vite.httpServer.address().port;
 clientApi=(await vite.ssrLoadModule('/src/api.js')).api;
 password=randomBytes(18).toString('hex');
 for(const role of ['student','warden','admin','guard'])await User.create({name:'Proxy Test '+role,email:role+'@proxy.example',role,password:await bcrypt.hash(password,4)});
});
after(async()=>{await vite?.close();if(backend)await new Promise(resolve=>backend.close(resolve));await mongoose.disconnect();await mongo?.stop();});
const login=role=>fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:role+'@proxy.example',password})});

test('real Vite proxy returns JSON login and usable bearer sessions for all four roles',async()=>{
 const page=await fetch(origin+'/login');assert.equal(page.status,200);assert.match(page.headers.get('content-type'),/text\/html/);
 for(const role of ['student','warden','admin','guard']){
 const response=await login(role);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/application\/json/);assert.equal(response.headers.get('cache-control'),'no-store');
 const body=await response.json();assert.equal(body.user.role,role);assert.equal(body.user.requiresPasswordChange,false);assert.equal(typeof body.token,'string');assert.equal(body.user.password,undefined);
 const me=await fetch(origin+'/api/auth/me',{headers:{Authorization:'Bearer '+body.token}});assert.equal(me.status,200);assert.equal((await me.json()).user.role,role);
 }
 const rejected=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'missing@proxy.example',password})});
 assert.equal(rejected.status,401);assert.match(rejected.headers.get('content-type'),/application\/json/);
});

test('database outage returns 503 JSON through Vite and the same HTTP service recovers after reconnect',async()=>{
 await mongoose.disconnect();
 try{
 const health=await fetch(origin+'/api/health');assert.equal(health.status,503);assert.deepEqual(await health.json(),{status:'unavailable'});
 const unavailable=await login('student');assert.equal(unavailable.status,503);assert.match(unavailable.headers.get('content-type'),/application\/json/);assert.equal(unavailable.headers.get('retry-after'),'5');
 assert.match((await unavailable.json()).message,/Database connection unavailable/);
 }finally{await mongoose.connect(mongo.getUri());}
 assert.equal((await login('student')).status,200);
});

test('shared React API client handles proxy login and rejects HTML or empty success responses',async()=>{
 const originalFetch=globalThis.fetch;
 try{
 globalThis.fetch=(url,options)=>originalFetch(new URL(url,origin),options);
 for(const role of ['student','warden','admin']){
 const result=await clientApi('/auth/login',{method:'POST',body:JSON.stringify({email:role+'@proxy.example',password})});
 assert.equal(result.user.role,role);assert.equal(typeof result.token,'string');
 }
 for(const body of ['<!doctype html><html></html>','']){
 globalThis.fetch=async()=>new Response(body,{status:200,headers:{'Content-Type':'text/html'}});
 await assert.rejects(()=>clientApi('/auth/login'),/API returned an invalid response/);
 }
 }finally{globalThis.fetch=originalFetch;}
});
