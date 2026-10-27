import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import {MongoMemoryServer} from 'mongodb-memory-server';
import {createApp,errors} from '../src/app.js';
import {prepareProfessorDemo,assertDemoDatabase} from '../src/professor-demo.js';
import {User,Leave} from '../src/models.js';
let mongo,settings,app;
before(async()=>{
 mongo=await MongoMemoryServer.create();await mongoose.connect(mongo.getUri(),{dbName:'outpass_professor_demo'});
 settings={demoMode:true,deploymentEnvironment:'demo',uri:mongo.getUri('outpass_professor_demo'),productionUri:'mongodb://127.0.0.1/normal',secret:randomBytes(48).toString('hex'),origin:'http://localhost:5173'};
 await prepareProfessorDemo(settings);app=createApp(settings);app.locals.demoReady=true;errors(app);
});
after(async()=>{await mongoose.disconnect();await mongo?.stop();});
const call=(method,path,token,body)=>{const r=request(app)[method]('/api'+path);if(token)r.set('Authorization','Bearer '+token);return body?r.send(body):r;};
async function role(role,token){const r=await call('post','/auth/demo',token,{role});assert.equal(r.status,200);assert.equal(r.body.user.role,role);assert.equal(r.body.user.isDemo,true);assert.equal(r.body.user.requiresPasswordChange,false);return r.body.token;}
test('disabled by default, dedicated database guards and idempotent fictional setup',async()=>{
 const normal=createApp({...settings,demoMode:false});errors(normal);
 assert.equal((await request(normal).post('/api/auth/demo').send({role:'admin'})).status,404);
 assert.equal((await request(normal).get('/api/demo/info')).body.enabled,false);
 for(const invalid of [{...settings,deploymentEnvironment:'production'},{...settings,uri:mongo.getUri('normal')},{...settings,productionUri:mongo.getUri('outpass_professor_demo')}])assert.throws(()=>assertDemoDatabase(invalid));
 const ids=(await User.find({isDemo:true}).select('+password')).map(u=>({id:u.id,password:u.password}));await prepareProfessorDemo(settings);
 assert.equal(await User.countDocuments(),4);for(const u of ids)assert.ok((await User.findById(u.id).select('+password')).password===u.password);
 const early=createApp(settings);errors(early);assert.equal((await request(early).get('/api/health')).status,503);
});
test('all role logins, atomic role replacement, shared request, QR, checkout, return and logout',async()=>{
 let token=await role('student');const first=token;
 assert.equal(await Leave.countDocuments(),0);
 assert.equal((await call('post','/demo/request',token)).status,200);
 let leaves=(await call('get','/leaves',token)).body.leaves;assert.equal(leaves.length,1);const id=leaves[0]._id;
 assert.ok(new Date(leaves[0].departure)<=new Date());assert.ok(new Date(leaves[0].returnBy)>new Date());
 assert.equal((await call('patch','/leaves/'+id+'/decision',token,{decision:'approved'})).status,403);
 token=await role('warden',token);assert.equal((await call('get','/auth/me',first)).status,401);
 assert.equal((await call('get','/leaves',token)).body.leaves[0]._id,id);
 assert.equal((await call('patch','/leaves/'+id+'/decision',token,{decision:'approved'})).status,200);
 token=await role('student',token);const pass=await call('get','/leaves/'+id+'/pass',token);assert.equal(pass.status,200);assert.match(pass.body.qr,/^data:image\/png;base64,/);
 const qr=pass.body.token;token=await role('guard',token);
 assert.equal((await call('post','/gate/validate',token,{token:qr})).body.nextAction,'checkout');
 assert.equal((await call('post','/gate/record',token,{token:qr,action:'return'})).status,409);
 assert.equal((await call('post','/gate/record',token,{token:qr,action:'checkout'})).status,200);
 assert.equal((await call('post','/gate/record',token,{token:qr,action:'checkout'})).status,409);
 assert.equal((await call('post','/gate/validate',token,{token:qr})).body.nextAction,'return');
 assert.equal((await call('post','/gate/record',token,{token:qr,action:'return'})).status,200);
 assert.equal((await call('post','/gate/validate',token,{token:qr})).status,409);
 const record=await Leave.findById(id);assert.equal(record.status,'returned');assert.ok(record.checkedOutAt&&record.returnedAt);
 token=await role('admin',token);assert.equal((await call('get','/admin/students',token)).body.students.length,1);
 for(const [method,path,body]of [['post','/admin/students',{}],['post','/admin/students/import',{csv:'bad'}],['post','/auth/change-password',{}],['post','/auth/forgot-password',{}]])assert.equal((await call(method,path,token,body)).status,403);
 assert.equal((await call('get','/leaves',token)).status,403);
 const old=token;assert.equal((await call('post','/auth/demo/logout',token)).status,200);assert.equal((await call('get','/auth/me',old)).status,401);
});
test('demo queries hide unmarked records and ordinary deployments reject demo sessions',async()=>{
 const real=await User.create({email:'never-expose@fictional.example',name:'Unmarked sentinel',role:'student',password:'not-a-usable-hash'});
 const hidden=await Leave.create({student:real._id,destination:'Hidden sentinel',reason:'Isolation test fixture',departure:new Date(),returnBy:new Date(Date.now()+60000)});
 let token=await role('warden');assert.ok(!(await call('get','/leaves',token)).body.leaves.some(l=>l._id===hidden.id));
 assert.equal((await call('patch','/leaves/'+hidden.id+'/decision',token,{decision:'approved'})).status,409);
 token=await role('admin',token);assert.ok(!(await call('get','/admin/students',token)).body.students.some(s=>s.id===real.id));
 const normal=createApp({...settings,demoMode:false});errors(normal);assert.equal((await request(normal).get('/api/auth/me').set('Authorization','Bearer '+token)).status,401);
 await assert.rejects(()=>prepareProfessorDemo(settings),/unmarked/);
});
test('demo authentication validates input, blocks foreign origins and rate limits abuse',async()=>{
 assert.equal((await call('post','/auth/demo',null,{role:'root'})).status,400);
 assert.equal((await request(app).post('/api/auth/demo').set('Origin','https://unrelated.example').send({role:'admin'})).status,403);
 let last;for(let i=0;i<41;i++)last=await call('post','/auth/demo',null,{role:'invalid'});assert.equal(last.status,429);assert.match(last.body.message,/limit/);
});
