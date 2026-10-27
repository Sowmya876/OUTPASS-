import {test,before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import {MongoMemoryServer} from 'mongodb-memory-server';
import {createApp,errors} from '../src/app.js';
import {prepareProfessorDemo} from '../src/professor-demo.js';
import {User,Leave} from '../src/models.js';
let mongo,app,settings,student;
before(async()=>{
 mongo=await MongoMemoryServer.create();await mongoose.connect(mongo.getUri(),{dbName:'outpass_professor_demo_capacity'});
 settings={demoMode:true,deploymentEnvironment:'demo',uri:mongo.getUri('outpass_professor_demo_capacity'),secret:randomBytes(48).toString('hex'),origin:'http://localhost:5173'};
 await prepareProfessorDemo(settings);student=await User.findOne({role:'student',isDemo:true});
});
beforeEach(async()=>{
 // Only this suite's isolated temporary database is cleared between fixtures.
 await Leave.deleteMany({});app=createApp(settings);app.locals.demoReady=true;errors(app);
});
after(async()=>{await mongoose.disconnect();await mongo?.stop();});
const call=(method,path,token,body)=>{const r=request(app)[method]('/api'+path);if(token)r.set('Authorization','Bearer '+token);return body?r.send(body):r;};
async function login(role,token){const r=await call('post','/auth/demo',token,{role});assert.equal(r.status,200);assert.equal(r.body.user.role,role);return r.body.token;}
const input=()=>({destination:'Fictional test library',reason:'Isolated capacity verification',departure:new Date(Date.now()+10000).toISOString(),returnBy:new Date(Date.now()+3600000).toISOString()});
async function historical(count){await Leave.insertMany(Array.from({length:count},()=>({...input(),student:student._id,isDemo:true,status:'returned'})));}

test('all demo roles authenticate and switch at capacity without creating or changing any leave',async()=>{
 await historical(200);const before=JSON.stringify(await Leave.find().sort({_id:1}).lean());let token;
 for(const role of ['student','warden','guard','admin','student']){
 const previous=token;token=await login(role,token);
 if(previous)assert.equal((await call('get','/auth/me',previous)).status,401);
 const status=await call('get','/demo/status',token);assert.equal(status.status,200);assert.equal(status.body.atCapacity,true);assert.match(status.body.message,/still sign in, switch roles/);
 }
 assert.equal((await call('post','/demo/request',token)).status,429);
 const denied=await call('post','/leaves',token,input());assert.equal(denied.status,429);assert.match(denied.body.message,/finish existing requests/);
 assert.equal(JSON.stringify(await Leave.find().sort({_id:1}).lean()),before);
});
test('concurrent manual submissions can claim only the last available quota slot',async()=>{
 await historical(199);const token=await login('student');
 const results=await Promise.all(Array.from({length:12},()=>call('post','/leaves',token,input())));
 assert.equal(results.filter(r=>r.status===201).length,1);assert.equal(results.filter(r=>r.status===429).length,11);
 assert.equal(await Leave.countDocuments({isDemo:true}),200);
 assert.equal(await Leave.countDocuments({demoQuotaSlot:199}),1);
 assert.equal((await call('post','/demo/request',token)).status,429);
 await login('admin',token);
});
test('concurrent sample preparation is idempotent and shares quota with manual requests',async()=>{
 await historical(199);const token=await login('student');
 const results=await Promise.all(Array.from({length:8},()=>call('post','/demo/request',token)));
 assert.ok(results.every(r=>r.status===200));assert.equal(results.filter(r=>r.body.created).length,1);
 assert.equal(new Set(results.map(r=>r.body.leave._id)).size,1);assert.equal(await Leave.countDocuments(),200);
 assert.equal((await call('post','/leaves',token,input())).status,429);
 const admin=await login('admin',token);assert.equal((await call('post','/demo/request',admin)).status,403);
});
test('manual and automatic creation compete atomically for the same last slot',async()=>{
 await historical(199);const token=await login('student');
 const results=await Promise.all([call('post','/leaves',token,input()),call('post','/demo/request',token)]);
 assert.equal(results.filter(r=>[200,201].includes(r.status)).length,1);assert.equal(results.filter(r=>r.status===429).length,1);assert.equal(await Leave.countDocuments(),200);
});
test('approval, rejection, QR validation, checkout and return continue at capacity',async()=>{
 await historical(199);let token=await login('student');const prepared=await call('post','/demo/request',token);assert.equal(prepared.status,200);const id=prepared.body.leave._id;
 token=await login('warden',token);assert.equal((await call('patch','/leaves/'+id+'/decision',token,{decision:'approved'})).status,200);
 token=await login('student',token);const pass=await call('get','/leaves/'+id+'/pass',token);assert.equal(pass.status,200);assert.match(pass.body.qr,/^data:image\/png;base64,/);
 token=await login('guard',token);const qr=pass.body.token;assert.equal((await call('post','/gate/validate',token,{token:qr})).body.nextAction,'checkout');
 assert.equal((await call('post','/gate/record',token,{token:qr,action:'return'})).status,409);
 assert.equal((await call('post','/gate/record',token,{token:qr,action:'checkout'})).status,200);
 assert.equal((await call('post','/gate/record',token,{token:qr,action:'checkout'})).status,409);
 assert.equal((await call('post','/gate/validate',token,{token:qr})).body.nextAction,'return');
 assert.equal((await call('post','/gate/record',token,{token:qr,action:'return'})).status,200);
 token=await login('student',token);assert.equal((await call('get','/leaves',token)).body.leaves.find(l=>l._id===id).status,'returned');
 token=await login('admin',token);assert.equal((await call('get','/admin/students',token)).status,200);assert.equal((await call('post','/admin/students',token,{})).status,403);
 // Reject a separate already-existing fictional request without deleting any fixture.
 const pending=await Leave.findOneAndUpdate({isDemo:true,status:'returned',_id:{$ne:id}},{$set:{status:'pending'}},{returnDocument:'after'});
 token=await login('warden',token);assert.equal((await call('patch','/leaves/'+pending.id+'/decision',token,{decision:'rejected',note:'Fictional rejection test'})).status,200);
 assert.equal(await Leave.countDocuments(),200);
});
test('mixed historical and numbered records still enforce capacity under concurrency',async()=>{
 const token=await login('student');assert.equal((await call('post','/leaves',token,input())).status,201);
 await historical(198);
 const results=await Promise.all(Array.from({length:8},()=>call('post','/leaves',token,input())));
 assert.equal(results.filter(r=>r.status===201).length,1);assert.equal(results.filter(r=>r.status===429).length,7);assert.equal(await Leave.countDocuments(),200);
});
test('validation failures consume no quota slots',async()=>{
 const token=await login('student');assert.equal((await call('post','/leaves',token,{...input(),destination:'x'})).status,400);assert.equal(await Leave.countDocuments(),0);
});
